import { Dialog, showMessage } from "siyuan";
import { t, tArgs } from "./i18n";
import type { Host } from "./host";
import type { WEWallpaper } from "./types";
import { buttonEl, el } from "./ui";

const TYPE_KEY: Record<string, string> = {
    video: "libTypeVideo",
    web: "libTypeWeb",
    image: "libTypeImage",
    scene: "libTypeScene",
    application: "libTypeApplication",
    unknown: "libTypeUnknown",
};

/**
 * 壁纸库选择器：缩略图网格，点选即应用。
 */
export function openLibrary(host: Host): void {
    let dialogRef: Dialog | null = null;
    dialogRef = new Dialog({
        title: t("libTitle"),
        content: '<div class="we-lib-mount"></div>',
        width: "min(880px, 94vw)",
        height: "min(620px, 84vh)",
        destroyCallback: () => {
            dialogRef = null;
        },
    });

    const mount = dialogRef.element.querySelector(".we-lib-mount") as HTMLElement;
    const status = el("div", { class: "we-lib-status" }, t("libScanning"));
    const grid = el("div", { class: "we-lib-grid" });
    const toolbar = el(
        "div",
        { class: "we-lib-toolbar" },
        buttonEl(t("libRescan"), () => void render(true)),
        status,
    );
    mount.append(toolbar, grid);

    async function render(rescan = false): Promise<void> {
        try {
            status.textContent = t("libScanning");
            grid.replaceChildren();
            const list = rescan ? await host.refreshLibrary().then(() => host.library()) : await host.library();
            if (!host.isDesktopEnv()) {
                status.textContent = t("libNoDesktop");
                return;
            }
            status.textContent = tArgs("libCount", { count: list.length });
            if (list.length === 0) {
                grid.append(el("div", { class: "we-lib-empty" }, t("libEmpty")));
                return;
            }
            const current = host.currentWallpaper();
            for (const wp of list) {
                grid.append(buildCard(host, wp, current, () => dialogRef?.destroy()));
            }
        } catch (err) {
            status.textContent = t("msgNoLibrary");
            console.warn("[we-bg] build library dialog failed:", err);
        }
    }

    void render();
}

function buildCard(host: Host, wp: WEWallpaper, current: WEWallpaper | null, close: () => void): HTMLElement {
    const thumb = el("div", { class: "we-thumb" });
    const previewUrl = host.previewUrl(wp);
    if (previewUrl) {
        const img = el("img", { alt: wp.title, loading: "lazy" }) as HTMLImageElement;
        img.src = previewUrl;
        thumb.append(img);
    } else {
        thumb.append(el("div", { class: "we-thumb-fallback" }, (wp.title || "?").slice(0, 1)));
    }

    const tag = el("span", { class: "we-tag" }, t(TYPE_KEY[wp.type] ?? "libTypeUnknown"));
    const title = el("div", { class: "we-card-title", title: wp.dir || wp.entry }, wp.title);
    const meta = el("div", { class: "we-card-meta" }, tag);

    if (!wp.supported) {
        meta.append(el("span", { class: "we-tag we-tag--warn" }, t("libPreviewOnly")));
    }

    const card = el(
        "div",
        {
            class: "we-card",
            title: wp.supported ? wp.title : t("libSceneNote"),
            onclick: () => {
                host.pickWallpaper(wp);
                showMessage(tArgs("libApplied", { title: wp.title }), 3000);
                close();
            },
        },
        thumb,
        title,
        meta,
    );
    if (current && current.key === wp.key) card.classList.add("we-card--current");
    if (!wp.supported) card.classList.add("we-card--dim");
    return card;
}
