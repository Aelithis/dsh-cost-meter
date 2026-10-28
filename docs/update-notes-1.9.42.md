# v1.9.42：提醒交互、计价币种保护与纯文本侧栏

## 中文

- **提醒可正常关闭**：“新增：余额图框点击刷新”使用现有顶层浮卡，避免侧栏裁剪、窗口拖动区域及浮动插件拦截按钮。点击“知道了”、关闭按钮或按 Escape 后立即消失；设置服务失败不会重新弹出，同页重复挂载一起关闭。正常本地存储可跨刷新保留已读；本地存储和服务同时不可用时，仅能保证当前页面与组件重挂不再显示。
- **纯文本侧栏**：在“费用 → 显示 → 侧栏”开启“隐藏进度条，仅显示紧凑文本”。隐藏余额、预算、套餐额度和峰谷时间的图形条，保留数值、时间、悬停与刷新操作。原布局和进度条偏好不被删除，关闭开关即可恢复。
- **官方同步币种保护**：从一种币种切换到另一种币种时，如果官方页面只返回部分模型，拒绝整个同步，而不是把遗漏模型的旧价格误标为新币种。历史费用不自动重算；请先按[安全核对说明](official-price-sync-safety.md)确认价格与范围。

本版还包含 `master` 已有的多账号额度查询、Go 订阅计费分类、自定义余额跳转链接、Agent Teams 统计范围、百度千帆 Token Plan、官方余额渠道过滤以及发布包兼容性更新。原始问题与贡献署名完整保留于 [CHANGELOG](../CHANGELOG.md#1942---2026-10-28)，本次修复未替代或重署这些贡献。

升级后完全重启 DSH，使服务端价格保护生效，再刷新 Web 页面。用户提交的账本与截图未放入仓库或安装包。

## English

The balance-refresh announcement now uses the existing protected top-layer card. Dismissal is immediate and does not reopen after a failed settings request. Duplicate mounts close together; local storage preserves dismissal across reloads. If both storage and the service are unavailable, dismissal can only survive remounts in the current page.

Enable **Cost → Display → Sidebar → Hide progress bars, show compact text** to retain values, timing, tooltips and refresh actions without graphical bars. Disabling it restores the saved layout and bar preferences.

Official price synchronization now rejects incomplete cross-currency updates rather than relabeling retained numbers. Historical amounts are never automatically rewritten; follow the [verification and repair guidance](official-price-sync-safety.md).

This release also includes the existing unreleased main-branch features listed with original contributor credits in the changelog. Fully restart DSH and refresh the Web UI after updating. Private reports and screenshots are not included in the repository or package.
