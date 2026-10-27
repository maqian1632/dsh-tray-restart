# 插件市场条目与提交说明

DSH 插件市场（`dshmarket` / dshmarket.com）的插件列表来自精选仓库 **awesome-dsh-plugin**。提交方式是向该仓库添加一个 YAML 文件，而不是向 `dsh-market/dsh-market` 提 PR。

## 当前发布状态

- GitHub 仓库：<https://github.com/maqian1632/dsh-tray-restart>（已发布 v1.0.0）
- 市场 fork 分支：`maqian1632/awesome-dsh-plugin:add-dsh-tray-restart`（条目已提交并推送）
- 市场 PR：[awesome-dsh-plugin#9746](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/9746)，CI `check` 已通过，等待维护者审核。

## 简短说明（市场卡片）

**English**

> Adds a “Restart DeepSeek Harness” item to the Windows system tray menu, closing the desktop app cleanly and relaunching it.

**中文**

> 在 Windows 系统托盘菜单中增加“重启 DeepSeek Harness”，一键关闭并重新启动桌面应用。

## 建议元数据

| 字段 | 值 |
|---|---|
| 名称 | `Tray Restart` / `托盘重启` |
| 分类 | `ui` |
| 关键词 | `windows`, `tray`, `restart`, `desktop`, `deepseek-harness` |
| GitHub topics | `dsh-plugin`, `deepseek-harness`, `dsh` |
| License | MIT |
| 最低 DSH | `>=0.2.1-rc.3 <0.3.0` |

## 市场条目 YAML

文件路径：

```text
data/plugins/maqian1632__dsh-tray-restart.yml
```

内容：

```yaml
url: https://github.com/maqian1632/dsh-tray-restart
name: maqian1632/dsh-tray-restart
category: ui
description:
  en: Adds a “Restart DeepSeek Harness” item to the Windows system tray menu, closing the desktop app cleanly and relaunching it.
  zh: 在 Windows 系统托盘菜单中增加“重启 DeepSeek Harness”，一键关闭并重新启动桌面应用。
icon: https://raw.githubusercontent.com/maqian1632/dsh-tray-restart/main/assets/icon-180.png
```

> 以上条目已按 GitHub 账号 `maqian1632` 填写；如仓库迁移到其他账号，请同步替换 `url`、`name`、文件名和 `icon` 路径。

## 长说明（详情页）

> Tray Restart adds a single, explicit action to the Windows system tray menu: **Restart DeepSeek Harness**. It closes the DSH Desktop Host, window and tray through the existing shutdown path, then relaunches the application with `app.relaunch()`. The menu keeps Open and Quit unchanged and does not create a second tray icon.
>
> DSH does not expose a tray-menu API to plugins, so the Host plugin makes a length-neutral, idempotent patch to the desktop shell's `DesktopTray` region in `resources/app.asar`, and updates the archive's SHA-256 integrity record. The patch is re-checked on every launch and upgrades older versions in place. It requires Windows and a writable DSH installation directory; restart DSH once after installation to load the patched tray.

中文版：

> Tray Restart 在 Windows 系统托盘菜单中增加一个明确的操作：**重启 DeepSeek Harness**。它通过 DSH 现有的关闭流程关闭 Host、窗口和托盘，然后用 `app.relaunch()` 重新启动应用；打开和退出菜单保持不变，也不会创建第二个托盘图标。
>
> 由于 DSH 没有向插件暴露托盘菜单 API，插件会对桌面壳 `resources/app.asar` 中的 `DesktopTray` 区域做等长、幂等补丁，并同步更新归档的 SHA-256 完整性记录。每次启动都会检查，旧版本补丁会原位升级。需要 Windows 和可写的 DSH 安装目录；安装后需重启一次 DSH 才能加载新托盘。

## 提交前检查清单

- [ ] GitHub 仓库已创建，且至少满 **1 天**（市场 CI 会检查）。
- [ ] 仓库根目录 `package.json` 声明了 `dsh.bundle.patch`。
- [ ] `cordis.patch.yml` 存在且能插入插件行。
- [ ] 仓库有真实可运行的代码，不是纯 README/占位仓库。
- [ ] 仓库添加 `dsh-plugin` topic。
- [ ] 仓库包含 `LICENSE`（MIT）。
- [ ] 已生成 `assets/icon-180.png`（GitHub 托管的 PNG）。
- [ ] 市场条目文件只新增一个，不改动其他人的条目。
- [ ] `description.en` 只描述事实，不含营销夸张。
- [ ] PR 标题示例：`Add dsh-tray-restart`。

## 提交 PR

1. Fork `https://github.com/awesome-dsh-plugin/awesome-dsh-plugin`。
2. 新建分支 `add-dsh-tray-restart`。
3. 添加 `data/plugins/maqian1632__dsh-tray-restart.yml`。
4. 提交并推送。
5. 向 `awesome-dsh-plugin/awesome-dsh-plugin` 的 `main` 分支发起 PR。

CI 会检查 `dsh.bundle`、仓库年龄、YAML 格式和 README 再生成；维护者会实际阅读仓库，确认描述与代码一致。

## 备注

- 市场条目中的 `icon` 必须是 GitHub 托管的 **PNG/JPEG/WebP**，不能用 SVG；本仓库已提供 `assets/icon-180.png`。
- 如果后续发布 npm 包，包名建议 `dsh-plugin-tray-restart`，并在 `repository` 字段指回同一个 GitHub 仓库；市场会自动关联下载量，但不上 npm 不影响收录。
- 当前 `dsh-plugin-tray-restart` 在 npm 上未占用；发布前可再次确认。
