/**
 * 思源 "siyuan" 模块的最小桩实现，仅供 scripts/ui-smoke.mjs 使用。
 *
 * 插件存储用 globalThis.__siyuanStub 共享：esbuild 会把本文件内联进每个 bundle，
 * 测试与插件各自持有一份模块实例，只能通过全局对象交换状态。
 */

const stub = (globalThis.__siyuanStub ??= {
    /** 存储内容：{ [name]: object } */
    files: {},
    /** loadData / saveData 调用记录 */
    loads: [],
    saves: [],
    /** loadData 的返回形状：object | string | envelope | broken */
    shape: "object",
    /** 接下来多少次 saveData 返回失败（用于测重试） */
    failSaves: 0,
});

export const __stub = stub;

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
    async loadData(name) {
        stub.loads.push(name);
        const value = stub.files[name];
        switch (stub.shape) {
            case "string":
                return value === undefined ? null : JSON.stringify(value);
            case "envelope":
                return value === undefined
                    ? { code: 404, msg: "not found", data: null }
                    : { code: 0, msg: "", data: value };
            case "broken":
                return "{\"enabled\": tru";
            default:
                return value === undefined ? null : value;
        }
    }
    async saveData(name, data) {
        stub.saves.push({ name, data });
        if (stub.failSaves > 0) {
            stub.failSaves--;
            return { code: -1, msg: "write failed" };
        }
        stub.files[name] = JSON.parse(JSON.stringify(data));
        return { code: 0, msg: "", data: null };
    }
    async removeData(name) {
        delete stub.files[name];
        return { code: 0 };
    }
    openSetting() {}
    onunload() {}
    /** 对齐思源基类：未覆盖时思源会改为重载整个插件 */
    onDataChanged() {}
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
