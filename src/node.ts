/**
 * Node/Electron 能力探测。
 *
 * 思源桌面端渲染进程可以直接 `window.require` 拿到 Node 模块；
 * 浏览器端 / 移动端没有该能力，相关功能需要优雅降级。
 */

type NodeRequireFn = (name: string) => any;

export function getNodeRequire(): NodeRequireFn | null {
    const req = (window as any).require;
    return typeof req === "function" ? (req as NodeRequireFn) : null;
}

export function nodeMod<T = any>(name: string): T | null {
    try {
        const mod = getNodeRequire()?.(name);
        return (mod ?? null) as T | null;
    } catch {
        return null;
    }
}

export function isDesktop(): boolean {
    return !!nodeMod("fs");
}

/** 本机标识：主机名 + 用户名，用于区分不同设备的本机配置 */
export function hostId(): string {
    try {
        const os = nodeMod<any>("os");
        if (os) {
            const user = typeof os.userInfo === "function" ? (os.userInfo()?.username ?? "") : "";
            return `${os.hostname()}-${user}`.replace(/[^\w.-]/g, "_");
        }
    } catch {
        /* ignore */
    }
    return "browser";
}

/** 绝对路径 -> file:// URL（仅作为无本地服务器时的回退） */
export function fileUrl(absPath: string): string {
    let norm = absPath.replace(/\\/g, "/");
    if (!/^[a-zA-Z]:\//.test(norm) && !norm.startsWith("/")) {
        norm = "/" + norm;
    }
    return "file://" + encodeURI(norm).replace(/#/g, "%23").replace(/\?/g, "%3F");
}
