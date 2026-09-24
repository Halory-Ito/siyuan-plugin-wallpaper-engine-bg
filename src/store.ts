import type { Plugin } from "siyuan";
import { hostId } from "./node";
import type { CommonConfig, DeviceConfig, PanelBg, PanelSurface } from "./types";

const COMMON_FILE = "local.json";
const DEVICE_PREFIX = "device-";

/**
 * 各结构默认背景。当前默认值取自实际使用中调好的配置：
 * 全部结构默认完全透明（露出壁纸），编辑器预置自定义色（深色模式用紫色）但透明度为 0，
 * 需要着色时把对应透明度拉高即可。
 */
export const defaultPanels = (): Record<PanelSurface, PanelBg> => ({
    editor: { useTheme: false, color: "#1f2f1e", colorDark: "#732eb8", alpha: 0 },
    docTree: { useTheme: true, color: "#1f2430", colorDark: "#1f2430", alpha: 0 },
    outline: { useTheme: true, color: "#1f2430", colorDark: "#1f2430", alpha: 0 },
    code: { useTheme: true, color: "#1f2430", colorDark: "#1f2430", alpha: 0 },
    sidebar: { useTheme: true, color: "#1f2430", colorDark: "#1f2430", alpha: 0 },
    chrome: { useTheme: true, color: "#1f2430", colorDark: "#1f2430", alpha: 0 },
    other: { useTheme: true, color: "#1f2430", colorDark: "#1f2430", alpha: 0 },
});

export const defaultCommon = (): CommonConfig => ({
    enabled: true,
    urlWallpaper: "",
    rotateMinutes: 0,
    randomOnStart: false,
    fit: "cover",
    positionX: 0,
    positionY: 0,
    maskEnabled: true,
    maskColor: "#000000",
    maskOpacity: 0,
    blur: 4,
    brightness: 0.4,
    saturate: 2,
    uiMode: "panels",
    uiStrength: 0.4,
    panels: defaultPanels(),
    muted: true,
    volume: 0,
    playbackRate: 1,
    pauseWhenHidden: true,
    webMuted: true,
});

export const defaultDevice = (): DeviceConfig => ({
    hostId: hostId(),
    workshopDirs: [],
    wallpaper: null,
});

export const state: { common: CommonConfig; device: DeviceConfig } = {
    common: defaultCommon(),
    device: defaultDevice(),
};

let pluginRef: Plugin | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
/** 最近一次「读到的 / 写成功的」内容快照，没有变化就不写盘（见 persistNow） */
let persisted = "";
/** 写盘串行队列：同时写同一个 petal 文件会让内核 rename 失败 */
let writeChain: Promise<void> = Promise.resolve();
/** 启动时读到了脏数据（而不是「文件不存在」） */
let loadBroken = false;
/** onload 是否已结束：读取失败时，启动阶段的自动写盘全部跳过，避免用默认值覆盖用户配置 */
let startupDone = false;

const deviceFile = () => `${DEVICE_PREFIX}${hostId()}.json`;

/** 内存状态的快照，用于判断是否真的需要写盘 */
function snapshot(): string {
    return JSON.stringify([state.common, state.device]);
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 合并旧配置并做版本迁移（旧版的 glass 模式迁移为 panels） */
export function normalizeCommon(raw: any): CommonConfig {
    const merged: CommonConfig = { ...defaultCommon(), ...raw };
    const defaults = defaultPanels();
    const rawPanels = (raw?.panels ?? {}) as Partial<Record<PanelSurface, Partial<PanelBg>>>;
    merged.panels = {} as Record<PanelSurface, PanelBg>;
    for (const key of Object.keys(defaults) as PanelSurface[]) {
        merged.panels[key] = { ...defaults[key], ...(rawPanels[key] ?? {}) };
    }
    if ((raw as any)?.uiMode === "glass") {
        merged.uiMode = "panels";
        if (raw.uiStrength !== undefined) merged.uiStrength = 1;
    }
    // 旧版 fit=fill 更名为 stretch
    if ((raw as any)?.fit === "fill") merged.fit = "stretch";
    return merged;
}

/**
 * 把 loadData 的返回值归一到配置对象。
 *
 * loadData 的返回形状随思源版本变化，必须全部兼容：
 *   - 配置对象（内核以 application/json 返回时 fetchPost 会直接解析）
 *   - JSON 字符串（非 json 响应类型时 fetchPost 走 response.text()）
 *   - {code, msg, data} 封套（文件不存在、或内核返回错误时）
 */
type Parsed = { kind: "ok"; value: any } | { kind: "missing" } | { kind: "broken" };

function parseStored(raw: any): Parsed {
    let value = raw;
    if (value === null || value === undefined || value === "") return { kind: "missing" };
    if (typeof value === "object" && !Array.isArray(value) && typeof value.code === "number") {
        // 封套：404 类当作文件不存在，其余当作读取失败（不能当成默认值静默处理）
        const msg = typeof value.msg === "string" ? value.msg : "";
        const notFound = value.code === 404 || value.code === -404 || /not found|no such file|不存在/i.test(msg);
        if (value.code !== 0 && !notFound) return { kind: "broken" };
        if (value.code !== 0 || !value.data) return { kind: "missing" };
        value = value.data;
    }
    if (typeof value === "string") {
        const text = value.trim();
        if (!text) return { kind: "missing" };
        try {
            value = JSON.parse(text);
        } catch {
            return { kind: "broken" };
        }
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) return { kind: "broken" };
    return { kind: "ok", value };
}

/**
 * 读取一份存储，失败时重试。
 * 写盘是「写临时文件 + rename」，读到一半/写到一半撞上时会拿到空内容或 404，
 * 重试一次基本就能拿到真实数据。
 */
async function readStored(plugin: Plugin, name: string): Promise<Parsed> {
    let last: Parsed = { kind: "missing" };
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            last = parseStored(await plugin.loadData(name));
        } catch {
            last = { kind: "broken" };
        }
        if (last.kind === "ok") return last;
        await delay(80 * (attempt + 1));
    }
    return last;
}

/** 只接受配置对象：文件缺失时 loadData 可能返回 {code,msg,data} 错误封套，不能当配置合并 */
function isConfigLike(value: any): boolean {
    return !!value && typeof value === "object" && !Array.isArray(value) && typeof value.code !== "number";
}

/**
 * 读取持久化配置。
 *
 * 注意：读取失败时**不能**把内存里的默认值写回去，否则用户的配置会被直接抹掉。
 * 这里通过把 persisted 基线设为当前内存快照来保证：没变化就不写盘。
 */
export async function loadState(plugin: Plugin): Promise<void> {
    pluginRef = plugin;
    let failed = false;

    const common = await readStored(plugin, COMMON_FILE);
    if (common.kind === "ok" && isConfigLike(common.value)) {
        state.common = normalizeCommon(common.value);
    } else if (common.kind === "broken") {
        failed = true;
    }

    const device = await readStored(plugin, deviceFile());
    if (device.kind === "ok" && isConfigLike(device.value)) {
        state.device = { ...defaultDevice(), ...device.value, hostId: hostId() };
    } else if (device.kind === "broken") {
        failed = true;
    }

    persisted = snapshot();
    loadBroken = failed;
    if (failed) {
        console.warn(
            "[we-bg] 读取插件配置失败，已保留当前值且不会覆盖磁盘上的配置。" +
                "请检查 data/storage/petal/wallpaper-engine-bg/ 下的 local.json 是否为合法 JSON。"
        );
    }
}

/**
 * 重新从磁盘读取配置（不写回）。
 * 思源在插件存储数据变化时会调用 onDataChanged，用它做跨窗口 / 跨设备同步。
 */
export async function reloadFromDisk(): Promise<boolean> {
    const p = pluginRef;
    if (!p) return false;
    let changed = false;

    const common = await readStored(p, COMMON_FILE);
    if (common.kind === "ok" && isConfigLike(common.value)) {
        state.common = normalizeCommon(common.value);
        changed = true;
    }

    const device = await readStored(p, deviceFile());
    if (device.kind === "ok" && isConfigLike(device.value)) {
        state.device = { ...defaultDevice(), ...device.value, hostId: hostId() };
        changed = true;
    }

    // 磁盘上的就是最新状态，重置基线避免把它原样写回去（那会再触发一次存储变更通知）
    persisted = snapshot();
    return changed;
}

/** 启动阶段结束（由 onload 末尾调用）：此后即使读取失败也允许写盘，否则用户的改动会丢 */
export function finishStartup(): void {
    startupDone = true;
}

/** 防抖保存：显示设置存 local.json，本机路径存 device-<host>.json */
export function saveState(): void {
    // 启动阶段读到脏数据时什么都不写：内存里是默认值，写下去就把用户配置抹了
    if (loadBroken && !startupDone) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void persistNow(), 300);
}

/** 写盘时检查返回码：saveData 在内核写失败时也是 resolve，只能自己看 code */
async function writeStored(p: Plugin, name: string, data: unknown): Promise<void> {
    const res: any = await p.saveData(name, data);
    if (res && typeof res === "object" && typeof res.code === "number" && res.code !== 0) {
        throw new Error(`saveData(${name}) failed: code=${res.code} ${res.msg ?? ""}`);
    }
}

/**
 * 立即写盘。
 *
 * 两个关键点：
 *   1. 内容没变化就什么都不做 —— 启动时 applyLook / onunload 都会调到这里，
 *      若无条件写盘，每次重载都会产生一次「存储变更」通知，进而又触发重载。
 *   2. 串行化 —— 思源落盘是「写 .tmp + rename」，同时写同一个文件时
 *      Windows 上 rename 会报 Access is denied，导致写入丢失。
 */
export async function persistNow(force = false): Promise<void> {
    if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
    }
    const p = pluginRef;
    if (!p) return;
    if (loadBroken && !startupDone && !force) return;

    writeChain = writeChain.then(async () => {
        const next = snapshot();
        if (next === persisted) return;
        try {
            await writeStored(p, COMMON_FILE, state.common);
            await writeStored(p, deviceFile(), state.device);
            persisted = next;
        } catch (err) {
            // 写入失败很可能是与其它读/写撞上了，隔一会儿重试一次
            try {
                await delay(300);
                await writeStored(p, COMMON_FILE, state.common);
                await writeStored(p, deviceFile(), state.device);
                persisted = snapshot();
            } catch (retryErr) {
                console.warn("[we-bg] save config failed:", retryErr ?? err);
            }
        }
    });
    await writeChain;
}

/** 恢复默认参数 */
export function resetCommon(): void {
    state.common = defaultCommon();
    saveState();
}
