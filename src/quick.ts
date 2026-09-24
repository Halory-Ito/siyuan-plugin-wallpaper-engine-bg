import { Dialog } from "siyuan";
import { state, saveState } from "./store";
import { t } from "./i18n";
import type { Host } from "./host";
import { buttonEl, colorEl, el, fmtPercent, fmtPx, fmtRatio, rangeEl, switchEl } from "./ui";

/**
 * 快速调节面板：悬停顶栏按钮即可微调亮度（遮罩）、模糊度等，实时生效。
 */
export function openQuickPanel(host: Host): void {
    const cfg = state.common;
    let dialog: Dialog | null = null;

    const body = el("div", { class: "we-quick" });

    const titleEl = el("div", { class: "we-quick-title" }, host.currentWallpaper()?.title ?? t("qpNoWallpaper"));

    const row = (label: string, control: HTMLElement): HTMLElement =>
        el("div", { class: "we-row" }, el("span", { class: "we-label" }, label), control);

    // 遮罩 = 亮度调节
    const maskOpacity = rangeEl({
        min: 0,
        max: 1,
        step: 0.01,
        value: cfg.maskOpacity,
        format: fmtPercent,
        onInput: (v) => {
            cfg.maskOpacity = v;
            host.applyLook();
        },
    });
    const maskColor = colorEl(cfg.maskColor, (v) => {
        cfg.maskColor = v;
        host.applyLook();
    });
    const maskToggle = switchEl(cfg.maskEnabled, (v) => {
        cfg.maskEnabled = v;
        host.applyLook();
    });

    const blur = rangeEl({
        min: 0,
        max: 40,
        step: 1,
        value: cfg.blur,
        format: fmtPx,
        onInput: (v) => {
            cfg.blur = v;
            host.applyLook();
        },
    });
    const brightness = rangeEl({
        min: 0.4,
        max: 1.6,
        step: 0.05,
        value: cfg.brightness,
        format: fmtRatio,
        onInput: (v) => {
            cfg.brightness = v;
            host.applyLook();
        },
    });
    const saturate = rangeEl({
        min: 0,
        max: 2,
        step: 0.05,
        value: cfg.saturate,
        format: fmtRatio,
        onInput: (v) => {
            cfg.saturate = v;
            host.applyLook();
        },
    });
    const uiStrength = rangeEl({
        min: 0,
        max: 1,
        step: 0.05,
        value: cfg.uiStrength,
        format: fmtPercent,
        onInput: (v) => {
            cfg.uiStrength = v;
            host.applyLook();
        },
    });

    body.append(
        titleEl,
        row(t("qpMask"), el("div", { class: "we-inline" }, maskToggle, maskColor, maskOpacity)),
        row(t("qpBlur"), blur),
        row(t("qpMediaBrightness"), brightness),
        row(t("qpSaturate"), saturate),
        row(t("qpUI"), uiStrength),
        el(
            "div",
            { class: "we-row we-actions" },
            buttonEl(t("qpPrev"), () => host.stepWallpaper(-1)),
            buttonEl(t("qpRandom"), () => host.randomWallpaper()),
            buttonEl(t("qpNext"), () => host.stepWallpaper(1)),
            buttonEl(host.isPlaying() ? t("qpPause") : t("qpPlay"), () => {
                host.togglePlay();
                refreshPlayButton();
            }, "b3-button b3-button--outline we-play"),
            buttonEl(t("qpLibrary"), () => host.openLibrary()),
        ),
    );

    const refreshPlayButton = (): void => {
        const btn = body.querySelector<HTMLButtonElement>(".we-play");
        if (btn) btn.textContent = host.isPlaying() ? t("qpPause") : t("qpPlay");
    };

    dialog = new Dialog({
        title: t("qpTitle"),
        content: '<div class="we-quick-mount"></div>',
        width: "min(520px, 92vw)",
        height: "auto",
        destroyCallback: () => {
            saveState();
            dialog = null;
        },
    });
    dialog.element.querySelector(".we-quick-mount")?.append(body);
}
