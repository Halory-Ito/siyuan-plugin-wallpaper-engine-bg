import { Dialog, showMessage } from "siyuan";
import { state, saveState, defaultPanels, resetCommon } from "./store";
import { detectRoots } from "./we";
import { t, tArgs } from "./i18n";
import type { Host } from "./host";
import type { PanelSurface } from "./types";
import {
    buttonEl,
    colorEl,
    el,
    fmtPercent,
    fmtPx,
    fmtRatio,
    paletteEl,
    rangeEl,
    rangeWithHandle,
    selectEl,
    switchEl,
    textEl,
} from "./ui";
import type { PaletteSwatch } from "./ui";

/**
 * 插件设置页（Minimal 风格自定义对话框）。
 *
 * 排版原则：无卡片、无边框块，只用发丝分割线 + 留白分组；
 * 左列标签（小字灰色说明），右列控件右对齐成一列。
 */

const SURFACE_ORDER: PanelSurface[] = ["editor", "docTree", "outline", "code", "sidebar", "chrome", "other"];

/** 代码块单独成区（调色板直选），不再出现在通用结构列表里，避免同一配置出现两组控件 */
const SURFACE_LIST: PanelSurface[] = SURFACE_ORDER.filter((s) => s !== "code");

/** 选中色块时若当前完全透明，自动提升到的不透明度，避免「点了没反应」 */
const CODE_PICK_ALPHA = 0.85;

const SURFACE_KEY: Record<PanelSurface, string> = {
    editor: "sfEditor",
    docTree: "sfDocTree",
    outline: "sfOutline",
    code: "sfCode",
    sidebar: "sfSidebar",
    chrome: "sfChrome",
    other: "sfOther",
};

export function openSettingsDialog(host: Host): void {
    const body = el("div", { class: "we-settings" });
    let dialog: Dialog | null = null;

    /**
     * 整页重建。预设 / 恢复默认会一次性改动很多项，重建可保证所有控件与高亮都跟着变
     * （否则滑块会停在旧值上，看起来像没生效）。
     */
    const render = (): void => {
        body.replaceChildren(
            section(
                t("secGeneral"),
                row(t("stEnable"), switchEl(state.common.enabled, (v) => {
                    state.common.enabled = v;
                    host.applyLook();
                }), t("stEnableDesc")),
                row(t("stRotate"), rangeEl({
                    min: 0, max: 120, step: 5, value: state.common.rotateMinutes,
                    format: (v) => (v === 0 ? t("stRotateOff") : tArgs("stRotateMinutes", { minutes: Math.round(v) })),
                    onInput: (v) => { state.common.rotateMinutes = v; host.applyLook(); },
                }), t("stRotateDesc")),
                row(t("stRandomOnStart"), switchEl(state.common.randomOnStart, (v) => {
                    state.common.randomOnStart = v;
                    saveState();
                }), t("stRandomOnStartDesc"))
            ),
            buildSourceSection(host),
            section(
                t("secPicture"),
                row(t("stFit"), selectEl(state.common.fit, [
                    { value: "cover", label: t("stFitCover") },
                    { value: "blurfill", label: t("stFitBlurfill") },
                    { value: "contain", label: t("stFitContain") },
                    { value: "stretch", label: t("stFitStretch") },
                ], (v) => { state.common.fit = v as typeof state.common.fit; host.applyLook(); }), t("stFitDesc")),
                row(t("stPosition"), el("div", { class: "we-inline" },
                    rangeEl({
                        min: 0, max: 100, step: 1, value: state.common.positionX,
                        format: (v) => `X ${Math.round(v)}%`,
                        onInput: (v) => { state.common.positionX = v; host.applyLook(); },
                    }),
                    rangeEl({
                        min: 0, max: 100, step: 1, value: state.common.positionY,
                        format: (v) => `Y ${Math.round(v)}%`,
                        onInput: (v) => { state.common.positionY = v; host.applyLook(); },
                    })
                ), t("stPositionDesc")),
                row(t("stBlur"), rangeEl({
                    min: 0, max: 40, step: 1, value: state.common.blur, format: fmtPx,
                    onInput: (v) => { state.common.blur = v; host.applyLook(); },
                }), t("stBlurDesc")),
                row(t("stBrightness"), rangeEl({
                    min: 0.2, max: 1.6, step: 0.05, value: state.common.brightness, format: fmtRatio,
                    onInput: (v) => { state.common.brightness = v; host.applyLook(); },
                }), t("stBrightnessDesc")),
                row(t("stSaturate"), rangeEl({
                    min: 0, max: 2, step: 0.05, value: state.common.saturate, format: fmtRatio,
                    onInput: (v) => { state.common.saturate = v; host.applyLook(); },
                }), t("stSaturateDesc")),
                row(t("stMask"), switchEl(state.common.maskEnabled, (v) => {
                    state.common.maskEnabled = v;
                    host.applyLook();
                }), t("stMaskDesc")),
                row(t("stMaskColor"), maskColorControl(host), t("stMaskColorDesc")),
                row(t("stMaskOpacity"), rangeEl({
                    min: 0, max: 1, step: 0.01, value: state.common.maskOpacity, format: fmtPercent,
                    onInput: (v) => { state.common.maskOpacity = v; host.applyLook(); },
                }), t("stMaskOpacityDesc"))
            ),
            buildPanelsSection(host, render),
            buildCodeSection(host),
            section(
                t("secPlayback"),
                row(t("stMute"), switchEl(state.common.muted, (v) => {
                    state.common.muted = v;
                    host.applyLook();
                }), t("stMuteDesc")),
                row(t("stVolume"), rangeEl({
                    min: 0, max: 1, step: 0.05, value: state.common.volume, format: fmtPercent,
                    onInput: (v) => {
                        state.common.volume = v;
                        if (v > 0) state.common.muted = false;
                        host.applyLook();
                    },
                }), t("stVolumeDesc")),
                row(t("stRate"), rangeEl({
                    min: 0.25, max: 2, step: 0.05, value: state.common.playbackRate, format: fmtRatio,
                    onInput: (v) => { state.common.playbackRate = v; host.applyLook(); },
                }), t("stRateDesc")),
                row(t("stPauseHidden"), switchEl(state.common.pauseWhenHidden, (v) => {
                    state.common.pauseWhenHidden = v;
                    host.applyLook();
                }), t("stPauseHiddenDesc")),
                row(t("stWebMute"), switchEl(state.common.webMuted, (v) => {
                    state.common.webMuted = v;
                    host.applyLook();
                }), t("stWebMuteDesc"))
            ),
            section(
                t("secMisc"),
                row(t("stQuick"), el("div", { class: "we-inline we-nowrap" },
                    buttonEl(t("qpTitle"), () => host.openQuickPanel()),
                    buttonEl(t("libTitle"), () => host.openLibrary())
                ), t("stQuickDesc")),
                row(t("stReset"), buttonEl(t("stResetBtn"), () => {
                    resetCommon();
                    render();
                    showMessage(t("stResetDone"), 2000);
                }), t("stResetDesc")),
                el("div", { class: "we-srow we-srow--hint" },
                    el("div", { class: "we-sinfo" }, el("div", { class: "we-shint" }, t("stShortcuts"))))
            )
        );
    };

    render();

    dialog = new Dialog({
        title: t("stTitle"),
        content: '<div class="we-settings-mount"></div>',
        width: "min(680px, 94vw)",
        height: "min(760px, 88vh)",
        destroyCallback: () => {
            saveState();
            dialog = null;
        },
    });
    dialog.element.querySelector(".we-settings-mount")?.append(body);
}

/* ---------------- 各分区 ---------------- */

function buildSourceSection(host: Host): HTMLElement {
    const currentLabel = el("span", { class: "we-status" }, host.currentWallpaper()?.title ?? t("stNone"));
    const libStatus = el("span", { class: "we-status" });
    let dirsArea: HTMLTextAreaElement | null = null;

    const dirs = textEl(
        state.device.workshopDirs.join("\n"),
        t("stLibraryPlaceholder"),
        (v) => {
            state.device.workshopDirs = v.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
            saveState();
        },
        true
    ) as HTMLTextAreaElement;
    dirs.rows = 3;
    dirsArea = dirs;

    return section(
        t("secSource"),
        columnRow(t("stLibrary"), dirs, t("stLibraryDesc")),
        row(t("stLibraryActions"), el("div", { class: "we-inline we-nowrap" },
            buttonEl(t("stDetect"), () => {
                const roots = detectRoots();
                state.device.workshopDirs = roots;
                if (dirsArea) dirsArea.value = roots.join("\n");
                saveState();
                showMessage(tArgs("stDetected", { count: roots.length }), 3000);
            }),
            buttonEl(t("stRescan"), () => {
                void host
                    .refreshLibrary()
                    .then((count) => {
                        libStatus.textContent = tArgs("libCount", { count });
                        showMessage(tArgs("stDetected", { count }), 3000);
                    })
                    .catch(() => {
                        libStatus.textContent = t("msgNoLibrary");
                    });
            }),
            libStatus
        ), t("stLibraryActionsDesc")),
        row(t("stWallpaper"), el("div", { class: "we-inline we-nowrap" },
            buttonEl(t("stPick"), () => host.openLibrary()),
            buttonEl(t("qpRandom"), () => host.randomWallpaper()),
            currentLabel
        ), t("stWallpaperDesc")),
        row(t("stUrl"), textEl(state.common.urlWallpaper, "https://example.com/wallpaper.mp4", (v) => {
            state.common.urlWallpaper = v.trim();
            host.applyLook();
        }), t("stUrlDesc"))
    );
}

function buildPanelsSection(host: Host, rerender: () => void): HTMLElement {
    const surfaces = el("div", { class: "we-surface-list" });
    for (const surface of SURFACE_LIST) {
        surfaces.append(buildSurfaceRow(surface, host));
    }
    return section(
        t("secPanels"),
        row(t("stUIMode"), selectEl(state.common.uiMode, [
            { value: "panels", label: t("stUIModePanels") },
            { value: "opacity", label: t("stUIModeOpacity") },
            { value: "off", label: t("stUIModeOff") },
        ], (v) => { state.common.uiMode = v as typeof state.common.uiMode; host.applyLook(); }), t("stUIModeDesc")),
        row(t("stUIStrength"), rangeEl({
            min: 0, max: 1, step: 0.05, value: state.common.uiStrength, format: fmtPercent,
            onInput: (v) => { state.common.uiStrength = v; host.applyLook(); },
        }), t("stUIStrengthDesc")),
        columnRow(t("sfTitle"), surfaces, t("sfDesc")),
        row(t("sfPreset"), el("div", { class: "we-inline we-nowrap" },
            presetButton("glass", host, rerender),
            presetButton("clear", host, rerender),
            presetButton("opaque", host, rerender)
        ), t("sfPresetDesc"))
    );
}

/** 一行结构背景设置：来源（主题色 / 自定义）+ 浅色 / 深色颜色 + 不透明度 */
function buildSurfaceRow(surface: PanelSurface, host: Host): HTMLElement {
    const bg = state.common.panels[surface] ?? defaultPanels()[surface];
    const toCustom = (): void => {
        bg.useTheme = false;
        select.value = "custom";
        host.applyLook();
    };
    const colorInput = colorEl(bg.color, (v) => { bg.color = v; toCustom(); });
    colorInput.title = t("sfColorLight");
    const colorDarkInput = colorEl(bg.colorDark || bg.color, (v) => { bg.colorDark = v; toCustom(); });
    colorDarkInput.title = t("sfColorDark");
    const select = selectEl(bg.useTheme ? "theme" : "custom", [
        { value: "theme", label: t("sfTheme") },
        { value: "custom", label: t("sfCustom") },
    ], (v) => { bg.useTheme = v === "theme"; host.applyLook(); });
    const alpha = rangeEl({
        min: 0, max: 1, step: 0.05, value: bg.alpha, format: fmtPercent,
        onInput: (v) => { bg.alpha = v; host.applyLook(); },
    });
    return el("div", { class: "we-surface-row" },
        el("div", { class: "we-slabel" }, t(SURFACE_KEY[surface])),
        el("div", { class: "we-sctl" }, select, colorInput, colorDarkInput, alpha));
}

/** 代码块背景：调色板直选 + 自定义颜色 + 不透明度（与结构列表里的 code 共用同一份配置） */
function buildCodeSection(host: Host): HTMLElement {
    const bg = (state.common.panels.code ??= defaultPanels().code);

    const palette = paletteEl(codeSwatches(), paletteValue(bg), (value) => {
        if (value === "transparent") {
            bg.alpha = 0;
        } else if (value === "theme") {
            bg.useTheme = true;
            if (bg.alpha <= 0) bg.alpha = CODE_PICK_ALPHA;
        } else {
            const sw = CODE_SWATCHES.find((s) => s.value === value);
            if (sw?.color) {
                bg.useTheme = false;
                bg.color = sw.color;
                bg.colorDark = sw.colorDark ?? sw.color;
                if (bg.alpha <= 0) bg.alpha = CODE_PICK_ALPHA;
            }
        }
        sync();
        host.applyLook();
    });

    const modeSelect = selectEl(bg.useTheme ? "theme" : "custom", [
        { value: "theme", label: t("sfTheme") },
        { value: "custom", label: t("sfCustom") },
    ], (v) => {
        bg.useTheme = v === "theme";
        sync();
        host.applyLook();
    });

    const lightInput = colorEl(bg.color, (v) => {
        bg.color = v;
        bg.useTheme = false;
        if (bg.alpha <= 0) bg.alpha = CODE_PICK_ALPHA;
        sync();
        host.applyLook();
    });
    lightInput.title = t("sfColorLight");

    const darkInput = colorEl(bg.colorDark || bg.color, (v) => {
        bg.colorDark = v;
        bg.useTheme = false;
        if (bg.alpha <= 0) bg.alpha = CODE_PICK_ALPHA;
        sync();
        host.applyLook();
    });
    darkInput.title = t("sfColorDark");

    const alpha = rangeWithHandle({
        min: 0, max: 1, step: 0.05, value: bg.alpha, format: fmtPercent,
        onInput: (v) => {
            bg.alpha = v;
            palette.set(paletteValue(bg));
            host.applyLook();
        },
    });

    const sync = (): void => {
        palette.set(paletteValue(bg));
        modeSelect.value = bg.useTheme ? "theme" : "custom";
        lightInput.value = bg.color;
        darkInput.value = bg.colorDark || bg.color;
        alpha.set(bg.alpha);
    };

    return section(
        t("secCode"),
        columnRow(t("codePalette"), palette.root, t("codePaletteDesc")),
        row(t("codeMode"), modeSelect, t("codeModeDesc")),
        row(t("codeColor"), el("div", { class: "we-code-color" }, lightInput, darkInput), t("codeColorDesc")),
        row(t("codeOpacity"), alpha.root, t("codeOpacityDesc"))
    );
}

interface CodeSwatch extends PaletteSwatch {
    /** 深色模式颜色；缺省时与 color 相同 */
    colorDark?: string;
}

const CODE_SWATCHES: CodeSwatch[] = [
    { value: "transparent", kind: "transparent", title: "codeSwTransparent" },
    { value: "theme", kind: "theme", title: "codeSwTheme" },
    { value: "dark", color: "#1f2430", title: "codeSwDark" },
    { value: "slate", color: "#2a3340", title: "codeSwSlate" },
    { value: "black", color: "#000000", title: "codeSwBlack" },
    { value: "light", color: "#f5f6f7", colorDark: "#2b2d30", title: "codeSwLight" },
    { value: "cream", color: "#f6f2e8", colorDark: "#3a352b", title: "codeSwCream" },
    { value: "white", color: "#ffffff", title: "codeSwWhite" },
];

/** 色块的 title 走 i18n，且只在打开设置页时取值，避免语言切换后残留旧文案 */
function codeSwatches(): PaletteSwatch[] {
    return CODE_SWATCHES.map((s) => ({ ...s, title: t(s.title) }));
}

/** 当前配置对应的选中色块；完全透明 / 跟随主题 / 自定义色各有对应值 */
function paletteValue(bg: { useTheme: boolean; color: string; alpha: number }): string {
    if (bg.alpha <= 0) return "transparent";
    if (bg.useTheme) return "theme";
    const color = (bg.color || "").toLowerCase();
    return CODE_SWATCHES.find((s) => s.color?.toLowerCase() === color)?.value ?? "custom";
}

type PanelPreset = "glass" | "clear" | "opaque";

/**
 * 预设定义。
 * alpha 会再乘以 uiStrength，所以「完全不透明」必须同时把整体强度拉满，否则只有 40%。
 * 「全透明」只改 alpha（0 乘任何强度都是 0），保留用户已经调好的颜色，不清空自定义色。
 */
const PANEL_PRESETS: Record<PanelPreset, { uiStrength?: number; useTheme?: boolean; alpha?: number }> = {
    glass: { uiStrength: 1, useTheme: true, alpha: 0.6 },
    clear: { alpha: 0 },
    opaque: { uiStrength: 1, alpha: 1 },
};

const PRESET_LABEL: Record<PanelPreset, string> = {
    glass: "sfPresetGlass",
    clear: "sfPresetClear",
    opaque: "sfPresetOpaque",
};

/** 当前配置对应的预设（按生效后的不透明度判定）；不匹配任何预设时返回 null */
function activePreset(): PanelPreset | null {
    if (state.common.uiMode !== "panels") return null;
    const effective = (surface: PanelSurface): number => {
        const bg = state.common.panels[surface];
        return bg ? bg.alpha * state.common.uiStrength : 0;
    };
    const all = (pred: (alpha: number, surface: PanelSurface) => boolean): boolean =>
        SURFACE_ORDER.every((s) => pred(effective(s), s));
    if (all((a) => a <= 0.001)) return "clear";
    if (all((a) => a >= 0.999)) return "opaque";
    if (all((a, s) => state.common.panels[s]?.useTheme === true && Math.abs(a - 0.6) < 0.02)) return "glass";
    return null;
}

function presetButton(preset: PanelPreset, host: Host, rerender: () => void): HTMLElement {
    const on = activePreset() === preset;
    const btn = buttonEl(t(PRESET_LABEL[preset]), () => {
        applyPanelPreset(preset);
        host.applyLook();
        rerender();
    });
    btn.classList.toggle("we-preset-on", on);
    btn.setAttribute("aria-pressed", String(on));
    return btn;
}

function applyPanelPreset(preset: PanelPreset): void {
    const spec = PANEL_PRESETS[preset];
    if (spec.uiStrength !== undefined) state.common.uiStrength = spec.uiStrength;
    const defaults = defaultPanels();
    for (const surface of SURFACE_ORDER) {
        const bg = (state.common.panels[surface] ??= { ...defaults[surface] });
        if (spec.useTheme !== undefined) bg.useTheme = spec.useTheme;
        if (spec.alpha !== undefined) bg.alpha = spec.alpha;
    }
    state.common.uiMode = "panels";
    saveState();
    showMessage(t("sfPresetApplied"), 2000);
}

/* ---------------- minimal 排版原语 ---------------- */

function section(title: string, ...rows: HTMLElement[]): HTMLElement {
    return el("section", { class: "we-sec" }, el("h3", { class: "we-sec-title" }, title), ...rows);
}

function row(label: string, control: HTMLElement | HTMLElement[], hint?: string): HTMLElement {
    const info = el("div", { class: "we-sinfo" }, el("div", { class: "we-slabel" }, label));
    if (hint) info.append(el("div", { class: "we-shint" }, hint));
    const ctl = el("div", { class: "we-sctl we-nowrap" });
    ctl.append(...(Array.isArray(control) ? control : [control]));
    return el("div", { class: "we-srow" }, info, ctl);
}

function columnRow(label: string, control: HTMLElement, hint?: string): HTMLElement {
    const info = el("div", { class: "we-sinfo" }, el("div", { class: "we-slabel" }, label));
    if (hint) info.append(el("div", { class: "we-shint" }, hint));
    return el("div", { class: "we-srow we-srow--column" }, info, control);
}

function maskColorControl(host: Host): HTMLElement {
    const input = colorEl(state.common.maskColor, (v) => {
        state.common.maskColor = v;
        host.applyLook();
    });
    return el("div", { class: "we-inline we-nowrap" },
        input,
        buttonEl(t("stMaskPresetDark"), () => {
            state.common.maskColor = "#000000";
            input.value = "#000000";
            host.applyLook();
        }),
        buttonEl(t("stMaskPresetLight"), () => {
            state.common.maskColor = "#ffffff";
            input.value = "#ffffff";
            host.applyLook();
        })
    );
}
