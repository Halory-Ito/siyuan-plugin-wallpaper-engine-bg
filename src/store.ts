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

/** 只接受配置对象：文件缺失时 loadData 可能返回 {code,msg,data} 错误封套，不能当配置合并 */
function isConfigLike(value: any): boolean {
    return !!value && typeof value === "object" && !Array.isArray(value) && typeof value.code !== "number";
}

export async function loadState(plugin: Plugin): Promise<void> {
    pluginRef = plugin;
    try {
        const common = await plugin.loadData(COMMON_FILE);
        if (isConfigLike(common)) {
            state.common = normalizeCommon(common);
        }
    } catch {
        /* ignore */
    }
    try {
        const device = await plugin.loadData(deviceFile());
        if (isConfigLike(device)) {
            state.device = { ...defaultDevice(), ...device, hostId: hostId() };
        }
    } catch {
        /* ignore */
    }
}

/** 防抖保存：显示设置存 local.json，本机路径存 device-<host>.json */
export function saveState(): void {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(persistNow, 400);
}

export async function persistNow(): Promise<void> {
    if (!pluginRef) return;
    const p = pluginRef;
    try {
        await p.saveData(COMMON_FILE, state.common);
        await p.saveData(deviceFile(), state.device);
    } catch (err) {
        console.warn("[we-bg] save config failed:", err);
    }
}

/** 恢复默认参数 */
export function resetCommon(): void {
    state.common = defaultCommon();
    saveState();
}
