export type WallpaperType = "video" | "web" | "image" | "scene" | "application" | "unknown";

/**
 * 一条壁纸记录。路径均为本机绝对路径（网络壁纸除外）。
 */
export interface WEWallpaper {
    /** 稳定标识：dir + "||" + entry */
    key: string;
    /** 工程目录名（或文件名） */
    id: string;
    title: string;
    type: WallpaperType;
    /** 工程目录（网络壁纸时为空） */
    dir: string;
    /** 入口文件绝对路径：video/web/image 的媒体或 html；scene/application 时为预览图 */
    entry: string;
    /** 预览图绝对路径，可能为空 */
    preview: string;
    /** 是否可以直接渲染（scene/application 只能回退到预览图） */
    supported: boolean;
    note: "ok" | "preview-only" | "missing-entry";
}

/** 解析出可直接渲染的壁纸 */
export interface ResolvedWallpaper {
    key: string;
    title: string;
    kind: "video" | "image" | "web";
    url: string;
    previewUrl: string;
    /** scene 等回退渲染时为 true */
    fallback: boolean;
}

export type FitMode = "cover" | "contain" | "stretch" | "blurfill";

/**
 * 界面透明模式：
 *   panels  —— 逐个结构（编辑器 / 文档树 / 目录树 / 侧边栏…）设置背景色与透明度，推荐
 *   opacity —— 降低整个界面不透明度，兼容性最好
 *   off     —— 不修改界面（壁纸会被界面完全挡住）
 */
export type UIMode = "panels" | "opacity" | "off";

/** 可自定义背景的界面结构 */
export type PanelSurface =
    | "editor"
    | "docTree"
    | "outline"
    | "code"
    | "sidebar"
    | "chrome"
    | "other";

export interface PanelBg {
    /** true = 跟随主题背景色（只调透明度，自动适配深色/浅色模式），false = 自定义颜色 */
    useTheme: boolean;
    /** 自定义颜色：浅色模式（useTheme=false 时生效） */
    color: string;
    /** 自定义颜色：深色模式（留空则与 color 相同） */
    colorDark: string;
    /** 不透明度 0-1，0 = 完全透明 */
    alpha: number;
}

/** 跨设备共享的显示设置 */
export interface CommonConfig {
    enabled: boolean;
    /* 壁纸 */
    urlWallpaper: string;
    rotateMinutes: number;
    randomOnStart: boolean;
    /* 画面 */
    fit: FitMode;
    positionX: number;
    positionY: number;
    /* Mask */
    maskEnabled: boolean;
    maskColor: string;
    maskOpacity: number;
    blur: number;
    brightness: number;
    saturate: number;
    /* 界面透明 */
    uiMode: UIMode;
    /** panels 模式：各结构不透明度的整体倍率；opacity 模式：整体透明强度 */
    uiStrength: number;
    panels: Record<PanelSurface, PanelBg>;
    /* 播放 */
    muted: boolean;
    volume: number;
    playbackRate: number;
    pauseWhenHidden: boolean;
    /** 向 web 壁纸注入静音垫片 */
    webMuted: boolean;
}

/** 仅本机生效的设置（绝对路径不跨设备同步） */
export interface DeviceConfig {
    hostId: string;
    /** 壁纸库根目录，例如 workshop/content/431960 */
    workshopDirs: string[];
    wallpaper: WEWallpaper | null;
}
