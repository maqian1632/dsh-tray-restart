# DSH Tray Restart

在 Windows 系统托盘菜单中增加 **重启 DeepSeek Harness**，一键关闭并重新启动整个桌面应用。

```text
打开 DeepSeek Harness
重启 DeepSeek Harness
────────────
退出 DeepSeek Harness
```

> 当前适配 **DeepSeek Harness Desktop 0.2.1-rc.3**，支持 Windows 10/11。

## 功能

- 在 DSH 原有托盘菜单中插入“重启 DeepSeek Harness”，不创建第二个托盘图标。
- 点击后调用桌面端现有的 `app.relaunch()` 和 `quitWithoutConfirmation()`：先正常关闭 Host、窗口和托盘，再重新启动应用。
- 托盘菜单的其他项、DSH 主界面和其它菜单保持不变。
- 文案跟随 DSH 当前语言：中文为“重启 DeepSeek Harness”，英文为“Restart DeepSeek Harness”。

## 安装

### 从插件市场安装

插件上架后，在 DSH 的 **插件 → 发现 / 插件市场** 搜索“Tray Restart”并安装。

### 从 GitHub 安装

仓库地址：<https://github.com/maqian1632/dsh-tray-restart>

在 DSH 插件管理中选择从 GitHub 安装，或把仓库克隆到本地后按下一节从本地目录安装。

### 从本地目录安装

在 DSH 插件管理中使用 `plugin_manager` 安装本目录：

```text
plugin_manager action=install_bundle
target=<本目录绝对路径>
```

安装后插件会在当前 desktop profile 中启用。

## 使用

1. 安装插件。
2. **完全退出 DeepSeek Harness，再重新打开**。当前正在运行的 Electron 主进程已经加载了旧的托盘代码，必须重启一次才能看到新菜单。
3. 右键 Windows 系统托盘中的 DSH 图标，点击 **重启 DeepSeek Harness**。

> “重启”与桌面端开发菜单中的“重启应用与 Host”使用同一套逻辑，会跳过退出确认；正在运行的任务会被中断，Host 会先执行正常关闭流程。

## 实现方式

DSH 没有向插件暴露系统托盘菜单 API，托盘由 Electron 主进程直接创建。因此这个 Host 插件在激活时对桌面安装目录中的 `resources/app.asar` 做一次**等长、幂等**的补丁：

- 只替换 `lib/main.js` 中的 `DesktopTray` 区域；
- 替换后文件长度不变，所有 asar 条目的偏移量保持有效；
- 同步更新 asar 头中 `lib/main.js` 的 SHA-256 完整性记录；
- 已是最新补丁时直接跳过；旧版本补丁会原位升级，不会重复插入；
- 在 Electron 中使用 `original-fs` 绕过 asar 路径拦截。

补丁只增加一个托盘菜单项，不会联网、不会读取会话内容，也不会修改 DSH 的其他行为。

## 兼容性

- 需要 Windows；托盘菜单本身是 Windows 桌面端功能。
- 当前针对 DSH Desktop `0.2.1-rc.3` 的 `DesktopTray` 实现。
- 如果 DSH 升级后托盘实现或必要的 `app.relaunch()` / `quitWithoutConfirmation` / `restartApplication` 标识发生变化，插件会拒绝写入并记录警告，而不是生成一个可能出错的菜单。
- DSH 自动更新会覆盖 `app.asar`；下次启动插件会自动重新打补丁。由于托盘代码先于插件加载，更新后的**第一次启动**仍显示旧菜单，再重启一次即可看到新菜单。

## 安全与权限

- 需要 DSH 安装目录可写。若 DSH 安装在 `Program Files` 等受保护目录，补丁会失败；请使用用户级安装，或以足够权限运行一次。
- 插件修改的是桌面壳的 `app.asar`，属于安装目录级别的变更，不是普通 UI 插件。安装前请确认你接受这一点。
- 补丁的写入是幂等的；同一版本重复启动不会重复修改。

## 故障排查

| 现象 | 处理 |
|---|---|
| 托盘菜单没有“重启 DeepSeek Harness” | 确认已**完全退出** DSH 后重新打开；只关闭窗口会隐藏到托盘，不算退出。 |
| 插件显示已安装但没有生效 | 检查插件是否处于 `active`；查看 DSH Host 日志中是否有 `could not add Restart DeepSeek Harness...` 警告。 |
| 安装在 `Program Files` 下失败 | 安装目录不可写，改用用户级安装或给安装目录授予写权限。 |
| DSH 更新后第一次启动没有新菜单 | 退出再启动一次，插件会在新版本上重新打补丁。 |

## 卸载

禁用或移除插件会停止后续自动补丁，但**不会主动移除已经写入当前 `app.asar` 的托盘项**。安装新版本 DSH 会随应用文件一起恢复原状。若需要立即恢复，可在 DSH 更新后重新启动，或用备份的原始 `lib/main.js` 还原。

## 开发与测试

```powershell
# 语法检查
node --check index.js
node --check tray-patch.js

# 单元测试（补丁、幂等、旧版升级、兼容性拒绝）
npm test

# 检查本机安装是否已打补丁、文案是否正确、asar 完整性是否匹配
npm run check:install -- "C:\Users\<you>\AppData\Local\Programs\DeepSeek Harness\resources\app.asar"
```

测试只构造内存中的 shell 片段，不会修改本机 `app.asar`。

## 文档

- [插件文档（实现、兼容性、安全、验证）](docs/plugin-documentation.md)
- [插件市场条目与提交说明](docs/marketplace-listing.md)

## License

[MIT](LICENSE)
