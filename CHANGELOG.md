# 更新日志

**Wallpaper Engine 壁纸背景**（SiYuan 插件）的所有重要变更都记录在此文件。

版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)，以 `plugin.json` 与 `package.json` 中的
`version` 为准（两者保持一致）；每个版本对应 GitHub Release 上的一个 `package.zip`。

> 本仓库在 0.4.1 之前未保留版本历史，因此本文件从 0.4.1 起记录：
> 0.4.1 条目是当时的功能快照，不含更早版本的逐条变更。

## [未发布]

暂无。

## [0.5.0] - 2026-09-24

### 新增

- 设置页新增「代码块背景」分区，可直接用调色板调整代码块背景色：
  透明 / 跟随主题色 / 深色 / 灰蓝 / 纯黑 / 浅灰 / 米色 / 纯白
- 代码块背景支持自定义浅色·深色两种颜色，以及独立的不透明度滑杆
- 点选色块时若当前不透明度为 0%（默认值），自动提升到 85%，避免「点了没反应」
- 新增 `CHANGELOG.md`；新增 `npm run package`，打包出符合集市规范的 `package.zip`
- 新增 `cover.jpg` 作为文档封面图（`README.md` / `README_en_US.md` 均已引用）

### 变更

- 「背景预设」由一次性按钮改为**反映当前状态的选择器**：当前生效的预设会高亮
  （`we-preset-on` + `aria-pressed`），默认即「全透明」
- 设置页支持整页重建，应用预设 / 恢复默认后所有控件立即同步到新值
- 「恢复默认」不再关闭设置页
- 代码块从「结构背景颜色」列表中移出，改由独立的「代码块背景」分区管理
  （两处共用同一份 `panels.code` 配置，避免同一个值出现两组互相不同步的控件）
- 面板预设改为原地修改，不再重置用户已经调好的自定义颜色
- `plugin.json` 的 `url` 指向真实仓库地址

### 修复

- **「完全不透明」预设实际只有 40%**：`alpha` 会再乘以整体强度 `uiStrength`（默认 0.4），
  现在该预设会同时把整体强度拉满，真正达到 100%
- **「柔和玻璃」预设等同于「全透明」**（只是复制了默认值，属于空操作），
  现定义为「跟随主题色 + 不透明度 60% + 整体强度 1」

## [0.4.1]

> 功能快照，发布日期不详。

- 壁纸来源：自动探测 Steam 库（解析 `libraryfolders.vdf`，支持多盘符 / Linux / macOS）、
  手动指定任意目录、无 `project.json` 的散装媒体文件
- 壁纸类型：`video` 循环播放、`web` 经内置本地服务器加载、`image` 静态背景；
  `scene` / `application` 自动回退到 `preview.jpg`
- 画面：四种适配模式（完整显示＋模糊填充 / 铺满 / 完整显示 / 拉伸）、
  Mask 遮罩（颜色 + 浓度，即亮度调节）、高斯模糊 0–40px、亮度 / 饱和度 / 位置微调
- 界面透明：`panels`（按结构）/ `opacity`（整体）/ `off` 三种模式；
  结构包含编辑器、文档树、目录树、代码块、侧边栏、顶栏·标签页·状态栏、内容区·其它面板
- 播放：静音 / 音量 / 倍速 / 失焦暂停 / 网页壁纸静音垫片
- 壁纸库选择器、快速调节面板、顶栏图标、随机轮换与启动随机、网络壁纸 URL
- 中英文界面；配置分「跨设备共享」（`local.json`）与「本机路径」（`device-<主机名>.json`）
- 内置本地只读静态服务器：Range 请求、html 垫片注入、路径越界防护
- 测试：`npm run smoke`（目录扫描 + 本地服务器 + 面板 CSS）、
  `npm run ui-smoke`（jsdom 下真实加载插件与设置页）

## 配置迁移

升级时 `normalizeCommon()` 会自动迁移旧配置，无需手动处理：

| 旧值 | 新值 |
| --- | --- |
| `uiMode: "glass"` | `uiMode: "panels"`，并把 `uiStrength` 置为 1 |
| `fit: "fill"` | `fit: "stretch"` |

[未发布]: https://github.com/Halory-Ito/siyuan-plugin-wallpaper-engine-bg/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/Halory-Ito/siyuan-plugin-wallpaper-engine-bg/releases/tag/v0.5.0
