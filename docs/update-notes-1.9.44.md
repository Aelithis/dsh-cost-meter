# v1.9.44：峰谷游标与模型、套餐目录更新

## 中文

- **峰谷游标随时间移动**：修复紧凑、经典及两种侧栏收起样式中固定在各段中间的游标；峰谷切换和页面恢复可见时刷新，周末、节假日按连续谷价时段显示。感谢 [@shutongX](https://github.com/shutongX) 在 [#434](https://github.com/Han-1413141/dsh-cost-meter/issues/434) 报告问题并提供截图。
- **更新 32 条模型目录记录**：补入 Kimi K3.1 Pro / Highspeed、Kimi Code 模型 ID、MiniMax M3.1 Flash、Qwen3.8 Flash、Hy4 preview，以及 OpenCode Go / Zen、OpenRouter 的新条目；补齐 Kimi K3 缓存写入，修正 Zen GPT-6.1 Sol 缓存读取。
- **更新套餐说明和额度解析**：显示 Kimi 的 Go / Plus / Pro / Max / Ultra 和 MiniMax M Plan 的 Go / Explore / Build。Kimi 支持当前 5 小时 / 月度窗口、嵌套响应及旧套餐周窗计数，保留旧订阅插件的计费识别。
- **保留已有设置和金额**：一次性迁移补入新 ID，保留手动价格、主动取消挂载和历史费用。没有公开独立 API 报价的三个 Kimi Code ID 保持未核价。

本版还包含主分支已合入的空闲扫描修复、统一显示引导和 Codex 订阅兼容验证，详见 [1.9.43 说明](update-notes-1.9.43.md)。完整价格、套餐和官方来源见 [10 月 28 日目录](catalog-2026-10-28.md)。

更新后完全重启 DSH，再刷新网页，使服务端价表和客户端一起生效。

## English

- Peak/off-peak markers now advance with time in all four legacy sidebar layouts and refresh at period boundaries and when the page becomes visible. Thanks to [@shutongX](https://github.com/shutongX) for the report and screenshot in [#434](https://github.com/Han-1413141/dsh-cost-meter/issues/434).
- Adds or corrects 32 provider-scoped records, including Kimi K3.1 Pro / Highspeed, MiniMax M3.1 Flash, Qwen3.8 Flash, Hy4 preview, and current OpenCode Go / Zen and OpenRouter additions.
- Updates Kimi memberships and MiniMax M Plan descriptions, with current and legacy Kimi usage-response support.
- Migration preserves custom rates, deliberate unmounts and recorded charges. Unverified Kimi Code API-equivalent rates remain unpriced.

This release also includes the idle-scan, unified-onboarding and Codex subscription compatibility changes documented under [1.9.43](update-notes-1.9.43.md). See the [catalog and official sources](catalog-2026-10-28.md) for details. Fully restart DSH and refresh the Web UI after updating.
