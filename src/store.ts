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

const deviceFile = () => `${DEVICE_PREFIX}${hostId()}.json`;

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 磁盘基线：最后一次「确实读到 / 确实写成功」的内容。
 *
 * null 表示**读取失败、磁盘上的内容未知** —— 此时禁止写盘。
 * 这是整个持久化最关键的一条：读取失败时内存里是默认值，
 * 一旦写下去就把用户保存的配置抹掉了（这正是「重启回到初始化」的成因）。
 */
let baselineCommon: string | null = null;
let baselineDevice: string | null = null;

/** 写盘串行队列：同时写同一个 petal 文件会让内核 rename 失败（Access is denied） */
let writeChain: Promise<void> = Promise.resolve();

/** 配置存储诊断信息，展示在设置页「配置存储」一栏 */
export const storageDiag = { common: "尚未读取", device: "尚未读取", path: "" };

function setDiag(domain: "common" | "device", text: string): void {
    storageDiag[domain] = text;
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
 *   - 配置对象（内核以 application/json 返回时 fetchPost 直接解析）
 *   - JSON 字符串（非 json 响应类型时 fetchPost 走 response.text()）
 *   - {code, msg, data} 封套（文件不存在、或内核返回错误时）
 */
type Parsed = { kind: "ok"; value: any } | { kind: "missing" } | { kind: "failed"; note: string };

/** 供诊断用：描述 loadData 到底返回了什么 */
function describeRaw(raw: any): string {
    if (raw === null) return "null";
    if (raw === undefined) return "undefined";
    if (typeof raw === "string") return raw === "" ? "空字符串" : `字符串(${raw.length} 字符)`;
    if (typeof raw === "object") return `对象(${Object.keys(raw).slice(0, 8).join(",")})`;
    return typeof raw;
}

function parseStored(raw: any): Parsed {
    let value = raw;
    if (value === null || value === undefined || value === "") return { kind: "missing" };
    if (typeof value === "object" && !Array.isArray(value) && typeof value.code === "number") {
        // 封套：404 类当作文件不存在，其余当作读取失败（不能当成默认值静默处理）
        const msg = typeof value.msg === "string" ? value.msg : "";
        const notFound = value.code === 404 || value.code === -404 || /not found|no such file|不存在/i.test(msg);
        if (value.code !== 0 && !notFound) return { kind: "failed", note: `code=${value.code} ${msg}` };
        if (value.code !== 0 || !value.data) return { kind: "missing" };
        value = value.data;
    }
    if (typeof value === "string") {
        const text = value.trim();
        if (!text) return { kind: "missing" };
        try {
            value = JSON.parse(text);
        } catch {
            return { kind: "failed", note: "不是合法 JSON" };
        }
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return { kind: "failed", note: `内容不是对象（${describeRaw(value)}）` };
    }
    return { kind: "ok", value };
}

/** 读取一份存储，失败时重试（写盘是「写临时文件 + rename」，撞上时会拿到空内容或 404） */
async function readStored(plugin: Plugin, name: string): Promise<Parsed> {
    let last: Parsed = { kind: "missing" };
    for (let attempt = 0; attempt < 5; attempt++) {
        try {
            last = parseStored(await plugin.loadData(name));
        } catch (err: any) {
            last = { kind: "failed", note: `loadData 抛错: ${err?.msg ?? err?.message ?? String(err)}` };
        }
        if (last.kind === "ok") return last;
        if (attempt < 4) await delay(120 * (attempt + 1));
    }
    return last;
}

/** 只接受配置对象：文件缺失时 loadData 可能返回 {code,msg,data} 错误封套，不能当配置合并 */
function isConfigLike(value: any): boolean {
    return !!value && typeof value === "object" && !Array.isArray(value) && typeof value.code !== "number";
}

function diagText(name: string, r: Parsed): string {
    if (r.kind === "ok") return `读取成功（${name}）`;
    if (r.kind === "missing") return `文件不存在，使用默认值（${name}）`;
    return `读取失败：${r.note}（${name}）`;
}

/** 读取持久化配置；读到的内容写入磁盘基线，读失败则把基线置空（禁止写盘） */
export async function loadState(plugin: Plugin): Promise<void> {
    pluginRef = plugin;
    storageDiag.path = `/data/storage/petal/${plugin.name}/`;

    const common = await readStored(plugin, COMMON_FILE);
    if (common.kind === "ok" && isConfigLike(common.value)) {
        state.common = normalizeCommon(common.value);
        baselineCommon = JSON.stringify(state.common);
    } else {
        baselineCommon = null;
        if (common.kind === "failed") {
            console.warn("[we-bg] 读取 local.json 失败，本次不会写盘以避免覆盖已保存的配置：" + common.note);
        }
    }
    setDiag("common", diagText(COMMON_FILE, common));

    const device = await readStored(plugin, deviceFile());
    if (device.kind === "ok" && isConfigLike(device.value)) {
        state.device = { ...defaultDevice(), ...device.value, hostId: hostId() };
        baselineDevice = JSON.stringify(state.device);
    } else {
        baselineDevice = null;
        if (device.kind === "failed") {
            console.warn("[we-bg] 读取本机配置失败：" + device.note);
        }
    }
    setDiag("device", diagText(deviceFile(), device));
}

/** 本地是否有还没写盘的改动 */
export function hasUnsavedChanges(): boolean {
    return (
        (baselineCommon !== null && baselineCommon !== JSON.stringify(state.common)) ||
        (baselineDevice !== null && baselineDevice !== JSON.stringify(state.device))
    );
}

/**
 * 基线未知（启动时没读到）时补读一次，成功就把磁盘内容作为基线。
 * 返回 false 表示磁盘上的内容仍然未知 —— 调用方必须放弃写盘。
 */
async function refreshBaselines(plugin: Plugin): Promise<boolean> {
    let ok = true;
    if (baselineCommon === null) {
        const r = await readStored(plugin, COMMON_FILE);
        if (r.kind === "failed") {
            ok = false;
        } else {
            if (r.kind === "ok" && isConfigLike(r.value)) state.common = normalizeCommon(r.value);
            baselineCommon = JSON.stringify(state.common);
        }
        setDiag("common", diagText(COMMON_FILE, r));
    }
    if (baselineDevice === null) {
        const r = await readStored(plugin, deviceFile());
        if (r.kind === "failed") {
            ok = false;
        } else {
            if (r.kind === "ok" && isConfigLike(r.value)) {
                state.device = { ...defaultDevice(), ...r.value, hostId: hostId() };
            }
            baselineDevice = JSON.stringify(state.device);
        }
        setDiag("device", diagText(deviceFile(), r));
    }
    return ok;
}

/**
 * 重新从磁盘读取配置并采纳（不写回）。
 * 思源在插件存储数据变化时会调用 onDataChanged，用它做跨窗口 / 跨设备同步。
 */
export async function reloadFromDisk(): Promise<boolean> {
    const p = pluginRef;
    if (!p) return false;
    let changed = false;

    const common = await readStored(p, COMMON_FILE);
    if (common.kind === "ok" && isConfigLike(common.value)) {
        const next = normalizeCommon(common.value);
        if (JSON.stringify(next) !== JSON.stringify(state.common)) changed = true;
        state.common = next;
        baselineCommon = JSON.stringify(state.common);
    } else if (common.kind !== "failed") {
        baselineCommon = JSON.stringify(state.common);
    }
    setDiag("common", diagText(COMMON_FILE, common));

    const device = await readStored(p, deviceFile());
    if (device.kind === "ok" && isConfigLike(device.value)) {
        const next = { ...defaultDevice(), ...device.value, hostId: hostId() };
        if (JSON.stringify(next) !== JSON.stringify(state.device)) changed = true;
        state.device = next;
        baselineDevice = JSON.stringify(state.device);
    } else if (device.kind !== "failed") {
        baselineDevice = JSON.stringify(state.device);
    }
    setDiag("device", diagText(deviceFile(), device));

    return changed;
}

/**
 * 外部（另一个窗口 / 另一台设备）改动了插件存储时调用。
 *
 * **本地有未保存的改动时以本地为准**：先把本地写下去，不要被磁盘上的旧内容回滚。
 * 否则会出现「点了预设立刻被弹回去、而且什么都没保存」的现象。
 */
export async function onExternalDataChange(): Promise<boolean> {
    if (hasUnsavedChanges()) {
        await persistNow();
        return false;
    }
    return reloadFromDisk();
}

/** 防抖保存：显示设置存 local.json，本机路径存 device-<host>.json */
export function saveState(): void {
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

/** 立即写盘（只在磁盘基线已知、且内容确实变化时真正落盘） */
export async function persistNow(force = false): Promise<void> {
    if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
    }
    const p = pluginRef;
    if (!p) return;

    writeChain = writeChain.then(async () => {
        // 基线未知 → 先补读；补读仍然失败就彻底放弃本次写盘（绝不覆盖）
        if (baselineCommon === null || baselineDevice === null) {
            const recovered = await refreshBaselines(p);
            if (!recovered) {
                console.warn("[we-bg] 磁盘上的配置仍无法读取，已跳过写盘以免覆盖（见设置页「配置存储」）");
                return;
            }
        }

        const commonJson = JSON.stringify(state.common);
        const deviceJson = JSON.stringify(state.device);
        const needCommon = baselineCommon !== commonJson;
        const needDevice = baselineDevice !== deviceJson;
        if (!needCommon && !needDevice && !force) return;

        const write = async (): Promise<void> => {
            if (needCommon) {
                await writeStored(p, COMMON_FILE, state.common);
                baselineCommon = JSON.stringify(state.common);
            }
            if (needDevice) {
                await writeStored(p, deviceFile(), state.device);
                baselineDevice = JSON.stringify(state.device);
            }
        };

        try {
            await write();
        } catch (err) {
            // 写入失败很可能是与其它读/写撞上了（Windows 上 rename 会被拒绝），隔一会儿重试一次
            try {
                await delay(300);
                await write();
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
