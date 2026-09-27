import type { WallpaperItem } from "./types";

/** 插件各 UI 模块需要的宿主能力，由 index.ts 的插件类实现 */
export interface Host {
    /** 把当前配置套用到画面 / 遮罩 / 界面，并保存 */
    applyLook(): void;
    randomWallpaper(): void;
    stepWallpaper(step: number): void;
    togglePlay(): void;
    isPlaying(): boolean;
    openLibrary(): void;
    openQuickPanel(): void;
    refreshLibrary(): Promise<number>;
    library(): Promise<WallpaperItem[]>;
    pickWallpaper(wp: WallpaperItem): void;
    currentWallpaper(): WallpaperItem | null;
    /** 当前生效壁纸的显示名（网络来源时为 URL，未设置时为空字符串） */
    currentTitle(): string;
    previewUrl(wp: WallpaperItem): string;
    isDesktopEnv(): boolean;
}
