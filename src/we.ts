import { nodeMod } from "./node";
import type { WEWallpaper, WallpaperType } from "./types";

/**
 * Wallpaper Engine 壁纸库扫描。
 *
 * 目录结构（Steam 创意工坊）：
 *   <SteamLibrary>/steamapps/workshop/content/431960/<创意工坊 ID>/project.json
 * 本地项目：
 *   <WallpaperEngine>/projects/myprojects/<工程名>/project.json
 *
 * project.json 关键字段：type(video/web/scene/application)、title、file、preview。
 *
 * 扫描全程使用 fs.promises 异步遍历并定期让出事件循环，
 * 避免大目录（几千个创意工坊工程）把界面卡住。
 */

export const VIDEO_EXT = new Set([".mp4", ".webm", ".m4v", ".mov", ".avi", ".ogv", ".mkv"]);
export const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".avif"]);
const HTML_EXT = new Set([".html", ".htm"]);

const STEAM_ROOTS_WIN = [
    "C:/Program Files (x86)/Steam",
    "C:/Program Files/Steam",
    "D:/Steam",
    "D:/SteamLibrary",
    "E:/Steam",
    "E:/SteamLibrary",
];

const WE_APP_ID = "431960";
const MAX_SCAN_DEPTH = 3;
const MAX_ENTRIES_PER_DIR = 4000;

function mods() {
    return {
        fs: nodeMod<any>("fs"),
        fsp: nodeMod<any>("fs/promises"),
        path: nodeMod<any>("path"),
        os: nodeMod<any>("os"),
    };
}

function exists(abs: string): boolean {
    const { fs } = mods();
    try {
        return !!fs && fs.existsSync(abs);
    } catch {
        return false;
    }
}

function isDir(abs: string): boolean {
    const { fs } = mods();
    try {
        return !!fs && fs.existsSync(abs) && fs.statSync(abs).isDirectory();
    } catch {
        return false;
    }
}

const yieldToUi = () => new Promise((resolve) => setTimeout(resolve, 0));

/** 自动探测 Wallpaper Engine 壁纸根目录（创意工坊 + 本地工程） */
export function detectRoots(): string[] {
    const { fs, path, os } = mods();
    if (!fs || !path) return [];
    const roots = new Set<string>();
    const steamRoots = new Set<string>();

    const home = typeof os?.homedir === "function" ? os.homedir() : "";
    const candidates = [
        ...STEAM_ROOTS_WIN,
        home ? path.join(home, ".steam/steam") : "",
        home ? path.join(home, ".local/share/Steam") : "",
        home ? path.join(home, ".var/app/com.valvesoftware.Steam/.local/share/Steam") : "",
        home ? path.join(home, "Library/Application Support/Steam") : "",
    ].filter(Boolean);

    for (const c of candidates) {
        if (isDir(c)) steamRoots.add(path.resolve(c));
    }

    // 解析 libraryfolders.vdf，拿到全部 Steam 库
    const libraries = new Set<string>();
    for (const s of steamRoots) libraries.add(s);
    for (const s of steamRoots) {
        const vdf = path.join(s, "steamapps", "libraryfolders.vdf");
        if (!exists(vdf)) continue;
        try {
            const text = fs.readFileSync(vdf, "utf8") as string;
            const re = /"(?:path|\d+)"\s*"([^"]+)"/g;
            let m: RegExpExecArray | null;
            while ((m = re.exec(text))) {
                const p = m[1].replace(/\\\\/g, "/");
                if (isDir(p)) libraries.add(path.resolve(p));
            }
        } catch {
            /* ignore */
        }
    }

    for (const lib of libraries) {
        const workshop = path.join(lib, "steamapps", "workshop", "content", WE_APP_ID);
        if (isDir(workshop)) roots.add(workshop);
        const myProjects = path.join(lib, "steamapps", "common", "wallpaper_engine", "projects", "myprojects");
        if (isDir(myProjects)) roots.add(myProjects);
    }

    return [...roots];
}

async function firstWithExt(dir: string, exts: Set<string>, recursive = true): Promise<string> {
    const { fsp, path } = mods();
    if (!fsp || !path) return "";
    const walk = async (d: string, depth: number): Promise<string> => {
        const entries = await readDir(d);
        for (const e of entries) {
            if (e.isFile() && exts.has(path.extname(e.name).toLowerCase())) {
                return path.join(d, e.name);
            }
        }
        if (recursive && depth > 0) {
            for (const e of entries) {
                if (e.isDirectory()) {
                    const found = await walk(path.join(d, e.name), depth - 1);
                    if (found) return found;
                }
            }
        }
        return "";
    };
    return walk(dir, 1);
}

async function readDir(dir: string): Promise<any[]> {
    const { fsp } = mods();
    if (!fsp) return [];
    try {
        return await fsp.readdir(dir, { withFileTypes: true });
    } catch {
        return [];
    }
}

async function findPreview(dir: string, declared?: string): Promise<string> {
    const { path } = mods();
    if (declared) {
        const p = path.join(dir, declared);
        if (exists(p)) return p;
    }
    for (const name of ["preview.jpg", "preview.png", "preview.gif", "preview.jpeg", "preview.webp"]) {
        const p = path.join(dir, name);
        if (exists(p)) return p;
    }
    return "";
}

function makeWallpaper(partial: Omit<WEWallpaper, "key">): WEWallpaper {
    return { ...partial, key: `${partial.dir}||${partial.entry}` };
}

async function fromProject(dir: string, json: any): Promise<WEWallpaper | null> {
    const { path } = mods();
    const id = path.basename(dir);
    const rawType = String(json?.type ?? "").toLowerCase();
    const title = String(json?.title ?? "").trim() || id;
    const declared = json?.file ? path.join(dir, String(json.file)) : "";
    const preview = await findPreview(dir, typeof json?.preview === "string" ? json.preview : undefined);

    let type: WallpaperType = "unknown";
    if (rawType === "video") type = "video";
    else if (rawType === "web") type = "web";
    else if (rawType === "scene" || rawType === "gifscene") type = "scene";
    else if (rawType === "application") type = "application";
    else if (rawType === "image") type = "image";

    let entry = "";
    let supported = true;
    let note: WEWallpaper["note"] = "ok";

    switch (type) {
        case "video":
            entry = exists(declared) ? declared : await firstWithExt(dir, VIDEO_EXT);
            break;
        case "web":
            entry = exists(declared) ? declared : path.join(dir, "index.html");
            if (!exists(entry)) entry = await firstWithExt(dir, HTML_EXT, true);
            break;
        case "image":
            entry = exists(declared) ? declared : await firstWithExt(dir, IMAGE_EXT);
            break;
        case "scene":
        case "application":
            // 打包的 .pkg 场景 / 应用类壁纸无法在浏览器环境渲染，只能回退到预览图
            supported = false;
            entry = preview;
            note = preview ? "preview-only" : "missing-entry";
            break;
        default:
            entry = exists(declared)
                ? declared
                : await firstWithExt(dir, new Set([...VIDEO_EXT, ...IMAGE_EXT, ...HTML_EXT]));
            if (entry) {
                const ext = path.extname(entry).toLowerCase();
                type = VIDEO_EXT.has(ext) ? "video" : HTML_EXT.has(ext) ? "web" : "image";
            }
            break;
    }

    if (!entry && !preview) return null;
    if (!entry) {
        supported = false;
        entry = preview;
        note = "missing-entry";
    }

    return makeWallpaper({ id, title, type, dir, entry, preview, supported, note });
}

function fromMediaFile(file: string): WEWallpaper | null {
    const { path } = mods();
    const ext = path.extname(file).toLowerCase();
    let type: WallpaperType = "unknown";
    if (VIDEO_EXT.has(ext)) type = "video";
    else if (IMAGE_EXT.has(ext)) type = "image";
    else if (HTML_EXT.has(ext)) type = "web";
    else return null;
    const dir = path.dirname(file);
    const id = path.basename(file);
    return makeWallpaper({
        id,
        title: path.basename(file, ext),
        type,
        dir,
        entry: file,
        preview: type === "image" ? file : "",
        supported: true,
        note: "ok",
    });
}

/**
 * 扫描一组壁纸根目录，返回壁纸列表（按标题排序）。
 * 目录层级不作严格要求：指向 workshop/content、431960 或者某个具体工程目录都可以。
 */
export async function scanRoots(roots: string[]): Promise<WEWallpaper[]> {
    const { path } = mods();
    if (!path) return [];
    const out = new Map<string, WEWallpaper>();
    for (const root of roots) {
        if (!root || !isDir(root)) continue;
        await scanContainer(path.resolve(root), MAX_SCAN_DEPTH, out, { processed: 0 });
    }
    return [...out.values()].sort((a, b) => a.title.localeCompare(b.title, "zh-CN"));
}

async function scanContainer(
    dir: string,
    depth: number,
    out: Map<string, WEWallpaper>,
    stats: { processed: number }
): Promise<void> {
    const { fsp, path } = mods();
    if (!fsp || !path) return;

    // 定期让出事件循环，避免大目录把界面卡住
    if (++stats.processed % 32 === 0) await yieldToUi();

    // 工程目录：以 project.json 为准，内部文件不再单独扫描
    const projectFile = path.join(dir, "project.json");
    if (exists(projectFile)) {
        try {
            const json = JSON.parse(await fsp.readFile(projectFile, "utf8"));
            const wp = await fromProject(dir, json);
            if (wp) out.set(wp.key, wp);
        } catch {
            /* 坏掉的工程直接跳过 */
        }
        return;
    }

    const entries = await readDir(dir);
    // 防止把无关的大目录当成壁纸库扫爆内存
    if (entries.length > MAX_ENTRIES_PER_DIR) return;

    for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
            if (depth > 0) await scanContainer(full, depth - 1, out, stats);
        } else if (e.isFile()) {
            // 没有工程描述的散装媒体文件也支持
            const wp = fromMediaFile(full);
            if (wp) out.set(wp.key, wp);
        }
    }
}
