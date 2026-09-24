import { build, context } from "esbuild";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const watch = process.argv.includes("--watch");
const outdir = "dist";

const options = {
    entryPoints: ["src/index.ts"],
    outfile: path.join(outdir, "index.js"),
    bundle: true,
    format: "cjs",
    platform: "browser",
    target: "es2020",
    minify: !watch,
    sourcemap: watch ? "inline" : false,
    external: ["siyuan", "process"],
    logLevel: "info",
    banner: {
        js: "/* wallpaper-engine-bg | MIT | https://github.com/Halory-Ito/siyuan-plugin-wallpaper-engine-bg */",
    },
};

function copyStatic() {
    mkdirSync(outdir, { recursive: true });
    for (const file of ["plugin.json", "README.md", "README_en_US.md", "CHANGELOG.md", "LICENSE", "icon.png", "preview.png", "cover.jpg"]) {
        if (existsSync(file)) cpSync(file, path.join(outdir, file));
    }
    rmSync(path.join(outdir, "i18n"), { recursive: true, force: true });
    cpSync("src/i18n", path.join(outdir, "i18n"), { recursive: true });
}

copyStatic();

if (watch) {
    const ctx = await context({
        ...options,
        plugins: [
            {
                name: "copy-static",
                setup(buildApi) {
                    buildApi.onEnd(() => copyStatic());
                },
            },
        ],
    });
    await ctx.watch();
    console.log("[build] watching src/ ...");
} else {
    await build(options);
    copyStatic();
    console.log("[build] dist/ is ready, copy it to <workspace>/data/plugins/wallpaper-engine-bg/");
}
