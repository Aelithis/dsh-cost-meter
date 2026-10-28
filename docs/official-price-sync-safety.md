# 官方价格币种保护与历史核对

## 中文

官方页面可能只解析出部分模型。此前，从人民币价格切换到美元价格时，部分同步会保留未返回模型的旧数值，却把整张价目表的币种改为美元；展示为人民币时又乘一次汇率。v1.9.42 在这种情况下拒绝整个同步，保留原配置及价格历史。完整同步和不改变币种的部分同步仍可正常工作。

这项保护防止新的错误计价，**不会把已有账本改成推测金额**。仅凭导出的费用报表，不能确认原价格配置、所有历史版本或另一个插件的统计范围。另一插件显示的总额也不等于供应商结算凭证。

### 安全核对顺序

1. 保留原始导出、完整账本和会话日志的只读备份，不删除迁移标记，不清空账本。费用导出是核对报表，不是可以覆盖 `ledger.json` 的备份。
2. 在“费用 → 价格”核对受影响**渠道＋模型**的币种、缓存命中/未命中及输出单价、倍率、峰谷和上下文档位。另一个插件必须使用同一时间范围、渠道、子代理范围和计费口径才能对比。
3. 正确保存未来调用的价格；若同步提示模型不完整，保留原值并检查官方页面，不能仅修改币种标签来强行同步。
4. 仅在确认当前单价适用于所选渠道模型的全部保留历史后，使用[按模型重算历史费用](model-history-repricing.md)的明确确认流程。系统先备份账本，再记录重算范围、前后金额和价格版本；调用 Token、原汇率及其他模型不变，日志不完整的记录跳过。
5. 若只有某一时段的价格异常，而其他时段有真实价格变化，**不要用当前价格覆盖整个模型历史**。应先依据原始配置/价格历史与日志核对分段范围，确认修复方案后再操作。当前模型重算入口不是按时间段修复工具。

升级与价格同步本身均不执行第 4 步。未得到可靠来源确认前，保留“金额待核对”的结论比强行凑成某个总额更安全。

## English

A partially parsed official page previously could keep omitted models' CNY numbers while changing the whole table's currency to USD. Converting those charges to CNY then multiplied them by the exchange rate again. Version 1.9.42 rejects that entire cross-currency synchronization, preserving configuration and pricing history. Complete synchronization and same-currency partial updates remain supported.

This protection does not rewrite recorded charges. Keep read-only copies of the original export, complete ledger and session logs. An export is a report, not a replacement ledger. Compare the same time range, channel, model, subagent scope, cache rates, multipliers and pricing tiers; another plugin's total is not an authoritative invoice.

Correct future pricing first. Use the explicitly confirmed [channel/model history recalculation](model-history-repricing.md) only when those current rates are appropriate for all retained calls in the selected scope. That path creates a full backup, records before/after totals and retains original exchange rates; incomplete logs are skipped. It is not an interval-specific repair tool. If only one historical interval is wrong, verify the original pricing versions and affected interval before authorizing a scoped repair. Updating the plugin or synchronizing prices never starts historical recalculation automatically.
