import { nodeMod } from "./node";

/**
 * 本地静态服务器。
 *
 * Wallpaper Engine 的 web 壁纸是完整的 html 工程（入口 + 相对路径的 js/css/贴图），
 * 而思源页面运行在 http 源上，无法直接加载 file:// 子资源。
 * 这里用 Node 的 http 模块在 127.0.0.1 上起一个只读静态服务器，
 * 把壁纸目录映射成 http 链接，相对路径即可正常解析，视频也支持 Range 拖动。
 *
 * 安全性：只绑定回环地址；URL 里带随机 secret；所有路径都做越界检查，仅能读取显式注册过的目录。
 */

const MIME: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".htm": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".xml": "application/xml; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".avif": "image/avif",
    ".bmp": "image/bmp",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".mp4": "video/mp4",
    ".m4v": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".avi": "video/x-msvideo",
    ".ogv": "video/ogg",
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".otf": "font/otf",
    ".glsl": "text/plain; charset=utf-8",
    ".vert": "text/plain; charset=utf-8",
    ".frag": "text/plain; charset=utf-8",
};

/**
 * 注入到 web 壁纸 html 中的兼容垫片：
 * 补齐 Wallpaper Engine 的 window.wallpaperXxx 接口（缺失时壁纸脚本会直接报错中断），
 * 以及可选的静音处理。
 */
const SHIM = `<script data-we-bg-shim>
(function () {
    try {
        window.wallpaperPropertyListener = window.wallpaperPropertyListener || {
            applyUserProperties: function () {},
            applyGeneralProperties: function () {},
            userDirectoryFilesChanged: function () {}
        };
        if (typeof window.wallpaperRegisterAudioListener !== "function") {
            window.wallpaperRegisterAudioListener = function (cb) { window.__weAudioCb = cb; };
        }
        if (typeof window.wallpaperRequestAnimation !== "function") {
            window.wallpaperRequestAnimation = function () { return 0; };
        }
        if (typeof window.wallpaperCancelAnimation !== "function") {
            window.wallpaperCancelAnimation = function () {};
        }
        var q = new URLSearchParams(location.search);
        if (q.get("weMute") === "1") {
            var mute = function (el) {
                try {
                    el.muted = true;
                    el.volume = 0;
                    if (el.autoplay) { var p = el.play(); if (p && p.catch) p.catch(function () {}); }
                } catch (e) {}
            };
            var scan = function (root) {
                if (!root || root.nodeType !== 1) return;
                if (/^(video|audio)$/i.test(root.tagName || "")) mute(root);
                if (root.querySelectorAll) {
                    Array.prototype.forEach.call(root.querySelectorAll("video,audio"), mute);
                }
            };
            if (document.documentElement) scan(document.documentElement);
            new MutationObserver(function (muts) {
                muts.forEach(function (m) {
                    Array.prototype.forEach.call(m.addedNodes, scan);
                });
            }).observe(document.documentElement, { childList: true, subtree: true });
        }
    } catch (e) {}
})();
</script>`;

export class LocalServer {
    private fs: any = nodeMod("fs");
    private path: any = nodeMod("path");
    private crypto: any = nodeMod("crypto");
    private http: any = nodeMod("http");

    private server: any = null;
    /** rootToken -> 注册的根目录 */
    private roots = new Map<string, string>();
    /** 根目录 -> rootToken */
    private tokens = new Map<string, string>();

    public port = 0;
    public secret = "";
    public available = false;

    async start(): Promise<boolean> {
        try {
            if (!this.http || !this.fs) return false;
            this.secret = randomHex(this.crypto, 16);
            return await new Promise<boolean>((resolve) => {
                this.server = this.http.createServer((req: any, res: any) => this.handle(req, res));
                this.server.on("error", (err: any) => {
                    console.warn("[we-bg] local server error:", err);
                    this.available = false;
                    resolve(false);
                });
                this.server.listen(0, "127.0.0.1", () => {
                    this.port = this.server.address()?.port ?? 0;
                    this.available = this.port > 0;
                    resolve(this.available);
                });
            });
        } catch (err) {
            console.warn("[we-bg] local server start failed:", err);
            this.available = false;
            return false;
        }
    }

    stop(): void {
        try {
            this.server?.close();
        } catch {
            /* ignore */
        }
        this.server = null;
        this.available = false;
    }

    /** 注册一个可访问的根目录，返回 rootToken */
    registerRoot(absDir: string): string {
        const dir = String(this.path.resolve(absDir));
        const existing = this.tokens.get(dir);
        if (existing) return existing;
        const token = randomHex(this.crypto, 8);
        this.tokens.set(dir, token);
        this.roots.set(token, dir);
        return token;
    }

    /**
     * 绝对路径 -> 可访问 URL。
     * @param baseDir 相对寻址的根目录（默认取文件所在目录）；html 工程必须传工程目录，否则相对子资源无法解析。
     */
    urlForFile(absPath: string, baseDir?: string, query?: Record<string, string>): string {
        const root = baseDir ?? this.path.dirname(absPath);
        const token = this.registerRoot(root);
        let rel = this.path.relative(root, absPath).split(this.path.sep).join("/");
        if (rel.startsWith("..")) {
            // 文件不在根目录内，退化为以文件自身目录为根
            const own = this.path.dirname(absPath);
            const ownToken = this.registerRoot(own);
            rel = this.path.basename(absPath);
            return this.buildUrl(ownToken, rel, query);
        }
        return this.buildUrl(token, rel, query);
    }

    private buildUrl(rootToken: string, rel: string, query?: Record<string, string>): string {
        let url = `http://127.0.0.1:${this.port}/${this.secret}/${rootToken}/${encodeURI(rel)}`;
        if (query) {
            const qs = Object.entries(query)
                .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
                .join("&");
            if (qs) url += `?${qs}`;
        }
        return url;
    }

    private handle(req: any, res: any): void {
        try {
            if (req.method !== "GET" && req.method !== "HEAD") {
                res.writeHead(405).end();
                return;
            }
            const parsed = new URL(req.url ?? "/", `http://127.0.0.1:${this.port}`);
            const segments = parsed.pathname.split("/").filter(Boolean).map((s: string) => decodeURIComponent(s));
            if (segments.length < 2 || segments[0] !== this.secret) {
                res.writeHead(404).end();
                return;
            }
            const root = this.roots.get(segments[1]);
            if (!root) {
                res.writeHead(404).end();
                return;
            }
            const rel = segments.slice(2).join("/");
            const abs = this.path.resolve(root, rel);
            const relToRoot = this.path.relative(root, abs);
            if (relToRoot.startsWith("..") || this.path.isAbsolute(relToRoot)) {
                res.writeHead(403).end();
                return;
            }
            const stat = this.fs.existsSync(abs) ? this.fs.statSync(abs) : null;
            if (!stat || !stat.isFile()) {
                res.writeHead(404).end();
                return;
            }
            const ext = this.path.extname(abs).toLowerCase();
            const mime = MIME[ext] ?? "application/octet-stream";
            const headers: Record<string, string> = {
                "Content-Type": mime,
                "Accept-Ranges": "bytes",
                "Cache-Control": "no-cache",
                "Access-Control-Allow-Origin": "*",
            };

            // web 壁纸 html：注入兼容垫片
            if (ext === ".html" || ext === ".htm") {
                let html = this.fs.readFileSync(abs, "utf8") as string;
                html = injectShim(html);
                const buf = Buffer.from(html, "utf8");
                headers["Content-Length"] = String(buf.length);
                res.writeHead(200, headers);
                res.end(req.method === "HEAD" ? undefined : buf);
                return;
            }

            // Range（视频拖动）
            const range = req.headers?.range as string | undefined;
            if (range) {
                const m = /bytes=(\d*)-(\d*)/.exec(range);
                let start = m && m[1] ? parseInt(m[1], 10) : 0;
                let end = m && m[2] ? parseInt(m[2], 10) : stat.size - 1;
                if (isNaN(start) || start < 0) start = 0;
                if (isNaN(end) || end >= stat.size) end = stat.size - 1;
                if (start > end) {
                    res.writeHead(416, { "Content-Range": `bytes */${stat.size}` }).end();
                    return;
                }
                headers["Content-Range"] = `bytes ${start}-${end}/${stat.size}`;
                headers["Content-Length"] = String(end - start + 1);
                res.writeHead(206, headers);
                if (req.method === "HEAD") {
                    res.end();
                    return;
                }
                this.fs.createReadStream(abs, { start, end }).pipe(res);
                return;
            }

            headers["Content-Length"] = String(stat.size);
            res.writeHead(200, headers);
            if (req.method === "HEAD") {
                res.end();
                return;
            }
            this.fs.createReadStream(abs).pipe(res);
        } catch (err) {
            console.warn("[we-bg] serve failed:", err);
            try {
                res.writeHead(500).end();
            } catch {
                /* ignore */
            }
        }
    }
}

function injectShim(html: string): string {
    if (html.includes("data-we-bg-shim")) return html;
    if (/<head[^>]*>/i.test(html)) {
        return html.replace(/(<head[^>]*>)/i, `$1${SHIM}`);
    }
    return SHIM + html;
}

/** 随机 token：优先 Node crypto，缺失时回退到不透明随机串 */
function randomHex(crypto: any, bytes: number): string {
    try {
        if (crypto?.randomBytes) return String(crypto.randomBytes(bytes).toString("hex"));
    } catch {
        /* ignore */
    }
    let out = "";
    for (let i = 0; i < bytes * 2; i++) out += Math.floor(Math.random() * 16).toString(16);
    return out;
}
