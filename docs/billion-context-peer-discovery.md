# billion-context 目标识别与空闲回归（1.9.43）

## 原因与边界

[#432](https://github.com/Han-1413141/dsh-cost-meter/issues/432) 的报告者 [@ZiYuan258](https://github.com/ZiYuan258) 提供了 Windows 事件循环探针、I/O 测量和根因定位。旧代码每 3 秒触发计费维护，识别函数设 10 秒间隔，因此约每 12 秒调用一次宿主 `listBundles()`。已发布的 DSH PluginManager 在返回 Promise 前同步读取完整插件清单、包元数据与展示资料。

新实现不调用该 API，也不在失败时回退到全量扫描。不直接把 profile 中的包名视为“运行中”：真实 Loader 的祖先禁用状态和 ACTIVE 实例决定是否存在原生代理，单独运行的 compaction gate 不算代理。版本来自目标包身份校验；别名、pnpm 目录链接与 file URL 使用目标路径，文件入口先解析真实路径。新宿主的纯数据运行时解析表用于补充模块路径，避免读取全量展示元数据。

文件读取异步、单路执行，单个 manifest 限制为 256 KiB，路径与候选数都有上限。非普通文件、损坏或过大的 manifest 不会被视为有效包。成功结果按已加载模块 callback 缓存；只换 fiber 而复用 Node 缓存模块时仍保留原版本。读取失败可重试，卸载或销毁期间完成的旧请求不会重新激活状态。符号链接 profile 的实际路径也参与解析；外部 linked parent 的复杂 peer-dependency 拦截若无法确定，则保留未知状态，不猜版本、不清除已收到的自动适配诊断，仍由实际请求回执决定计费覆盖。

这些信息用于兼容提示，不替代逐次请求回执。日志导入、失败重试、宿主补记与去重算法未改变；无 Loader 的嵌入场景保留已有自动适配与回执路径。

## 自动回归

- `test/billion-context-peer.mjs`：328 个无关包；冷识别仅打开 1 个目标 manifest；1,000 次缓存读取和 24 次实际计费定时器回调（模拟 72 秒）都产生 **0 次 `listBundles()` 调用、0 次空闲目标文件读取**。暂停异步文件读取期间心跳仍能运行，最大并发打开数为 1。
- 同一测试覆盖未安装、启用、有效禁用状态、加载失败、卸载、重载、版本变化、别名、文件链接、畸形/超大/FIFO 文件、发现请求合并与销毁，以及无代理时仍允许宿主计费补记。
- `test/billion-context-peer-host.mjs`：用真实 Cordis Loader 和发布版 PluginManager 在 DSH `0.2.0-rc.1` 与 `0.2.1-rc.3` 上验证生命周期。测试明确区分“同模块重新启用”和“实际新 callback 加载”，不能只改磁盘版本号就宣称升级完成。
- `test/billion-context-billing.mjs`、`test/billion-context-auto.mjs`：保留真实 billion-context 发布包矩阵；另有 null usage、回执、归档、恢复与增量目录扫描测试。

本地 Linux 的一次冷全量清单读取约 9 ms，1,000 次真实宿主缓存识别合计约 90 ms。数字随机器而变；关键可复验断言是空闲全量扫描和文件读取均为零。**这不是报告者 Windows 1.5–6 秒停顿已消失的实机验证。** Windows 需要升级、完全重启宿主，再运行原探针比较。
