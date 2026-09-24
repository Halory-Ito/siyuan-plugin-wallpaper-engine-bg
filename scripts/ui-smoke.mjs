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
import { Plugin as StubPlugin } from "./siyuan-stub.mjs";

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

    /* ---------------- 配置持久化回归测试 ---------------- */

    const stub = globalThis.__siyuanStub;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const indexCjs = require.resolve(path.resolve("tmp-ui-smoke/index.cjs"));
    let current = null;

    // 每个用例一个全新插件实例（重新 require 拿到全新的模块级 state）
    const freshPlugin = async () => {
        delete require.cache[indexCjs];
        const PluginClass2 = load("index").default;
        const p = new PluginClass2({ app: {}, name: "wallpaper-engine-bg", displayName: "we", i18n: {} });
        current = p;
        await p.onload();
        return p;
    };
    const closePlugin = async () => {
        if (!current) return;
        const p = current;
        current = null;
        await p.onunload();
    };

    /** 打开设置页并在最新一个对话框里按标签找控件 */
    const openSettings = (p) => {
        p.openSetting();
        const root = [...document.querySelectorAll(".we-settings")].pop();
        const rowOf = (key) =>
            [...root.querySelectorAll(".we-srow")].find((r) => r.querySelector(".we-slabel")?.textContent === key);
        return { slider: (key) => rowOf(key)?.querySelector('input[type="range"]'), sliders: (key) => [...(rowOf(key)?.querySelectorAll('input[type="range"]') ?? [])] };
    };

    /** 一份「用户调过」的配置：值都不是默认值，方便判断到底读没读到 */
    const savedCommon = (over = {}) => ({
        enabled: true,
        urlWallpaper: "",
        rotateMinutes: 0,
        randomOnStart: false,
        fit: "cover",
        positionX: 0,
        positionY: 32,
        maskEnabled: true,
        maskColor: "#000000",
        maskOpacity: 0.77,
        blur: 33,
        brightness: 0.4,
        saturate: 2,
        uiMode: "panels",
        uiStrength: 0.2,
        panels: {},
        muted: true,
        volume: 0,
        playbackRate: 1,
        pauseWhenHidden: true,
        webMuted: true,
        ...over,
    });

    // 先空跑一次，探出本机 device 文件名（device-<主机名>-<用户名>.json）
    stub.shape = "object";
    stub.files = {};
    await freshPlugin();
    const deviceName = stub.loads.find((n) => n !== "local.json");
    assert(typeof deviceName === "string" && deviceName.startsWith("device-"), `device storage name discovered (${deviceName})`);
    await closePlugin();

    /** 预置存储：同时写入 device 文件，避免启动时自动探测目录又产生写盘 */
    const seed = (shape, common = savedCommon()) => {
        stub.shape = shape;
        stub.failSaves = 0;
        stub.loads.length = 0;
        stub.saves.length = 0;
        stub.files = {};
        stub.files["local.json"] = common;
        stub.files[deviceName] = { hostId: "seed", workshopDirs: [path.resolve("tmp-ui-smoke")], wallpaper: null };
    };

    // 1) 对象形状（内核以 application/json 返回时 fetchPost 直接解析）
    await closePlugin();
    seed("object");
    let p1 = await freshPlugin();
    let ui = openSettings(p1);
    assert(ui.slider("stBlur").value === "33", `blur restored from stored config (got ${ui.slider("stBlur").value})`);
    assert(ui.slider("stMaskOpacity").value === "0.77", "mask opacity restored from stored config");
    assert(ui.sliders("stPosition")[1]?.value === "32", "wallpaper position restored from stored config");

    // 启动时没有变化 → 一次也不应该写盘（否则每次重载都会产生存储变更通知 → 无限重载）
    assert(stub.saves.length === 0, `no write on startup when nothing changed (${stub.saves.length} writes)`);

    // 1b) 关键回归：启动时必须把「界面透明」套用一次，否则重启后 panels 模式不生效
    await closePlugin();
    seed("object", savedCommon({
        uiMode: "panels",
        uiStrength: 1,
        panels: { editor: { useTheme: false, color: "#112233", colorDark: "#445566", alpha: 0.5 } },
    }));
    p1 = await freshPlugin();
    assert(document.documentElement.classList.contains("we-bg-panels"), "startup applies the stored panel transparency mode");
    assert(panelCss().includes("rgba(17, 34, 51"), "startup paints the stored panel colors");

    // 1c) 关闭状态重启：背景层必须隐藏，也不得写盘
    await closePlugin();
    seed("object", savedCommon({ enabled: false }));
    p1 = await freshPlugin();
    assert(document.querySelector("#we-bg")?.classList.contains("we-off"), "startup hides the background when disabled");
    assert(!document.documentElement.classList.contains("we-bg-panels"), "disabled startup does not force panel transparency");
    assert(stub.saves.length === 0, `disabled startup does not write (${stub.saves.length} writes)`);

    // 2) JSON 字符串形状（非 json 响应类型时 fetchPost 走 response.text()）
    await closePlugin();
    seed("string");
    p1 = await freshPlugin();
    assert(openSettings(p1).slider("stBlur").value === "33", "stored config parsed from a JSON string");

    // 3) {code,msg,data} 封套
    await closePlugin();
    seed("envelope");
    p1 = await freshPlugin();
    assert(openSettings(p1).slider("stBlur").value === "33", "stored config unwrapped from an envelope");

    // 4) 读取失败（文件被写坏 / 与写盘撞上）：不得用默认值覆盖磁盘上的配置
    await closePlugin();
    seed("broken");
    p1 = await freshPlugin();
    assert(openSettings(p1).slider("stBlur").value === "4", "unreadable storage falls back to defaults in memory");
    assert(stub.saves.length === 0, `unreadable storage is not overwritten on startup (${stub.saves.length} writes)`);
    assert(stub.files["local.json"].blur === 33, "stored config is left untouched after a broken read");

    // 5) 用户改动 → 防抖写盘，且内容真的是改后的
    await closePlugin();
    seed("object");
    p1 = await freshPlugin();
    const blurSlider = openSettings(p1).slider("stBlur");
    blurSlider.value = "12";
    blurSlider.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    assert(stub.saves.length === 0, "write is debounced, not immediate");
    await sleep(700);
    assert(
        stub.saves.some((s) => s.name === "local.json" && s.data.blur === 12),
        "user change is persisted after the debounce"
    );

    // 6) 写入失败（Windows 上 rename 可能被拒绝）→ 重试一次
    await closePlugin();
    seed("object");
    p1 = await freshPlugin();
    const blurSlider2 = openSettings(p1).slider("stBlur");
    blurSlider2.value = "7";
    blurSlider2.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    stub.failSaves = 1; // 第一次写盘失败
    await sleep(1200);
    assert(
        stub.saves.filter((s) => s.name === "local.json").length >= 2,
        `failed write is retried (${stub.saves.filter((s) => s.name === "local.json").length} attempts)`
    );
    assert(stub.files["local.json"].blur === 7, "retried write eventually lands");

    // 7) onDataChanged 必须覆盖基类实现：否则思源会把「存储变更」当成重载信号，
    //    而重载又会写盘 → 存储变更 → 再重载，形成无限循环
    await closePlugin();
    seed("object");
    p1 = await freshPlugin();
    assert(
        p1.onDataChanged !== StubPlugin.prototype.onDataChanged,
        "onDataChanged is overridden so SiYuan does not reload the plugin on storage change"
    );
    stub.files["local.json"] = savedCommon({ blur: 21 });
    stub.saves.length = 0;
    await p1.onDataChanged("overwrite");
    assert(openSettings(p1).slider("stBlur").value === "21", "onDataChanged adopts the external config");
    assert(stub.saves.length === 0, "onDataChanged does not write back");

    // 8) 关键回归：本地有未保存改动时收到「存储变更」→ 不能被磁盘上的旧内容回滚
    //    （这正是「点了预设立刻被弹回去、而且什么都没保存」的成因）
    await closePlugin();
    seed("object");
    p1 = await freshPlugin();
    const blurSlider3 = openSettings(p1).slider("stBlur");
    blurSlider3.value = "9";
    blurSlider3.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    // 防抖窗口（300ms）内收到外部变更，此时磁盘上还是旧内容
    await p1.onDataChanged("overwrite");
    await sleep(700);
    assert(stub.files["local.json"].blur === 9, "unsaved local change wins over an external data change");

    // 9) 读取失败时即使用户改了东西，也绝不能把默认值写到磁盘上
    await closePlugin();
    seed("broken");
    p1 = await freshPlugin();
    const blurSlider4 = openSettings(p1).slider("stBlur");
    blurSlider4.value = "5";
    blurSlider4.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    await sleep(900);
    assert(stub.saves.length === 0, `broken read blocks writes even after a user change (${stub.saves.length} writes)`);
    assert(stub.files["local.json"].blur === 33, "stored config survives a broken read plus a user change");

    await closePlugin();
} catch (err) {
    failed = true;
    console.error("FAIL: exception thrown\n", err);
}

rmSync("tmp-ui-smoke", { recursive: true, force: true });
console.log(failed ? "UI SMOKE FAILED" : "UI SMOKE PASSED");
process.exit(failed ? 1 : 0);
