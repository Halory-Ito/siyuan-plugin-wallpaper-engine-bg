/**
 * UI / 加载冒烟测试（jsdom）：真实走一遍插件 onload → 设置页 / 快速面板 / 壁纸库 / 渲染路径，
 * 任何运行时异常都会在这里现形（等价于思源里的 "plugin xxx onload error"）。
 *   npm run ui-smoke
 */
import { build } from "esbuild";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";
import { rmSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);

const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
    url: "http://127.0.0.1:6806/",
});
for (const key of [
    "window", "document", "HTMLElement", "HTMLInputElement", "HTMLSelectElement",
    "HTMLTextAreaElement", "HTMLVideoElement", "HTMLImageElement", "HTMLIFrameElement",
    "Element", "Node", "navigator", "Event", "CustomEvent", "MutationObserver",
]) {
    try {
        Object.defineProperty(global, key, { value: dom.window[key], configurable: true, writable: true });
    } catch {
        global[key] = dom.window[key];
    }
}
global.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
global.window.require = createRequire(import.meta.url);

let failed = false;
const assert = (cond, msg) => {
    if (!cond) {
        failed = true;
        console.error("FAIL:", msg);
    } else {
        console.log("ok  :", msg);
    }
};

await build({
    entryPoints: ["src/index.ts", "src/settings.ts", "src/quick.ts", "src/library.ts", "src/store.ts", "src/renderer.ts"],
    outdir: path.resolve("tmp-ui-smoke"),
    outExtension: { ".js": ".cjs" },
    bundle: true,
    format: "cjs",
    platform: "browser",
    alias: { siyuan: path.resolve("scripts/siyuan-stub.mjs") },
    logLevel: "error",
});

const load = (name) => require(path.resolve(`tmp-ui-smoke/${name}.cjs`));

try {
    const PluginClass = load("index").default;
    const plugin = new PluginClass({ app: {}, name: "wallpaper-engine-bg", displayName: "we", i18n: {} });

    await plugin.onload();
    assert(true, "plugin onload runs");
    plugin.onLayoutReady();
    assert(true, "onLayoutReady runs");

    plugin.openSetting();
    assert(document.querySelector(".we-settings"), "settings page rendered");
    assert(document.querySelectorAll(".we-sec").length >= 5, "settings sections rendered");
    assert(document.querySelector(".we-surface-list .we-surface-row"), "surface rows rendered");
    assert(
        ![...document.querySelectorAll(".we-surface-list .we-surface-row .we-slabel")].some((n) => n.textContent?.includes("sfCode")),
        "code block moved out of the generic surface list"
    );
    const swatches = document.querySelectorAll(".we-palette .we-swatch");
    assert(swatches.length >= 6, `code block palette rendered (${swatches.length} swatches)`);

    // 调色板点选 → 面板 CSS 应立即写入代码块背景（默认 0% 会被自动提升，否则「点了没反应」）
    const click = (i) => swatches[i].dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    const panelCss = () => document.querySelector("#we-bg-panels-style")?.textContent ?? "";
    const codeRule = () => /\.code-block[^{]*\{[^}]*\}/.exec(panelCss())?.[0] ?? "";

    click(2); // 深色 #1f2430
    assert(/rgba\(31, 36, 48, 0\.\d+\)/.test(codeRule()), `picking a swatch paints the code block (${codeRule().trim()})`);

    click(0); // 透明
    assert(/background-color: transparent/.test(codeRule()), "picking the transparent swatch clears the code block background");

    // 背景预设：默认高亮「全透明」，点选后高亮跟随并真正改到面板 CSS
    const preset = (key) =>
        [...document.querySelectorAll(".we-settings button")].find((b) => b.textContent === key);
    const hit = (key) => preset(key).dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    const cardRule = () => /\.layout-tab-container[^{]*\{[^}]*\}/.exec(panelCss())?.[0] ?? "";

    assert(preset("sfPresetGlass") && preset("sfPresetClear") && preset("sfPresetOpaque"), "three background presets rendered");
    assert(preset("sfPresetClear").classList.contains("we-preset-on"), "All transparent preset is highlighted by default");
    assert(preset("sfPresetClear").getAttribute("aria-pressed") === "true", "active preset is exposed to assistive tech");

    hit("sfPresetOpaque");
    assert(preset("sfPresetOpaque").classList.contains("we-preset-on"), "highlight follows the applied preset");
    assert(/color-mix\(in srgb, var\(--b3-theme-background\) 100%/.test(cardRule()), `All opaque really reaches 100% (${cardRule().trim()})`);

    hit("sfPresetClear");
    assert(/background-color: transparent/.test(cardRule()), "All transparent turns every surface transparent again");
    assert(preset("sfPresetClear").classList.contains("we-preset-on"), "highlight returns to All transparent");

    plugin.openQuickPanel();
    assert(document.querySelector(".we-quick"), "quick panel rendered");

    plugin.openLibrary();
    assert(document.querySelector(".we-lib-mount"), "library dialog rendered");

    // 渲染路径：图片 / 视频 / 网页各来一次
    const { state } = load("store");
    const renderer = plugin.renderer;
    state.common.fit = "blurfill";
    renderer.show({ key: "k1", title: "img", kind: "image", url: "http://x/a.png", previewUrl: "", fallback: false }, state.common);
    renderer.applyLook(state.common);
    renderer.applyUI(state.common);
    assert(document.querySelector("#we-bg img"), "image wallpaper rendered");
    renderer.show({ key: "k2", title: "web", kind: "web", url: "http://x/index.html", previewUrl: "", fallback: false }, state.common);
    assert(document.querySelector("#we-bg iframe"), "web wallpaper rendered");

    // 各命令回调跑一遍
    for (const cmd of plugin.commands ?? []) cmd.callback?.({});
    assert(true, "all command callbacks run");

    await plugin.onunload();
    assert(!document.querySelector("#we-bg"), "plugin cleanup runs");
} catch (err) {
    failed = true;
    console.error("FAIL: exception thrown\n", err);
}

rmSync("tmp-ui-smoke", { recursive: true, force: true });
console.log(failed ? "UI SMOKE FAILED" : "UI SMOKE PASSED");
process.exit(failed ? 1 : 0);
