/** 轻量 DOM 工具：统一用思源自带的 b3-* 样式类 */

export function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    attrs: Record<string, string | boolean | EventListener> = {},
    ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (k === "class") node.className = String(v);
        else if (k === "text") node.textContent = String(v);
        else if (k === "html") node.innerHTML = String(v);
        else if (typeof v === "function") node.addEventListener(k.replace(/^on/, ""), v as EventListener);
        else if (v === false) continue;
        else if (v === true) node.setAttribute(k, "");
        else node.setAttribute(k, String(v));
    }
    for (const child of children) {
        node.append(typeof child === "string" ? document.createTextNode(child) : child);
    }
    return node;
}

export function switchEl(checked: boolean, onChange: (value: boolean) => void): HTMLElement {
    const input = el("input", {
        class: "b3-switch",
        type: "checkbox",
        onchange: (e: Event) => onChange((e.target as HTMLInputElement).checked),
    }) as HTMLInputElement;
    input.checked = checked;
    return input;
}

export interface RangeOptions {
    min: number;
    max: number;
    step: number;
    value: number;
    format?: (v: number) => string;
    onInput: (v: number) => void;
}

/** 滑杆句柄：外部改动数值时用它同步滑块与数值文本 */
export interface RangeHandle {
    root: HTMLElement;
    set(value: number): void;
}

export function rangeEl(opts: RangeOptions): HTMLElement {
    return rangeWithHandle(opts).root;
}

export function rangeWithHandle(opts: RangeOptions): RangeHandle {
    const fmt = opts.format ?? defaultFormat;
    const label = el("span", { class: "we-value" }, fmt(opts.value));
    const input = el("input", {
        class: "b3-slider we-slider",
        type: "range",
        min: String(opts.min),
        max: String(opts.max),
        step: String(opts.step),
        oninput: (e: Event) => {
            const v = parseFloat((e.target as HTMLInputElement).value);
            label.textContent = fmt(v);
            opts.onInput(v);
        },
    }) as HTMLInputElement;
    input.value = String(opts.value);
    return {
        root: el("div", { class: "we-range" }, input, label),
        set: (v: number) => {
            input.value = String(v);
            label.textContent = fmt(v);
        },
    };
}

function defaultFormat(v: number): string {
    return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

export function selectEl(
    value: string,
    options: { value: string; label: string }[],
    onChange: (v: string) => void
): HTMLSelectElement {
    const sel = el("select", {
        class: "b3-select",
        onchange: (e: Event) => onChange((e.target as HTMLSelectElement).value),
    });
    for (const opt of options) {
        const o = el("option", { value: opt.value }, opt.label) as HTMLOptionElement;
        if (opt.value === value) o.selected = true;
        sel.append(o);
    }
    return sel;
}

export function textEl(
    value: string,
    placeholder: string,
    onChange: (v: string) => void,
    multiline = false
): HTMLElement {
    const attrs = {
        class: "b3-text-field we-text",
        placeholder,
        oninput: (e: Event) => onChange((e.target as HTMLInputElement | HTMLTextAreaElement).value),
    };
    const node = multiline ? el("textarea", attrs) : el("input", { ...attrs, type: "text" });
    (node as HTMLInputElement | HTMLTextAreaElement).value = value;
    return node;
}

export function colorEl(value: string, onChange: (v: string) => void): HTMLInputElement {
    const input = el("input", {
        class: "we-color",
        type: "color",
        oninput: (e: Event) => onChange((e.target as HTMLInputElement).value),
    }) as HTMLInputElement;
    input.value = value;
    return input;
}

/** 调色板色块 */
export interface PaletteSwatch {
    /** 语义值，作为选中标记与回调参数 */
    value: string;
    /** 填充色；kind 为 transparent / theme 时可省略 */
    color?: string;
    /** 色块外观：color 纯色（默认）、transparent 棋盘格、theme 主题色渐变 */
    kind?: "color" | "transparent" | "theme";
    title: string;
}

export interface PaletteHandle {
    root: HTMLElement;
    /** 高亮对应色块；不在调色板内则全部取消高亮 */
    set(value: string): void;
}

/** 调色板：一排预设色块，点选即回调，用于「一眼可见、一点即改」的颜色选择 */
export function paletteEl(
    swatches: PaletteSwatch[],
    value: string,
    onPick: (value: string) => void
): PaletteHandle {
    const root = el("div", { class: "we-palette" });
    const buttons: HTMLButtonElement[] = [];
    const set = (current: string): void => {
        for (const btn of buttons) btn.classList.toggle("we-swatch--on", btn.dataset.value === current);
    };
    for (const sw of swatches) {
        const kind = sw.kind ?? "color";
        const btn = el("button", {
            class: `we-swatch we-swatch--${kind}`,
            type: "button",
            title: sw.title,
            "aria-label": sw.title,
        }) as HTMLButtonElement;
        btn.dataset.value = sw.value;
        if (sw.color) btn.style.setProperty("--we-swatch", sw.color);
        btn.addEventListener("click", () => {
            set(sw.value);
            onPick(sw.value);
        });
        buttons.push(btn);
        root.append(btn);
    }
    set(value);
    return { root, set };
}

export function buttonEl(text: string, onClick: () => void, className = "b3-button b3-button--outline"): HTMLElement {
    return el("button", { class: className, type: "button", onclick: onClick }, text);
}

/** 设置面板里的标签 + 控件行 */
export function actionWrap(...nodes: (Node | string)[]): HTMLElement {
    return el("div", { class: "we-action fn__flex fn__flex-center" }, ...nodes);
}

export function fmtPercent(v: number): string {
    return `${Math.round(v * 100)}%`;
}

export function fmtPx(v: number): string {
    return `${Math.round(v)}px`;
}

export function fmtRatio(v: number): string {
    return `${v.toFixed(2)}x`;
}
