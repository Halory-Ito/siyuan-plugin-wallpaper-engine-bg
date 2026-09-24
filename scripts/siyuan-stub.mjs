/** 思源 "siyuan" 模块的最小桩实现，仅供 scripts/ui-smoke.mjs 使用 */
export class Plugin {
    constructor(options = {}) {
        Object.assign(this, options);
        this.i18n = options.i18n ?? {};
    }
    addCommand() {}
    addIcons() {}
    addTopBar() {
        return document.createElement("div");
    }
    addStatusBar() {
        return document.createElement("div");
    }
    async loadData() {
        return null;
    }
    async saveData() {}
    async removeData() {}
    openSetting() {}
    onunload() {}
}

export class Setting {
    constructor() {
        this.element = document.createElement("div");
    }
    addItem() {}
    open() {}
}

export class Dialog {
    constructor(options = {}) {
        this.element = document.createElement("div");
        this.element.className = "b3-dialog";
        this.element.innerHTML = options.content ?? "";
        this.destroyCallback = options.destroyCallback;
        // 对齐思源真实行为：对话框会挂载到文档中
        document.body.append(this.element);
    }
    destroy() {
        this.element.remove();
        this.destroyCallback?.();
    }
    bindInput() {}
}

export class Menu {
    constructor() {}
    addItem() {}
    addSeparator() {}
    open() {}
    close() {}
}

export function showMessage() {}
export function hideMessage() {}
export function confirm() {}
export function getFrontend() {
    return "desktop";
}
export function getBackend() {
    return "windows";
}
export const fetchPost = () => Promise.resolve({ code: 0, data: null });
export const fetchSyncPost = () => ({ code: 0, data: null });
