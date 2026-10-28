# v1.9.43：空闲扫描修复、统一显示引导与订阅兼容验证

## 中文

- **空闲时不再扫描全部插件**：billion-context 识别改为读取正在运行的原生插件实例，并异步读取少量目标元数据。空闲轮询使用缓存，不再调用宿主 `listBundles()`。停用、加载失败、卸载与重新加载会重新判断；仅修改磁盘包或重新启用同一个缓存模块，不会被误认为新版本已经运行。计费日志导入、完成回执和宿主补记机制不变。
- **五个显示介绍合为一个可关闭提示**：首次安装只显示一个可选介绍，指向「设置 → 费用 → 显示」。关闭、Escape 或“知道了”不改变布局、查询、价格或计费设置。已有任一介绍的已读标记会抑制新提示；本地存储或设置保存失败时仍保留当前页面的关闭状态。兼容旧宿主、重复挂载、后台页面及已有对话框。条件性的第三方集成授权与必要警告不被关闭。
- **实际发布包验证**：在原有 3.1.2、3.1.4、3.1.6、3.1.7 的基础上，补测 `dsh-codex-subscription` 3.1.8、3.1.9、3.2.0。真实额度读取、传输注册、RPC、断连、账户切换和异常路径通过后，才把监控基线更新到 3.2.0。监控新增用量读取函数指纹，不仅匹配入口字符串。

感谢 [@ZiYuan258](https://github.com/ZiYuan258) 在 [#432](https://github.com/Han-1413141/dsh-cost-meter/issues/432) 提供 Windows 复现、I/O 测量、根因定位与目标读取建议；感谢 [@L33Z22L11](https://github.com/L33Z22L11) 在 [#429](https://github.com/Han-1413141/dsh-cost-meter/issues/429) 报告介绍叠加并建议统一设置入口。[#430](https://github.com/Han-1413141/dsh-cost-meter/issues/430) 来自 `github-actions[bot]` 的兼容性监控告警。

验证细节见[目标识别与性能回归](billion-context-peer-discovery.md)和[兼容性监控记录](plugin-compatibility-watch.md)。本地 Linux 回归不能证明报告者的 Windows 环境已经恢复；需更新并完全重启 DSH 后复测。升级不迁移账本格式，不自动重算历史费用，保留 1.9.42 的币种保护与紧凑侧栏。

## English

The billion-context discovery path no longer calls the host's full bundle inventory. It uses active native-loader state, bounded asynchronous metadata reads and a loaded-module cache. Disabled, failed and unloaded peers are not reported as active; disk-only upgrades and remounts of the same cached module do not pretend to have loaded newer code. Billing receipts, journal ingestion and host fallback are unchanged.

Five automatic display introductions become one optional, dismissible guide pointing to **Settings → Cost → Display**. Existing acknowledgements are respected; dismissal does not alter display, quota or billing preferences. Integration consent and necessary warnings remain independent.

Published Codex subscription packages 3.1.8, 3.1.9 and 3.2.0 join the existing regression matrix. The baseline moves to 3.2.0 only after real package lifecycle tests; monitoring now fingerprints the usage reader as well.

Credits and original reports are linked above. Linux regression timings are not evidence of recovery on the reporter's Windows machine. Fully restart DSH and refresh the Web UI after updating. Ledger format, historical charges and the 1.9.42 currency protections are retained.
