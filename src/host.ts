import type { WEWallpaper } from "./types";

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
    library(): Promise<WEWallpaper[]>;
    pickWallpaper(wp: WEWallpaper): void;
    currentWallpaper(): WEWallpaper | null;
    previewUrl(wp: WEWallpaper): string;
    isDesktopEnv(): boolean;
}
