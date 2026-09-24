import { Plugin, Setting, showMessage } from "siyuan";
import type { TPluginDataChangeReason } from "siyuan";
import { BgRenderer } from "./renderer";
import { LocalServer } from "./server";
import { VIDEO_EXT, detectRoots, scanRoots } from "./we";
import { loadState, onExternalDataChange, saveState, state, persistNow } from "./store";
import { openSettingsDialog } from "./settings";
import { openQuickPanel } from "./quick";
import { openLibrary } from "./library";
import { injectUiStyle, removeUiStyle } from "./uistyle";
import { setI18n, t } from "./i18n";
import { iconWeBg } from "./icon";
import { fileUrl, isDesktop } from "./node";
import type { Host } from "./host";
import type { ResolvedWallpaper, WEWallpaper } from "./types";

const URL_VIDEO_EXT = new Set([".mp4", ".webm", ".m4v", ".mov", ".avi", ".ogv", ".mkv"]);
const URL_IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".avif"]);

export default class WallpaperEngineBg extends Plugin implements Host {
    private renderer = new BgRenderer();
    private server: LocalServer | null = null;
    private libCache: WEWallpaper[] = [];
    private rotateTimer: ReturnType<typeof setInterval> | null = null;
    private onVisibility = (): void => this.syncVisibility();

    async onload(): Promise<void> {
        setI18n(this.i18n as Record<string, string>);
        injectUiStyle();
        await loadState(this);

        if (isDesktop()) {
            this.server = new LocalServer();
            if (!(await this.server.start())) this.server = null;
        }

        this.renderer.mount();
        document.addEventListener("visibilitychange", this.onVisibility);
        this.addIcons(iconWeBg);
        this.registerCommands();
        // 备用的原生设置容器（实际展示走自定义 minimal 设置页）
        try {
            this.setting = new Setting({});
        } catch (err) {
            console.warn("[we-bg] init setting failed:", err);
        }

        if (state.common.enabled) {
            await this.refreshLibrary();
            if (state.common.randomOnStart) {
                this.randomWallpaper();
            } else {
                await this.applyCurrent();
            }
            this.startRotation();
        }
    }

    /**
     * 插件存储数据变化（跨窗口 / 跨设备同步）时思源会调用它。
     *
     * 必须实现：**没覆盖基类实现时思源会直接重载整个插件**，而重载会再次执行
     * onunload → 写盘 → 存储变更 → 再重载，形成无限重载循环；
     * 循环中读到半成品文件就会回退到默认值，看起来就是「设置不持久化」。
     */
    async onDataChanged(reason?: TPluginDataChangeReason): Promise<void> {
        const changed = await onExternalDataChange();
        if (!changed) return;
        // 只重新套用，不写回（基线已在 store 里同步）
        this.renderer.setVisible(state.common.enabled);
        if (state.common.enabled) {
            this.renderer.applyUI(state.common);
            this.renderer.applyLook(state.common);
        } else {
            this.renderer.restoreUI();
        }
        this.startRotation();
        void reason;
    }

    onLayoutReady(): void {
        this.addTopBar({
            icon: "iconWeBg",
            title: t("qpTitle"),
            position: "right",
            callback: () => this.openQuickPanel(),
            contextMenu: (menu: any) => {
                menu.addItem({
                    label: t("libTitle"),
                    icon: "iconImage",
                    click: () => this.openLibrary(),
                });
                menu.addItem({
                    label: t("qpRandom"),
                    icon: "iconRefresh",
                    click: () => this.randomWallpaper(),
                });
                menu.addItem({
                    label: state.common.enabled ? t("cmdDisable") : t("cmdEnable"),
                    icon: "iconPlay",
                    click: () => this.toggleEnabled(),
                });
            },
        });
    }

    /** 插件设置（minimal 风格自定义页） */
    openSetting(): void {
        openSettingsDialog(this);
    }

    async onunload(): Promise<void> {
        document.removeEventListener("visibilitychange", this.onVisibility);
        this.stopRotation();
        this.renderer.unmount();
        this.server?.stop();
        this.server = null;
        removeUiStyle();
        await persistNow();
    }

    /* ---------------- 命令 ---------------- */

    private registerCommands(): void {
        this.addCommand({ langKey: "cmdToggle", callback: () => this.toggleEnabled() });
        this.addCommand({ langKey: "cmdQuick", callback: () => this.openQuickPanel() });
        this.addCommand({ langKey: "cmdLibrary", callback: () => this.openLibrary() });
        this.addCommand({ langKey: "cmdRandom", callback: () => this.randomWallpaper() });
        this.addCommand({ langKey: "cmdNext", callback: () => this.stepWallpaper(1) });
        this.addCommand({ langKey: "cmdPrev", callback: () => this.stepWallpaper(-1) });
        this.addCommand({ langKey: "cmdMaskDarker", callback: () => this.nudgeMask(0.05) });
        this.addCommand({ langKey: "cmdMaskBrighter", callback: () => this.nudgeMask(-0.05) });
        this.addCommand({ langKey: "cmdBlurMore", callback: () => this.nudgeBlur(1) });
        this.addCommand({ langKey: "cmdBlurLess", callback: () => this.nudgeBlur(-1) });
    }

    private toggleEnabled(): void {
        state.common.enabled = !state.common.enabled;
        this.applyLook();
        if (state.common.enabled) {
            void this.applyCurrent();
            this.startRotation();
        } else {
            this.stopRotation();
        }
        showMessage(state.common.enabled ? t("cmdEnable") : t("cmdDisable"), 2000);
    }

    private nudgeMask(delta: number): void {
        state.common.maskEnabled = true;
        state.common.maskOpacity = clamp(state.common.maskOpacity + delta, 0, 1);
        this.applyLook();
    }

    private nudgeBlur(delta: number): void {
        state.common.blur = clamp(state.common.blur + delta, 0, 40);
        this.applyLook();
    }

    /* ---------------- Host 实现 ---------------- */

    applyLook(): void {
        saveState();
        this.renderer.setVisible(state.common.enabled);
        if (state.common.enabled) {
            this.renderer.applyUI(state.common);
            if (this.renderer.currentKind) {
                this.renderer.applyLook(state.common);
            } else {
                void this.applyCurrent();
            }
        } else {
            this.renderer.restoreUI();
        }
        this.startRotation();
    }

    async library(): Promise<WEWallpaper[]> {
        if (this.libCache.length === 0) await this.refreshLibrary();
        return this.libCache;
    }

    async refreshLibrary(): Promise<number> {
        try {
            if (!isDesktop()) {
                this.libCache = [];
                return 0;
            }
            if (state.device.workshopDirs.length === 0) {
                const detected = detectRoots();
                if (detected.length > 0) {
                    state.device.workshopDirs = detected;
                    saveState();
                }
            }
            this.libCache = await scanRoots(state.device.workshopDirs);
            return this.libCache.length;
        } catch (err) {
            console.warn("[we-bg] scan library failed:", err);
            this.libCache = [];
            return 0;
        }
    }

    currentWallpaper(): WEWallpaper | null {
        return state.device.wallpaper;
    }

    pickWallpaper(wp: WEWallpaper): void {
        state.device.wallpaper = wp;
        saveState();
        if (!wp.supported) {
            showMessage(t("libSceneNote"), 4000);
        }
        void this.applyCurrent();
    }

    randomWallpaper(): void {
        const pool = this.libCache.filter((wp) => wp.supported);
        const list = pool.length > 0 ? pool : this.libCache;
        if (list.length === 0) {
            showMessage(t("msgNoLibrary"), 3000);
            return;
        }
        const current = state.device.wallpaper;
        const candidates = list.length > 1 ? list.filter((wp) => wp.key !== current?.key) : list;
        const picked = candidates[Math.floor(Math.random() * candidates.length)];
        if (picked) this.pickWallpaper(picked);
    }

    stepWallpaper(step: number): void {
        const list = this.libCache.length > 0 ? this.libCache : [];
        if (list.length === 0) {
            showMessage(t("msgNoLibrary"), 3000);
            return;
        }
        const current = state.device.wallpaper;
        const idx = current ? list.findIndex((wp) => wp.key === current.key) : -1;
        const next = list[(((idx + step) % list.length) + list.length) % list.length];
        if (next) this.pickWallpaper(next);
    }

    togglePlay(): void {
        this.renderer.setUserPaused(!this.renderer.isUserPaused());
    }

    isPlaying(): boolean {
        return !this.renderer.isUserPaused();
    }

    openLibrary(): void {
        openLibrary(this);
    }

    openQuickPanel(): void {
        openQuickPanel(this);
    }

    isDesktopEnv(): boolean {
        return isDesktop();
    }

    previewUrl(wp: WEWallpaper): string {
        if (!wp.preview) return "";
        return this.toUrl(wp.preview, wp.dir);
    }

    /* ---------------- 渲染 ---------------- */

    async applyCurrent(): Promise<void> {
        try {
            const resolved = this.resolveCurrent();
            if (!resolved) return;
            this.renderer.show(resolved, state.common);
            this.renderer.setVisible(state.common.enabled);
        } catch (err) {
            console.warn("[we-bg] apply wallpaper failed:", err);
        }
    }

    private resolveCurrent(): ResolvedWallpaper | null {
        const cfg = state.common;
        if (cfg.urlWallpaper) {
            const kind = kindFromPath(cfg.urlWallpaper);
            return {
                key: `url||${cfg.urlWallpaper}`,
                title: cfg.urlWallpaper,
                kind,
                url: cfg.urlWallpaper,
                previewUrl: "",
                fallback: false,
            };
        }

        const wp = state.device.wallpaper;
        if (!wp) return null;

        // scene/application 只能回退到预览图；入口文件丢失时同样回退
        const entryMissing = wp.entry ? !isDesktop() || !fileExists(wp.entry) : true;
        const usePreview = (!wp.supported || entryMissing) && !!wp.preview;
        const target = usePreview ? wp.preview : wp.entry;
        if (!target) return null;

        const kind: ResolvedWallpaper["kind"] = usePreview
            ? "image"
            : wp.type === "web"
              ? "web"
              : wp.type === "video" || VIDEO_EXT.has(extOf(target))
                ? "video"
                : "image";

        return {
            key: wp.key,
            title: wp.title,
            kind,
            url: this.toUrl(target, wp.dir, kind === "web"),
            previewUrl: wp.preview ? this.toUrl(wp.preview, wp.dir) : "",
            fallback: usePreview && !wp.supported,
        };
    }

    private toUrl(abs: string, baseDir: string, web = false): string {
        if (/^https?:\/\//i.test(abs)) return abs;
        if (this.server) {
            const query = web ? { weMute: state.common.webMuted ? "1" : "0" } : undefined;
            return this.server.urlForFile(abs, baseDir || undefined, query);
        }
        return fileUrl(abs);
    }

    /* ---------------- 其它 ---------------- */

    private startRotation(): void {
        this.stopRotation();
        const minutes = state.common.rotateMinutes;
        if (!state.common.enabled || minutes <= 0) return;
        this.rotateTimer = setInterval(() => this.randomWallpaper(), minutes * 60000);
    }

    private stopRotation(): void {
        if (this.rotateTimer) clearInterval(this.rotateTimer);
        this.rotateTimer = null;
    }

    private syncVisibility(): void {
        if (!state.common.pauseWhenHidden) {
            this.renderer.setHiddenPaused(false);
            return;
        }
        this.renderer.setHiddenPaused(document.hidden);
    }
}

function clamp(v: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, v));
}

function extOf(p: string): string {
    const clean = p.split(/[?#]/)[0];
    const idx = clean.lastIndexOf(".");
    return idx >= 0 ? clean.slice(idx).toLowerCase() : "";
}

function kindFromPath(p: string): ResolvedWallpaper["kind"] {
    const ext = extOf(p);
    if (ext === ".html" || ext === ".htm") return "web";
    if (URL_VIDEO_EXT.has(ext)) return "video";
    if (URL_IMAGE_EXT.has(ext)) return "image";
    return "image";
}

function fileExists(abs: string): boolean {
    try {
        const fs = (window as any).require?.("fs");
        return !!fs && fs.existsSync(abs);
    } catch {
        return false;
    }
}
