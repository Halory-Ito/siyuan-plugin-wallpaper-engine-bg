/**
 * 生成 icon.png / preview.png（无第三方依赖的最小 PNG 编码器）。
 * 画面：渐变底 + “屏幕里的风景” + 半透明遮罩带，呼应插件功能。
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

/* ---------- PNG 编码 ---------- */

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    return table;
})();

function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body), 0);
    return Buffer.concat([len, body, crc]);
}

function writePng(file, w, h, pixels) {
    const raw = Buffer.alloc((w * 4 + 1) * h);
    for (let y = 0; y < h; y++) {
        raw[y * (w * 4 + 1)] = 0;
        pixels.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0);
    ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // RGBA
    const png = Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk("IHDR", ihdr),
        chunk("IDAT", deflateSync(raw, { level: 9 })),
        chunk("IEND", Buffer.alloc(0)),
    ]);
    writeFileSync(file, png);
    console.log("[icons]", file, `${w}x${h}`);
}

/* ---------- 画布 ---------- */

function canvas(w, h) {
    const px = Buffer.alloc(w * h * 4);
    const blend = (x, y, r, g, b, a = 1) => {
        x = Math.round(x);
        y = Math.round(y);
        if (x < 0 || y < 0 || x >= w || y >= h) return;
        const i = (y * w + x) * 4;
        px[i] = Math.round(r * a + px[i] * (1 - a));
        px[i + 1] = Math.round(g * a + px[i + 1] * (1 - a));
        px[i + 2] = Math.round(b * a + px[i + 2] * (1 - a));
        px[i + 3] = 255;
    };
    const rect = (x0, y0, x1, y1, r, g, b, a = 1) => {
        for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
            for (let x = Math.floor(x0); x < Math.ceil(x1); x++) blend(x, y, r, g, b, a);
        }
    };
    const roundRect = (x0, y0, x1, y1, radius, r, g, b, a = 1) => {
        for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
            for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
                const cx = Math.max(x0 + radius, Math.min(x1 - radius, x));
                const cy = Math.max(y0 + radius, Math.min(y1 - radius, y));
                if ((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2) blend(x, y, r, g, b, a);
            }
        }
    };
    const circle = (cx, cy, radius, r, g, b, a = 1) => {
        for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
            for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
                if ((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2) blend(x, y, r, g, b, a);
            }
        }
    };
    const triangle = (p0, p1, p2, r, g, b, a = 1) => {
        const minX = Math.floor(Math.min(p0[0], p1[0], p2[0]));
        const maxX = Math.ceil(Math.max(p0[0], p1[0], p2[0]));
        const minY = Math.floor(Math.min(p0[1], p1[1], p2[1]));
        const maxY = Math.ceil(Math.max(p0[1], p1[1], p2[1]));
        const sign = (ax, ay, bx, by, cx, cy) => (ax - cx) * (by - cy) - (bx - cx) * (ay - cy);
        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                const d1 = sign(x, y, p0[0], p0[1], p1[0], p1[1]);
                const d2 = sign(x, y, p1[0], p1[1], p2[0], p2[1]);
                const d3 = sign(x, y, p2[0], p2[1], p0[0], p0[1]);
                const neg = d1 < 0 || d2 < 0 || d3 < 0;
                const pos = d1 > 0 || d2 > 0 || d3 > 0;
                if (!(neg && pos)) blend(x, y, r, g, b, a);
            }
        }
    };
    const gradient = (x0, y0, x1, y1, c0, c1) => {
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const t = Math.max(0, Math.min(1, ((x - x0) * (x1 - x0) + (y - y0) * (y1 - y0)) / ((x1 - x0) ** 2 + (y1 - y0) ** 2)));
                blend(x, y, c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t, 1);
            }
        }
    };
    return { px, blend, rect, roundRect, circle, triangle, gradient };
}

/** 屏幕 + 风景 + 遮罩带 */
function drawScene(c, x0, y0, x1, y1, maskFromRatio = 0.55) {
    const w = x1 - x0;
    const h = y1 - y0;
    c.roundRect(x0, y0, x1, y1, Math.max(4, w * 0.05), 30, 44, 84, 1);
    // 天空
    for (let y = y0 + 2; y < y1 - 2; y++) {
        const t = (y - y0) / h;
        c.rect(x0 + 2, y, x1 - 2, y + 1, 70 + 60 * t, 130 + 50 * t, 210 + 20 * t, 1);
    }
    // 太阳
    c.circle(x0 + w * 0.74, y0 + h * 0.26, Math.max(3, w * 0.07), 255, 214, 120, 1);
    // 山
    c.triangle([x0, y1], [x0 + w * 0.42, y0 + h * 0.32], [x0 + w * 0.78, y1], 38, 58, 108, 1);
    c.triangle([x0 + w * 0.45, y1], [x0 + w * 0.75, y0 + h * 0.48], [x1, y1], 28, 44, 88, 1);
    // 遮罩带：把画面下半部分压暗
    const maskY = y0 + h * maskFromRatio;
    c.rect(x0 + 2, maskY, x1 - 2, y1 - 2, 8, 10, 18, 0.45);
}

/* ---------- icon.png ---------- */
{
    const S = 128;
    const c = canvas(S, S);
    c.gradient(0, 0, S, S, [22, 33, 70], [124, 66, 178]);
    drawScene(c, 14, 22, 114, 90, 0.55);
    // 支架
    c.rect(58, 90, 70, 104, 26, 34, 64, 1);
    c.roundRect(40, 103, 88, 112, 4, 26, 34, 64, 1);
    // 右下角滑块：模糊 / 亮度调节的暗示
    c.roundRect(32, 116, 96, 122, 3, 20, 24, 44, 0.85);
    c.circle(52, 119, 4, 255, 255, 255, 0.95);
    c.circle(82, 119, 4, 255, 255, 255, 0.6);
    writePng("icon.png", S, S, c.px);
}

/* ---------- preview.png ---------- */
{
    const W = 640;
    const H = 360;
    const c = canvas(W, H);
    c.gradient(0, 0, W, H, [18, 28, 62], [110, 58, 168]);
    drawScene(c, 60, 46, 580, 268, 0.55);
    // 滑块（遮罩浓度 / 模糊度）
    const pill = (x0, x1, knobX) => {
        c.roundRect(x0, 300, x1, 312, 6, 16, 20, 40, 0.9);
        c.circle(knobX, 306, 9, 240, 240, 255, 0.95);
    };
    pill(120, 340, 190);
    pill(340, 560, 460);
    writePng("preview.png", W, H, c.px);
}
