/**
 * 冒烟测试：不依赖思源，直接验证「壁纸扫描 + 本地静态服务器」两块核心逻辑。
 *   npm run smoke
 */
import { build } from "esbuild";
import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { inflateRawSync } from "node:zlib";
import path from "node:path";

const require = createRequire(import.meta.url);
globalThis.window = { require };

// 1. 打包被测模块（它们通过 window.require 取 Node 模块）
await build({
    entryPoints: ["src/we.ts", "src/server.ts", "src/renderer.ts", "src/store.ts"],
    outdir: "tmp-smoke",
    outExtension: { ".js": ".cjs" },
    bundle: true,
    format: "cjs",
    platform: "node",
    logLevel: "error",
});
const { scanRoots } = require(path.resolve("tmp-smoke/we.cjs"));
const { LocalServer } = require(path.resolve("tmp-smoke/server.cjs"));
const { buildPanelCss, SURFACE_SELECTORS } = require(path.resolve("tmp-smoke/renderer.cjs"));
const { defaultCommon } = require(path.resolve("tmp-smoke/store.cjs"));

// 2. 伪造一个 Wallpaper Engine 创意工坊目录
const root = mkdtempSync(path.join(tmpdir(), "we-bg-"));
const w = (rel, content) => {
    const p = path.join(root, rel);
    mkdirSync(path.dirname(p), { recursive: true });
    writeFileSync(p, content);
};

w("431960/111/project.json", JSON.stringify({ type: "video", title: "Video One", file: "clip.mp4", preview: "preview.jpg" }));
w("431960/111/clip.mp4", "fake video bytes");
w("431960/111/preview.jpg", "fake preview");

w("431960/222/project.json", JSON.stringify({ type: "web", title: "Web One", file: "index.html" }));
w("431960/222/index.html", "<html><head><title>wp</title></head><body><script src='a.js'></script></body></html>");
w("431960/222/a.js", "console.log(1)");

w("431960/333/project.json", JSON.stringify({ type: "scene", title: "Scene One" }));
w("431960/333/scene.pkg", "pkg");
w("431960/333/preview.jpg", "fake preview");

w("myprojects/custom/hello.mp4", "loose video");

// 3. 扫描
const list = await scanRoots([root]);
const byTitle = Object.fromEntries(list.map((x) => [x.title, x]));
const assert = (cond, msg) => {
    if (!cond) {
        console.error("FAIL:", msg);
        process.exitCode = 1;
    } else {
        console.log("ok  :", msg);
    }
};

assert(list.length === 4, `scan finds 4 wallpapers (got ${list.length})`);
assert(byTitle["Video One"]?.type === "video" && byTitle["Video One"]?.entry.endsWith("clip.mp4"), "video wallpaper entry resolved");
assert(byTitle["Web One"]?.type === "web" && byTitle["Web One"]?.entry.endsWith("index.html"), "web wallpaper entry resolved");
assert(byTitle["Scene One"]?.supported === false && byTitle["Scene One"]?.entry.endsWith("preview.jpg"), "scene wallpaper falls back to preview");
assert(byTitle["hello"]?.type === "video", "loose media file picked up");

// 4. 本地服务器
const server = new LocalServer();
assert(await server.start(), "local server starts");
const htmlUrl = server.urlForFile(byTitle["Web One"].entry, byTitle["Web One"].dir, { weMute: "1" });
const html = await (await fetch(htmlUrl)).text();
assert(html.includes("data-we-bg-shim"), "html shim injected");
assert(htmlUrl.includes("weMute=1"), "mute flag passed via url");
assert(html.includes("a.js"), "html content served");

const jsUrl = server.urlForFile(path.join(byTitle["Web One"].dir, "a.js"), byTitle["Web One"].dir);
const js = await (await fetch(jsUrl)).text();
assert(js.includes("console.log"), "relative subresource resolvable under project root");

const videoUrl = server.urlForFile(byTitle["Video One"].entry, byTitle["Video One"].dir);
const ranged = await fetch(videoUrl, { headers: { Range: "bytes=0-3" } });
assert(ranged.status === 206 && (await ranged.text()) === "fake", "video range request works");

const evil = videoUrl.replace(/[^/]+$/, "%2e%2e%2f%2e%2e%2fproject.json");
assert((await fetch(evil)).status !== 200, "path traversal blocked");
assert((await fetch(`http://127.0.0.1:${server.port}/nope/xxx`)).status === 404, "bad token rejected");

server.stop();

// 5. 面板背景规则：透明度 0 也必须输出 transparent，否则主题背景残留、壁纸透不出来
const basePanel = (over) => ({ useTheme: true, color: "#1f2430", colorDark: "#1f2430", alpha: 0.5, ...over });
const cssOf = (panels, uiStrength = 1) =>
    buildPanelCss({ uiMode: "panels", uiStrength, panels: {
        editor: basePanel(), docTree: basePanel(), outline: basePanel(),
        sidebar: basePanel(), chrome: basePanel(), other: basePanel(), ...panels,
    } }, "#1f2430");
assert(SURFACE_SELECTORS.other.paint.includes("layout-tab-container"), "content card container covered");
assert(SURFACE_SELECTORS.sidebar.paint.includes("layout__dockl"), "dock card container covered");
assert(SURFACE_SELECTORS.editor.flatten.includes("protyle-wysiwyg"), "nested editor elements flattened");
assert(SURFACE_SELECTORS.editor.flatten.includes("protyle-breadcrumb"), "content top nav (breadcrumb) covered");
assert(SURFACE_SELECTORS.code.paint.includes("code-block") && SURFACE_SELECTORS.code.flatten.includes(".hljs"), "code block surface covered");
assert(cssOf({ code: basePanel({ alpha: 0.3 }) }).includes(".code-block .hljs"), "code block inner elements flattened");
const defaults = defaultCommon();
assert(defaults.blur === 4 && defaults.brightness === 0.4 && defaults.saturate === 2 && defaults.uiStrength === 0.4, "tuned defaults applied (blur/brightness/saturate/uiStrength)");
assert(defaults.fit === "cover" && defaults.positionX === 0 && defaults.positionY === 0 && defaults.maskOpacity === 0, "tuned defaults applied (fit/position/mask)");
assert(defaults.panels.editor.useTheme === false && defaults.panels.editor.colorDark === "#732eb8", "tuned defaults applied (editor colors)");
assert(Object.values(defaults.panels).every((p) => p.alpha === 0), "default preset is all transparent");
assert(cssOf({ editor: basePanel({ alpha: 0 }) }).includes(".protyle .protyle-breadcrumb"), "flatten rules emitted even at alpha 0");
assert(cssOf({ docTree: basePanel({ alpha: 0 }) }).includes("background-color: transparent !important"), "alpha 0 still overrides theme background with transparent");
assert(cssOf().includes("color-mix(in srgb, var(--b3-theme-background)"), "theme color mode tracks the theme variable (dark/light)");
assert(cssOf().includes("rgba(31, 36, 48"), "rgba fallback emitted next to color-mix");
const customCss = cssOf({ editor: basePanel({ useTheme: false, color: "#112233", colorDark: "#445566", alpha: 0.5 }) });
assert(customCss.includes("rgba(17, 34, 51"), "custom light color emitted as rgba");
assert(customCss.includes('html[data-theme-mode="dark"]'), "custom dark-mode color emitted");
assert(!cssOf({ sidebar: basePanel({ alpha: 0.2 }) }, 0).includes("color-mix"), "uiStrength 0 makes every surface transparent");

// 6. package.zip 用的是手写 ZIP 编码，必须能自洽（本地头 / deflate 往返 / EOCD）
const { createZip } = await import("../scripts/package.mjs");

/** 只解本地文件头，用于校验 createZip 的输出 */
function readZip(buf) {
    const out = [];
    let p = 0;
    while (p + 30 <= buf.length && buf.readUInt32LE(p) === 0x04034b50) {
        const method = buf.readUInt16LE(p + 8);
        const csize = buf.readUInt32LE(p + 18);
        const nlen = buf.readUInt16LE(p + 26);
        const elen = buf.readUInt16LE(p + 28);
        const name = buf.subarray(p + 30, p + 30 + nlen).toString("utf8");
        const start = p + 30 + nlen + elen;
        const body = buf.subarray(start, start + csize);
        out.push({ name, data: method === 0 ? body : inflateRawSync(body) });
        p = start + csize;
    }
    return out;
}

const zipEntries = [
    { name: "a.txt", data: Buffer.from("hello 世界") },
    { name: "i18n/zh_CN.json", data: Buffer.from("{\"k\":\"" + "值".repeat(2000) + "\"}") },
    { name: "icon.png", data: Buffer.alloc(64, 7) },
];
const zipBuf = createZip(zipEntries);
const unpacked = readZip(zipBuf);
assert(zipBuf.readUInt32LE(0) === 0x04034b50, "package.zip starts with a local file header");
assert(unpacked.length === zipEntries.length, `package.zip holds every entry (got ${unpacked.length})`);
assert(
    unpacked.every((e, i) => e.name === zipEntries[i].name && Buffer.compare(e.data, zipEntries[i].data) === 0),
    "package.zip round-trips names and contents"
);
const eocd = zipBuf.subarray(zipBuf.length - 22);
assert(
    eocd.readUInt32LE(0) === 0x06054b50 && eocd.readUInt16LE(10) === zipEntries.length,
    "package.zip ends with a valid central directory record"
);
assert(unpacked.some((e) => e.name.includes("/")), "package.zip keeps subdirectory paths with forward slashes");

rmSync(root, { recursive: true, force: true });
rmSync("tmp-smoke", { recursive: true, force: true });
console.log(process.exitCode ? "SMOKE FAILED" : "SMOKE PASSED");
