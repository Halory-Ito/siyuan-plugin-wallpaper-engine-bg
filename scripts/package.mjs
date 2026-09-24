/**
 * 打包：把 dist/ 的内容压成 package.zip。
 *   npm run package
 *
 * 思源集市 / 手动安装都要求 zip 内的文件位于**根目录**（index.js、plugin.json、i18n/…），
 * 解压后直接就是 <workspace>/data/plugins/wallpaper-engine-bg/ 的内容，所以这里不加外层目录。
 *
 * 无第三方依赖：ZIP 由 zlib 手写（与 gen-icons.mjs 手写 PNG 的思路一致），
 * 避免依赖本机是否装了 zip / 7z。
 */
import { deflateRawSync } from "node:zlib";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const DIST = "dist";
const OUT = "package.zip";

/* ---------- CRC32 ---------- */

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

/* ---------- ZIP ---------- */

/** MS-DOS 时间戳（本地时间，秒只有 2 秒精度） */
function dosDateTime(date) {
    const d = date ?? new Date();
    return {
        time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
        date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    };
}

/**
 * @param {{ name: string; data: Buffer; mtime?: Date }[]} entries name 用 "/" 分隔，位于 zip 根目录
 */
export function createZip(entries) {
    const locals = [];
    const centrals = [];
    let offset = 0;

    for (const entry of entries) {
        const name = Buffer.from(entry.name, "utf8");
        const crc = crc32(entry.data);
        const deflated = deflateRawSync(entry.data, { level: 9 });
        // 压完反而更大时按 store 存（小文件、已经是压缩格式的图片都可能出现）
        const stored = deflated.length >= entry.data.length;
        const method = stored ? 0 : 8;
        const body = stored ? entry.data : deflated;
        const { time, date } = dosDateTime(entry.mtime);

        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0); // 本地文件头签名
        local.writeUInt16LE(20, 4); // 解压所需版本
        local.writeUInt16LE(0x0800, 6); // 标志位：文件名为 UTF-8
        local.writeUInt16LE(method, 8);
        local.writeUInt16LE(time, 10);
        local.writeUInt16LE(date, 12);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(body.length, 18);
        local.writeUInt32LE(entry.data.length, 22);
        local.writeUInt16LE(name.length, 26);
        local.writeUInt16LE(0, 28); // 扩展字段长度
        locals.push(local, name, body);

        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0); // 中央目录头签名
        central.writeUInt16LE(0x031e, 4); // 创建版本：UNIX + ZIP 3.0
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0x0800, 8);
        central.writeUInt16LE(method, 10);
        central.writeUInt16LE(time, 12);
        central.writeUInt16LE(date, 14);
        central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(body.length, 20);
        central.writeUInt32LE(entry.data.length, 24);
        central.writeUInt16LE(name.length, 28);
        central.writeUInt16LE(0, 30); // 扩展字段长度
        central.writeUInt16LE(0, 32); // 注释长度
        central.writeUInt16LE(0, 34); // 起始磁盘号
        central.writeUInt16LE(0, 36); // 内部属性
        central.writeUInt32LE((0o100644 << 16) >>> 0, 38); // 外部属性：-rw-r--r--（<< 后是负数，需转回无符号）
        central.writeUInt32LE(offset, 42);
        centrals.push(central, name);

        offset += local.length + name.length + body.length;
    }

    const centralBuf = Buffer.concat(centrals);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0); // 中央目录结束记录签名
    eocd.writeUInt16LE(0, 4); // 当前磁盘号
    eocd.writeUInt16LE(0, 6); // 中央目录起始磁盘号
    eocd.writeUInt16LE(entries.length, 8);
    eocd.writeUInt16LE(entries.length, 10);
    eocd.writeUInt32LE(centralBuf.length, 12);
    eocd.writeUInt32LE(offset, 16);
    eocd.writeUInt16LE(0, 20); // 注释长度

    return Buffer.concat([...locals, centralBuf, eocd]);
}

/* ---------- 收集 dist/ ---------- */

function walk(dir, prefix = "") {
    const out = [];
    for (const name of readdirSync(dir).sort()) {
        const full = path.join(dir, name);
        const rel = prefix ? `${prefix}/${name}` : name; // zip 内统一用 "/"
        const st = statSync(full);
        if (st.isDirectory()) out.push(...walk(full, rel));
        else if (st.isFile()) out.push({ name: rel, data: readFileSync(full), mtime: st.mtime });
    }
    return out;
}

/* ---------- 入口 ---------- */

// 仅直接执行时打包；被 import（如冒烟测试）时只暴露 createZip
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
    if (!existsSync(DIST)) {
        console.error(`[package] 找不到 ${DIST}/，请先执行 npm run build`);
        process.exit(1);
    }

    const entries = walk(DIST);
    if (entries.length === 0) {
        console.error(`[package] ${DIST}/ 是空的，请先执行 npm run build`);
        process.exit(1);
    }

    // 集市规范要求 package.zip 至少包含这些文件，缺了直接报错，避免发布出去才发现
    const required = ["index.js", "plugin.json", "icon.png", "preview.png"];
    const missing = required.filter((f) => !entries.some((e) => e.name === f));
    if (missing.length > 0) {
        console.error(`[package] ${DIST}/ 缺少必需文件：${missing.join(", ")}`);
        process.exit(1);
    }

    const zip = createZip(entries);
    writeFileSync(OUT, zip);

    const raw = entries.reduce((sum, e) => sum + e.data.length, 0);
    console.log(
        `[package] ${OUT}  ${entries.length} 个文件  ` +
            `${(raw / 1024).toFixed(1)} KB → ${(zip.length / 1024).toFixed(1)} KB`
    );
    for (const e of entries) console.log(`  ${e.name}`);
}
