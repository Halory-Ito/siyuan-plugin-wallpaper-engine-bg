/** 简单 i18n：思源会把 i18n/<lang>.json 注入到 plugin.i18n */
let dict: Record<string, string> = {};

export function setI18n(d: Record<string, any>): void {
    dict = (d ?? {}) as Record<string, string>;
}

export function t(key: string): string {
    const v = dict[key];
    return typeof v === "string" ? v : key;
}

export function tArgs(key: string, args: Record<string, string | number>): string {
    let s = t(key);
    for (const [k, v] of Object.entries(args)) {
        s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
    return s;
}
