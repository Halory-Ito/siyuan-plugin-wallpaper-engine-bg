import type { CommonConfig, PanelBg, PanelSurface, ResolvedWallpaper } from "./types";

/**
 * 背景渲染器。
 *
 * 图层结构（挂在 <html> 下、<body> 之外，避免受 body 透明度影响）：
 *
 *   <div id="we-bg">              固定铺满视口，z-index 负值，位于所有 UI 之下
 *     <div class="we-backdrop">   模糊填充层：blurfill 模式下用同一素材放大模糊铺底
 *     <div class="we-layer">      壁纸画面：video / img / iframe，承担 blur、brightness、saturate
 *     <div class="we-mask">       遮罩层：颜色 + 浓度，用来压暗或提亮画面
 *
 * 界面透明不改写主题 CSS 变量（改写会与主题刷新互相触发），而是按结构覆盖背景色。
 * 选择器依据思源 app/src/assets/scss/business/_layout.scss 与 protyle/_content.scss：
 *   .layout__center .layout-tab-container —— 内容区卡片背景
 *   .layout__dockl / __dockr / __dockb   —— 左/右/下侧边栏卡片背景
 *   .layout-tab-bar / .layout__empty     —— 标签栏 / 空白页签区
 *   .protyle / .protyle-preview          —— 编辑器面板
 */

/** 各界面结构：paint 为上色元素，flatten 为同结构内部需要置透明的元素（避免叠色变深） */
interface SurfaceSpec {
    paint: string;
    flatten: string;
}

export const SURFACE_SELECTORS: Record<PanelSurface, SurfaceSpec> = {
    // 内容区卡片（含空白页签区、停靠面板卡片）
    other: {
        paint: '.layout__center .layout-tab-container, .layout__empty, .layout-tab, [data-type="wnd"], .layout__panel, .b3-panel, .b3-list--background',
        flatten: "",
    },
    // 侧边栏（左/右/下停靠栏容器 + 图标栏）
    sidebar: {
        paint: ".layout__dockl, .layout__dockr, .layout__dockb, #dockLeft, #dockRight, #dockBottom, .dock, .layout--win, .layout--float",
        flatten: "",
    },
    // 编辑器（正文面板）；面包屑/顶部导航自带背景，拍平后跟随编辑器底色
    editor: {
        paint: ".protyle, .protyle-preview, .card__panel",
        flatten: ".protyle-breadcrumb, .protyle-title, .protyle-content, .protyle-wysiwyg, .protyle-scroll",
    },
    // 顶栏 / 标签页栏 / 状态栏
    chrome: {
        paint: "#toolbar, #status, .toolbar, .layout-tab-bar, .b3-tab-bar",
        flatten: "",
    },
    // 代码块（块级代码 + 行内代码；内部 .hljs / 操作栏拍平，避免叠色）
    code: {
        paint: ".code-block, code:not(.hljs)",
        flatten: ".hljs, code, .protyle-action",
    },
    // 文档树
    docTree: {
        paint: '[data-type="file"], .layout__panel[data-type="file"], .layout-tab[data-type="file"], .sy__file, #file',
        flatten: ".b3-list--background",
    },
    // 目录树（大纲）
    outline: {
        paint:
            '[data-type="outline"], .layout__panel[data-type="outline"], .layout-tab[data-type="outline"], .sy__outline, #outline',
        flatten: ".b3-list--background",
    },
};

/**
 * 规则生成顺序：后生成的优先（同一元素命中多个结构时，以更具体的结构为准）。
 * 例如 `.layout__panel[data-type="file"]` 同时命中 other 与 docTree，由 docTree 生效。
 */
const SURFACE_PRIORITY: PanelSurface[] = ["other", "sidebar", "editor", "chrome", "outline", "docTree", "code"];

const CSS = `
#we-bg {
    position: fixed;
    inset: 0;
    z-index: -1;
    overflow: hidden;
    pointer-events: none;
    background-color: #000;
}
#we-bg.we-off { display: none !important; }
#we-bg .we-layer {
    position: absolute;
    inset: 0;
    transform-origin: 50% 50%;
    will-change: filter, transform;
}
#we-bg .we-layer > img,
#we-bg .we-layer > video {
    display: block;
    width: 100%;
    height: 100%;
}
#we-bg .we-layer > iframe {
    display: block;
    width: 100%;
    height: 100%;
    border: 0;
    background-color: #000;
}
#we-bg .we-mask {
    position: absolute;
    inset: 0;
}
#we-bg .we-backdrop {
    position: absolute;
    inset: -48px;
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    filter: blur(28px) brightness(.86);
    transform: scale(1.06);
}
#we-bg .we-backdrop > video {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
}
html.we-bg-panels,
html.we-bg-panels body {
    background-color: transparent !important;
}
`;

export class BgRenderer {
    private styleEl: HTMLStyleElement | null = null;
    private panelStyleEl: HTMLStyleElement | null = null;
    private root: HTMLDivElement | null = null;
    private layer: HTMLDivElement | null = null;
    private backdrop: HTMLDivElement | null = null;
    private mask: HTMLDivElement | null = null;
    private media: HTMLElement | null = null;
    private backdropVideo: HTMLVideoElement | null = null;
    private syncTimer: ReturnType<typeof setInterval> | null = null;
    private kind: ResolvedWallpaper["kind"] | null = null;
    private wallpaperKey: string | null = null;
    private lastCfg: CommonConfig | null = null;
    private observer: MutationObserver | null = null;
    private userPaused = false;
    private hiddenPaused = false;

    get currentKind(): ResolvedWallpaper["kind"] | null {
        return this.kind;
    }

    /** 当前已渲染壁纸的稳定标识；用于判断是否需要重新加载素材 */
    get currentKey(): string | null {
        return this.wallpaperKey;
    }

    mount(): void {
        if (this.root) return;
        this.styleEl = document.createElement("style");
        this.styleEl.id = "we-bg-style";
        this.styleEl.textContent = CSS;
        document.head.append(this.styleEl);

        this.panelStyleEl = document.createElement("style");
        this.panelStyleEl.id = "we-bg-panels-style";
        document.head.append(this.panelStyleEl);

        this.mask = document.createElement("div");
        this.mask.className = "we-mask";
        this.backdrop = document.createElement("div");
        this.backdrop.className = "we-backdrop";
        this.backdrop.style.display = "none";
        this.layer = document.createElement("div");
        this.layer.className = "we-layer";
        this.root = document.createElement("div");
        this.root.id = "we-bg";
        this.root.append(this.backdrop, this.layer, this.mask);
        // 挂在 <html> 下而不是 <body>：body 的 opacity 不会影响背景层
        document.documentElement.insertBefore(this.root, document.head);

        // 深/浅色切换时刷新「跟随主题色」的 rgba 兜底值（只观察主题属性，不观察 class，避免自我触发）
        this.observer = new MutationObserver(() => {
            if (this.lastCfg?.uiMode === "panels") this.applyUI(this.lastCfg);
        });
        this.observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["data-theme-mode", "data-light-theme", "data-dark-theme"],
        });
    }

    unmount(): void {
        this.observer?.disconnect();
        this.observer = null;
        this.clearMedia();
        this.root?.remove();
        this.styleEl?.remove();
        this.panelStyleEl?.remove();
        this.root = null;
        this.layer = null;
        this.mask = null;
        this.backdrop = null;
        this.styleEl = null;
        this.panelStyleEl = null;
        this.restoreUI();
    }

    /** 显示一张壁纸 */
    show(resolved: ResolvedWallpaper, cfg: CommonConfig): void {
        if (!this.layer || !this.backdrop) return;
        this.clearMedia();
        this.kind = resolved.kind;
        this.wallpaperKey = resolved.key;

        // blurfill：同一素材放大模糊铺底，前景完整显示，窗口比例不匹配也不裁剪
        const useBackdrop = cfg.fit === "blurfill" && resolved.kind !== "web";

        if (resolved.kind === "video") {
            const video = createVideo(resolved.url, cfg);
            this.media = video;
            if (useBackdrop) {
                this.backdropVideo = createVideo(resolved.url, { ...cfg, muted: true, volume: 0 });
                this.backdrop.append(this.backdropVideo);
                this.startSync(video, this.backdropVideo);
            }
        } else if (resolved.kind === "web") {
            const iframe = document.createElement("iframe");
            iframe.src = resolved.url;
            iframe.setAttribute("allow", "autoplay; fullscreen");
            iframe.setAttribute("scrolling", "no");
            this.media = iframe;
        } else {
            const img = document.createElement("img");
            img.src = resolved.url;
            img.alt = resolved.title;
            this.media = img;
            if (useBackdrop) {
                this.backdrop.style.backgroundImage = `url("${resolved.url}")`;
            }
        }

        this.backdrop.style.display = useBackdrop ? "" : "none";
        this.layer.append(this.media);
        this.applyLook(cfg);
    }

    clearMedia(): void {
        this.stopSync();
        const media = this.media;
        const bgVideo = this.backdropVideo;
        this.media = null;
        this.backdropVideo = null;
        this.kind = null;
        this.wallpaperKey = null;
        if (this.backdrop) {
            this.backdrop.style.display = "none";
            this.backdrop.style.backgroundImage = "";
        }
        for (const node of [media, bgVideo]) {
            if (!node) continue;
            if (node instanceof HTMLVideoElement) {
                try {
                    node.pause();
                } catch {
                    /* ignore */
                }
                node.removeAttribute("src");
                node.load();
            }
            if (node instanceof HTMLIFrameElement) node.src = "about:blank";
            node.remove();
        }
    }

    /** 画面 + 遮罩 */
    applyLook(cfg: CommonConfig): void {
        if (!this.layer || !this.mask) return;
        this.lastCfg = cfg;

        const filters: string[] = [];
        if (cfg.brightness !== 1) filters.push(`brightness(${cfg.brightness})`);
        if (cfg.saturate !== 1) filters.push(`saturate(${cfg.saturate})`);
        if (cfg.blur > 0) filters.push(`blur(${cfg.blur}px)`);
        this.layer.style.filter = filters.join(" ");

        // 模糊会让边缘透出底色，放大一点点补偿
        const scale = cfg.blur > 0 ? 1 + Math.min(0.3, cfg.blur / 200) : 1;
        this.layer.style.transform = scale === 1 ? "" : `scale(${scale})`;

        this.mask.style.display = cfg.maskEnabled ? "" : "none";
        this.mask.style.backgroundColor = cfg.maskColor;
        this.mask.style.opacity = String(cfg.maskOpacity);

        const media = this.media;
        const objectFit = cfg.fit === "blurfill" ? "contain" : cfg.fit === "stretch" ? "fill" : cfg.fit;
        if (media instanceof HTMLImageElement || media instanceof HTMLVideoElement) {
            media.style.objectFit = objectFit;
            media.style.objectPosition = `${cfg.positionX}% ${cfg.positionY}%`;
        }
        if (media instanceof HTMLVideoElement) {
            media.muted = cfg.muted || cfg.volume <= 0;
            media.volume = cfg.muted ? 0 : cfg.volume;
            media.playbackRate = cfg.playbackRate;
            if (this.backdropVideo) this.backdropVideo.playbackRate = cfg.playbackRate;
        }
        if (this.backdrop) {
            this.backdrop.style.backgroundPosition = `${cfg.positionX}% ${cfg.positionY}%`;
        }
    }

    /** 界面透明：面板背景 / 整体透明 */
    applyUI(cfg: CommonConfig): void {
        this.restoreUI();
        if (cfg.uiMode === "panels") {
            if (this.panelStyleEl) this.panelStyleEl.textContent = buildPanelCss(cfg, readThemeBase());
            document.documentElement.classList.add("we-bg-panels");
        } else if (cfg.uiMode === "opacity") {
            document.body.style.opacity = String(1 - 0.5 * cfg.uiStrength);
        }
    }

    /** 清除本插件对全局样式的改动 */
    restoreUI(): void {
        document.documentElement.classList.remove("we-bg-panels");
        document.body.style.removeProperty("opacity");
        if (this.panelStyleEl) this.panelStyleEl.textContent = "";
    }

    setVisible(visible: boolean): void {
        this.root?.classList.toggle("we-off", !visible);
    }

    /** 播放控制（web 壁纸只能整体隐藏） */
    setUserPaused(paused: boolean): void {
        this.userPaused = paused;
        this.syncPlayback();
    }

    isUserPaused(): boolean {
        return this.userPaused;
    }

    setHiddenPaused(paused: boolean): void {
        this.hiddenPaused = paused;
        this.syncPlayback();
    }

    private syncPlayback(): void {
        const stopped = this.userPaused || this.hiddenPaused;
        const media = this.media;
        if (media instanceof HTMLVideoElement) {
            for (const v of [media, this.backdropVideo]) {
                if (!v) continue;
                if (stopped) {
                    try {
                        v.pause();
                    } catch {
                        /* ignore */
                    }
                } else {
                    v.play().catch(() => {});
                }
            }
        } else if (media instanceof HTMLIFrameElement) {
            media.style.visibility = stopped ? "hidden" : "";
        }
    }

    /** 模糊铺底的第二路视频与前景保持同步 */
    private startSync(master: HTMLVideoElement, slave: HTMLVideoElement): void {
        this.stopSync();
        this.syncTimer = setInterval(() => {
            if (master.paused || slave.paused) return;
            if (Math.abs(master.currentTime - slave.currentTime) > 0.12) {
                try {
                    slave.currentTime = master.currentTime;
                } catch {
                    /* ignore */
                }
            }
        }, 1000);
    }

    private stopSync(): void {
        if (this.syncTimer) clearInterval(this.syncTimer);
        this.syncTimer = null;
    }
}

function createVideo(url: string, cfg: CommonConfig): HTMLVideoElement {
    const video = document.createElement("video");
    video.src = url;
    video.loop = true;
    video.autoplay = true;
    video.playsInline = true;
    video.preload = "auto";
    video.muted = cfg.muted || cfg.volume <= 0;
    video.volume = cfg.muted ? 0 : cfg.volume;
    video.playbackRate = cfg.playbackRate;
    video.play().catch(() => {
        /* 自动播放被拦截时静默降级，画面停在首帧 */
    });
    return video;
}

/**
 * 生成面板背景覆盖样式。
 *
 * 注意：每个结构都必须输出规则（透明度 0 时输出 transparent），
 * 否则主题自己的不透明背景会残留，壁纸透不出来。
 *
 * @param themeBase 当前主题背景色（用于 rgba 兜底；color-mix 不可用时仍能生效）
 */
export function buildPanelCss(cfg: CommonConfig, themeBase = ""): string {
    const rules: string[] = [];
    const themeRgb = parseColor(themeBase);
    for (const surface of SURFACE_PRIORITY) {
        const spec = SURFACE_SELECTORS[surface];
        const bg: PanelBg | undefined = cfg.panels?.[surface];
        if (!bg) continue;
        const alpha = clamp(bg.alpha * cfg.uiStrength, 0, 1);
        const declarations =
            alpha <= 0
                ? "background-color: transparent !important"
                : bg.useTheme
                  ? themeRgb
                      ? // rgba 兜底 + color-mix 实时跟随主题（后者可用时覆盖前者）
                        `background-color: rgba(${themeRgb.join(", ")}, ${alpha.toFixed(3)}) !important; ` +
                        `background-color: color-mix(in srgb, var(--b3-theme-background) ${Math.round(alpha * 100)}%, transparent) !important`
                      : `background-color: color-mix(in srgb, var(--b3-theme-background) ${Math.round(alpha * 100)}%, transparent) !important`
                  : `background-color: ${hexToRgba(bg.color, alpha)} !important`;
        rules.push(`html.we-bg-panels ${spec.paint} { ${declarations} }`);
        // 拍平规则必须始终输出：即便本结构透明，内部自带背景的元素也不能残留
        if (spec.flatten) {
            rules.push(`html.we-bg-panels ${scopeDescendants(spec.paint, spec.flatten)} { background-color: transparent !important; }`);
        }
        // 自定义颜色可为深色模式单独配色（跟随主题色时自动适配，无需此规则）
        if (!bg.useTheme && alpha > 0 && bg.colorDark && bg.colorDark.toLowerCase() !== bg.color.toLowerCase()) {
            rules.push(
                `html[data-theme-mode="dark"].we-bg-panels ${spec.paint} { background-color: ${hexToRgba(bg.colorDark, alpha)} !important; }`
            );
        }
    }
    return rules.join("\n");
}

/** 把「内部置透明」限定在该结构自身的范围内，避免误伤其它结构 */
function scopeDescendants(paint: string, flatten: string): string {
    const roots = paint.split(",").map((s) => s.trim()).filter(Boolean);
    const inner = flatten.split(",").map((s) => s.trim()).filter(Boolean);
    const out: string[] = [];
    for (const root of roots) {
        for (const child of inner) {
            out.push(`${root} ${child}`);
        }
    }
    return out.join(", ");
}

/** 读取当前主题背景色，作为 color-mix 的 rgba 兜底 */
function readThemeBase(): string {
    try {
        return getComputedStyle(document.documentElement).getPropertyValue("--b3-theme-background").trim();
    } catch {
        return "";
    }
}

/** 解析 #rgb / #rrggbb / rgb() / rgba() 为 [r, g, b] */
function parseColor(value: string): [number, number, number] | null {
    const v = (value ?? "").trim();
    if (!v) return null;
    if (v.startsWith("#")) {
        let h = v.slice(1);
        if (h.length === 3) h = h.split("").map((c) => c + c).join("");
        if (h.length !== 6) return null;
        const num = parseInt(h, 16);
        if (isNaN(num)) return null;
        return [(num >> 16) & 0xff, (num >> 8) & 0xff, num & 0xff];
    }
    const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(v);
    if (m) return [Math.round(+m[1]), Math.round(+m[2]), Math.round(+m[3])];
    return null;
}

function hexToRgba(hex: string, alpha: number): string {
    const rgb = parseColor(hex) ?? [0, 0, 0];
    return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha.toFixed(3)})`;
}

function clamp(v: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, v));
}
