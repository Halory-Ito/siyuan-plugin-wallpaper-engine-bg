/** 插件 UI（设置页 / 弹窗）用到的样式，独立注入，避免依赖插件 css 重载 */
export const UI_CSS = `
.we-inline { display: flex; align-items: center; gap: 10px; width: 100%; }
.we-nowrap { flex-wrap: nowrap; }
.we-row { display: flex; align-items: center; gap: 14px; padding: 8px 0; }
.we-label { flex: 0 0 88px; opacity: .85; }
.we-range { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 180px; }
.we-range input[type="range"] { flex: 1; }
.we-value { min-width: 52px; text-align: right; font-variant-numeric: tabular-nums; opacity: .7; font-size: 12px; }
.we-color { width: 44px; height: 28px; padding: 2px; border: 1px solid var(--b3-border-color); border-radius: 6px; background: transparent; cursor: pointer; }

/* —— 调色板 —— */
.we-palette { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; }
.we-swatch { position: relative; width: 26px; height: 26px; padding: 0; border: 1px solid var(--b3-border-color); border-radius: 7px; background-color: var(--we-swatch, transparent); cursor: pointer; transition: transform .12s ease, box-shadow .12s ease, border-color .12s ease; }
.we-swatch:hover { transform: translateY(-1px); border-color: var(--b3-theme-primary); }
.we-swatch--on { border-color: transparent; box-shadow: 0 0 0 2px var(--b3-theme-primary); }
.we-swatch--transparent { background-image: linear-gradient(45deg, var(--b3-border-color) 25%, transparent 25%, transparent 75%, var(--b3-border-color) 75%), linear-gradient(45deg, var(--b3-border-color) 25%, transparent 25%, transparent 75%, var(--b3-border-color) 75%); background-size: 8px 8px; background-position: 0 0, 4px 4px; }
.we-swatch--theme { background-image: linear-gradient(135deg, var(--b3-theme-background) 0 50%, var(--b3-theme-surface) 50% 100%); }
.we-preset-on { border-color: var(--b3-theme-primary) !important; color: var(--b3-theme-primary) !important; }
.we-code-color { display: flex; align-items: center; gap: 8px; }
.we-text { flex: 1; }
textarea.we-text { min-height: 72px; resize: vertical; font-family: var(--b3-font-family-code, monospace); font-size: 12px; padding: 8px 10px; }
.we-status { opacity: .6; font-size: 12px; }

/* —— 设置页：minimal（无卡片无边框块，仅发丝线 + 留白分组） —— */
.we-settings { display: flex; flex-direction: column; gap: 26px; padding: 6px 8px 18px; }
.we-sec { display: flex; flex-direction: column; }
.we-sec-title { margin: 0 0 2px; font-size: 12px; font-weight: 600; letter-spacing: .08em; opacity: .42; }
.we-srow { display: grid; grid-template-columns: minmax(150px, 32%) 1fr; align-items: center; gap: 20px; padding: 11px 0; border-top: 1px solid var(--b3-border-color); }
.we-sec .we-srow:first-of-type { border-top: none; padding-top: 6px; }
.we-srow--column { align-items: stretch; }
.we-srow--column textarea { width: 100%; }
.we-sinfo { min-width: 0; }
.we-slabel { font-size: 13px; line-height: 1.5; }
.we-shint { margin-top: 3px; font-size: 11.5px; line-height: 1.55; opacity: .5; }
.we-sctl { display: flex; align-items: center; justify-content: flex-end; gap: 10px; min-width: 0; flex-wrap: wrap; }
.we-sctl.we-nowrap { flex-wrap: nowrap; }
.we-sctl .we-range { max-width: 320px; }
.we-surface-list { display: flex; flex-direction: column; width: 100%; }
.we-surface-row { display: grid; grid-template-columns: minmax(150px, 32%) 1fr; align-items: center; gap: 20px; padding: 9px 0; }
.we-surface-row + .we-surface-row { border-top: 1px solid var(--b3-border-color); }
.we-surface-row .we-range { max-width: 200px; min-width: 140px; }

/* —— 快速调节面板 —— */
.we-quick { padding: 8px 6px 6px; }
.we-quick-title { font-weight: 600; padding-bottom: 8px; margin-bottom: 6px; border-bottom: 1px solid var(--b3-border-color); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.we-actions { flex-wrap: wrap; gap: 8px; padding-top: 10px; }

/* —— 壁纸库 —— */
.we-lib-mount { padding: 8px 4px 4px; }
.we-lib-toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.we-lib-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; overflow-y: auto; max-height: calc(84vh - 140px); padding-bottom: 8px; }
.we-card { border: 1px solid var(--b3-border-color); border-radius: 8px; overflow: hidden; cursor: pointer; background: var(--b3-theme-surface); transition: transform .12s ease, border-color .12s ease; }
.we-card:hover { transform: translateY(-2px); border-color: var(--b3-theme-primary); }
.we-card--current { border-color: var(--b3-theme-primary); box-shadow: 0 0 0 1px var(--b3-theme-primary) inset; }
.we-card--dim { opacity: .62; }
.we-thumb { aspect-ratio: 16 / 9; background: var(--b3-theme-lighter); display: flex; align-items: center; justify-content: center; overflow: hidden; }
.we-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.we-thumb-fallback { font-size: 28px; opacity: .5; }
.we-card-title { padding: 8px 10px 2px; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.we-card-meta { padding: 2px 10px 10px; display: flex; gap: 6px; }
.we-tag { font-size: 11px; line-height: 1.6; padding: 0 6px; border-radius: 4px; background: var(--b3-theme-light); opacity: .85; }
.we-tag--warn { background: var(--b3-theme-warning); color: #fff; }
.we-lib-empty { opacity: .6; padding: 32px; text-align: center; grid-column: 1 / -1; }
`;

export function injectUiStyle(): void {
    if (document.getElementById("we-bg-ui-style")) return;
    const style = document.createElement("style");
    style.id = "we-bg-ui-style";
    style.textContent = UI_CSS;
    document.head.append(style);
}

export function removeUiStyle(): void {
    document.getElementById("we-bg-ui-style")?.remove();
}
