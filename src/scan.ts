import { nodeMod } from "./node";
import type { WallpaperItem, WallpaperType } from "./types";

/**
 * 自定义图库扫描。
 *
 * 用户在设置里指定若干本地目录，扫描其中的媒体文件：
 *   - 视频：mp4 / webm / m4v / mov / avi / ogv / mkv
 *   - 图片：png / jpg / jpeg / gif / webp / bmp / avif
 *   - 网页壁纸：html / htm（整个目录作为工程根，相对路径资源可正常加载）
 *
 * 扫描全程使用 fs.promises 异步遍历并定期让出事件循环，
 * 避免大目录（几千个文件）把界面卡住。
 */

export const VIDEO_EXT = new Set([".mp4", ".webm", ".m4v", ".mov", ".avi", ".ogv", ".mkv"]);
export const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".avif"]);
export const HTML_EXT = new Set([".html", ".htm"]);

const MAX_SCAN_DEPTH = 3;
const MAX_ENTRIES_PER_DIR = 4000;

function mods() {
    return {
        fs: nodeMod<any>("fs"),
        fsp: nodeMod<any>("fs/promises"),
        path: nodeMod<any>("path"),
    };
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

async function readDir(dir: string): Promise<any[]> {
    const { fsp } = mods();
    if (!fsp) return [];
    try {
        return await fsp.readdir(dir, { withFileTypes: true });
    } catch {
        return [];
    }
}

function fromMediaFile(file: string): WallpaperItem | null {
    const { path } = mods();
    const ext = path.extname(file).toLowerCase();
    let type: WallpaperType = "unknown";
    if (VIDEO_EXT.has(ext)) type = "video";
    else if (IMAGE_EXT.has(ext)) type = "image";
    else if (HTML_EXT.has(ext)) type = "web";
    else return null;
    const dir = path.dirname(file);
    const id = path.basename(file);
    return {
        id,
        title: path.basename(file, ext),
        type,
        dir,
        entry: file,
        preview: type === "image" ? file : "",
        key: `${dir}||${file}`,
    };
}

/**
 * 扫描一组图库目录，返回壁纸列表（按标题排序）。
 * 目录层级不作严格要求：指向父目录或具体子目录都可以。
 */
export async function scanRoots(roots: string[]): Promise<WallpaperItem[]> {
    const { path } = mods();
    if (!path) return [];
    const out = new Map<string, WallpaperItem>();
    for (const root of roots) {
        if (!root || !isDir(root)) continue;
        await scanContainer(path.resolve(root), MAX_SCAN_DEPTH, out, { processed: 0 });
    }
    return [...out.values()].sort((a, b) => a.title.localeCompare(b.title, "zh-CN"));
}

async function scanContainer(
    dir: string,
    depth: number,
    out: Map<string, WallpaperItem>,
    stats: { processed: number }
): Promise<void> {
    const { path } = mods();
    if (!path) return;

    // 定期让出事件循环，避免大目录把界面卡住
    if (++stats.processed % 32 === 0) await yieldToUi();

    const entries = await readDir(dir);
    // 防止把无关的大目录当成图库扫爆内存
    if (entries.length > MAX_ENTRIES_PER_DIR) return;

    for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
            if (depth > 0) await scanContainer(full, depth - 1, out, stats);
        } else if (e.isFile()) {
            const wp = fromMediaFile(full);
            if (wp) out.set(wp.key, wp);
        }
    }
}
