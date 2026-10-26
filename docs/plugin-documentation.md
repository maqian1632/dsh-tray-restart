# DSH Tray Restart — 插件文档

## 1. 概述

`dsh-plugin-tray-restart` 是一个 DeepSeek Harness（DSH）Host 插件，在 Windows 系统托盘的 DSH 菜单中增加：

```text
重启 DeepSeek Harness
```

点击后通过桌面端现有的 `app.relaunch()` 和 `quitWithoutConfirmation()` 关闭并重新启动整个 DSH Desktop。

插件不创建自己的托盘图标，也不修改 DSH 会话、模型、工具或工作区数据。

## 2. 适用范围

| 项目 | 说明 |
|---|---|
| 操作系统 | Windows 10 / 11 |
| DSH | Desktop `0.2.1-rc.3` |
| 运行形态 | DSH Desktop（Electron 壳 + Host 子进程） |
| 安装目录 | 需要可写，例如 `%LOCALAPPDATA%\Programs\DeepSeek Harness` |
| 非目标 | macOS / Linux、CLI 无桌面壳模式、DSH 主界面菜单 |

## 3. 为什么需要打 app.asar 补丁

DSH 的托盘菜单在 Electron 主进程中由 `DesktopTray` 类创建，当前没有向插件暴露“添加托盘菜单项”的 API。Host 插件运行在 Electron 的 Node 子进程中，无法直接操作主进程的 `Tray` 对象。

因此插件采用**安装目录级补丁**：

1. 定位当前 Electron 可执行文件旁的 `resources/app.asar`。
2. 读取 asar 归档中的 `lib/main.js`。
3. 只替换 `//#region lib/types/tray.js` 到下一个 `//#endregion` 之间的托盘区域。
4. 保持替换后的总长度不变，避免改变 asar 中任何条目的偏移量。
5. 更新 asar 头部 `lib/main.js` 的 SHA-256 完整性记录。
6. 写入后由用户重启 DSH，新的 Electron 主进程加载补丁后的托盘代码。

### 为什么必须等长

asar 头部记录每个文件在归档中的 `offset`。如果 `lib/main.js` 变长，后续所有文件的偏移量都需要重算，等同于重建整个 182 MB 归档。等长替换把风险限制在单个文件区域内，也让正在运行的 Electron 进程不会因为其它文件的偏移变化而读错内容。

## 4. 补丁内容

补丁后的 `DesktopTray.relabel()` 构建如下菜单：

```js
tray.setContextMenu(Menu.buildFromTemplate([
  { label: messages.openApplication, click: () => { this.options.open(); } },
  { label: messages.restartApplication + " DeepSeek Harness", click: () => { app.relaunch(); quitWithoutConfirmation(); } },
  { type: "separator" },
  { label: messages.quitApplication, click: () => { this.options.quit(); } }
]));
```

- `messages.restartApplication` 是 DSH 已有的本地化字段：中文为“重启”，英文为“Restart”。
- 拼接 `" DeepSeek Harness"` 后，中文菜单显示“重启 DeepSeek Harness”，英文显示“Restart DeepSeek Harness”。
- `app.relaunch()` 安排新实例启动；`quitWithoutConfirmation()` 触发现有退出流程，关闭 Host、窗口和托盘。
- 该逻辑与桌面端开发菜单中的“重启应用与 Host”一致。

## 5. 生命周期与幂等

```
DSH Desktop 启动
  → Electron 主进程加载 app.asar/lib/main.js
  → Host 子进程加载 desktop profile
  → 本插件 apply()
      → 读取 app.asar
      → 判断托盘区域是否已是当前补丁
          ├─ 是：不写入
          └─ 否：等长替换 + 更新完整性 → 写入
  → 本次启动的托盘仍使用启动时加载的代码
  → 下一次启动显示新菜单
```

- 每次 Host 启动都会检查；已是最新补丁时 `changed: false`。
- 旧版本补丁（短文案“重启”）会被原位升级为“重启 DeepSeek Harness”。
- 如果 DSH 升级替换了 `app.asar`，插件会在下一次启动重新打补丁。
- 因为 Electron 主进程先于 Host 插件加载，更新后的第一次启动仍显示旧菜单，再启动一次即可。

## 6. 兼容性与失败策略

补丁前会检查 `lib/main.js` 是否仍包含以下标识：

- `quitWithoutConfirmation`
- `app.relaunch()`
- `restartApplication`

如果缺少任意一个，说明桌面壳实现已经变化，插件抛出“此桌面壳版本不受支持”的错误并跳过写入。这样不会生成一个点击后报错的菜单项。

托盘区域必须能找到 `//#region lib/types/tray.js` 和对应的 `//#endregion`。如果找不到，同样跳过。

> 当前补丁只验证过 DSH Desktop `0.2.1-rc.3`。未来版本如果保留这些标识但改变托盘结构，需要重新验证。

## 7. 安全与权限

- 插件写入 `resources/app.asar`，这是安装目录级修改，不是普通的 profile 配置。
- 不联网、不读取会话内容、不上传数据。
- 除托盘菜单外，不修改 DSH 的其他菜单或行为。
- 需要安装目录可写；`Program Files` 下的安装通常需要管理员权限，或改用用户级安装。
- 补丁是确定性的、幂等的；相同版本重复运行不会重复修改。
- 如果写入失败，插件只记录警告，不影响 DSH 启动。

## 8. 验证

### 单元测试

```powershell
npm test
```

覆盖：

1. 从原始托盘区域生成带“重启 DeepSeek Harness”的补丁；
2. 第二次补丁为 no-op；
3. 从旧版短文案补丁原位升级；
4. 缺少兼容标识时拒绝修改。

### 本机验证

安装并重启 DSH 后，右键托盘图标应看到：

```text
打开 DeepSeek Harness
重启 DeepSeek Harness
────────────
退出 DeepSeek Harness
```

点击“重启 DeepSeek Harness”，DSH 窗口关闭并重新出现，托盘图标重新创建。

### 完整性检查

补丁写入后，`app.asar` 头部记录的 `lib/main.js` SHA-256 应与实际内容一致。插件在写入时自动更新该字段。

## 9. 安装与卸载

### 安装

- 插件市场（上架后）搜索“Tray Restart”安装；
- 或在 DSH 插件管理中使用 `plugin_manager` 安装本地目录。

安装后需要**完全退出并重新打开 DSH**。

### 卸载

禁用/移除插件会停止后续自动补丁，但不会主动清除已经写入当前 `app.asar` 的托盘项。安装新版本 DSH 会随应用文件一起恢复。需要立即恢复时，可使用安装前备份的原始 `lib/main.js` 还原，并同步更新 asar 完整性字段。

## 10. 开发

### 目录

```text
index.js              Host 插件入口，定位 app.asar 并调用补丁
tray-patch.js         asar 读取、等长替换、完整性更新
cordis.patch.yml      Bundle 插入行
locale/en.json        插件管理器英文标题/说明
locale/zh.json        插件管理器中文标题/说明
test/                 补丁单元测试
docs/                 插件文档与市场条目说明
assets/               市场图标（PNG）
icon.svg              插件图标
```

### 关键实现点

- Electron 会把 `app.asar` 当成归档目录，普通 `fs` 打开会报 `ENOENT`；`tray-patch.js` 优先使用 `original-fs` 直接访问归档文件。
- 等长替换用空格填充到原区域长度，文件总长度不变。
- 旧版补丁的填充空格位于 `//#endregion` 之后；升级逻辑会一并吞掉这些空格，保持区域边界稳定。
- `updateIntegrity()` 同时更新 `integrity.hash` 与 `integrity.blocks` 中对应的 SHA-256。

## 11. 市场发布

市场条目文件、短描述和提交清单见 [marketplace-listing.md](marketplace-listing.md)。
