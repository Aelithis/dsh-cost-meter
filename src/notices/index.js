// Balance-refresh announcement loads separately from the bounded core client.
window.__ModuleLoader__.load({
  id: 'dsh-cost-meter', chunk: 'client.notices.js',
  factory(require) {
    const React = require('react')
    const { createElement: el, useRef, useState, useEffect } = React
    function mount({ FloatingCard, CODING_PLAN_ROWS, makeT, resolveLocale, simpleGuideSeen }) {
    // 更新后的提醒(issue #37):告知侧边栏余额/额度图框支持点击立即刷新;
    // 「知道了」写回 balance.clickHintSeen=true 后永久消失(挂常驻 sidebar.footer.action)。
    // 仅在侧边栏确有可点击图框(官方余额 / 自定义余额 / Coding Plan)时展示,避免噪音。
    // 已读标记双通道:配置标记(跨设备) + localStorage 本地兜底。后者防御版本错位——
    // 服务端/网关若运行旧版 typert schema(decode 时 zod parse 会剥离 schema 未声明的键),
    // 新增的配置标记在到达客户端前就被剥掉,卡片会在每次刷新后重现;localStorage 不经 RPC 链路,不受影响。
    const BALANCE_CLICK_HINT_LS_KEY = 'dsh-cost-meter:balance-click-hint-seen'
    let balanceClickHintDismissed = false
    const balanceClickHintListeners = new Set()
    const readBalanceClickHintLS = () => {
      if (balanceClickHintDismissed) return true
      try { return window.localStorage.getItem(BALANCE_CLICK_HINT_LS_KEY) === '1' } catch (_) { return false } // 隐私模式等场景静默
    }
    const writeBalanceClickHintLS = () => {
      balanceClickHintDismissed = true
      try { window.localStorage.setItem(BALANCE_CLICK_HINT_LS_KEY, '1') } catch (_) { /* 本页重挂仍使用内存标记 */ }
      for (const hide of balanceClickHintListeners) hide()
    }
    function BalanceClickGuide(props) {
      // Hook 全部前置(promptSeen 类标记翻转时会提前 return null,顺序必须稳定)。
      const costStore = props.useCost ? props.useCost(s => s) : undefined
      const busyRef = useRef(false)
      const [dismissed, setDismissed] = useState(false)
      const [lsSeen] = useState(readBalanceClickHintLS)
      useEffect(() => {
        const hide = () => setDismissed(true)
        const sync = event => { if (event.key === BALANCE_CLICK_HINT_LS_KEY && event.newValue === '1') { balanceClickHintDismissed = true; hide() } }
        balanceClickHintListeners.add(hide)
        window.addEventListener?.('storage', sync)
        return () => { balanceClickHintListeners.delete(hide); window.removeEventListener?.('storage', sync) }
      }, [])
      const state = costStore?.state
      if (!state) return null
      const config = state.config
      const sidebarBalanceOn = config.balance?.display === 'sidebar' || config.balance?.display === 'both'
      const sidebarCustomOn = (config?.customBalances ?? []).some(e => e?.enabled === true && (e.display === 'sidebar' || e.display === 'both'))
        || (config.customBalance?.enabled === true && (config.customBalance?.display === 'sidebar' || config.customBalance?.display === 'both'))
      const sidebarPlansOn = CODING_PLAN_ROWS.some(r => {
        const entry = config.codingPlans?.[r.id]
        return entry?.enabled === true && (entry.display === 'sidebar' || entry.display === 'both')
      })
      if (dismissed || lsSeen || config.balance?.clickHintSeen === true || (!sidebarBalanceOn && !sidebarCustomOn && !sidebarPlansOn)) return null
      // 串行展示:横条引导(QuotaStripGuide)与本卡同为 fixed 顶部卡片,同屏会完全重叠,
      // 点掉一张露出另一张,视觉上像「点了没反应」。等横条引导处理完(promptSeen)再出现。
      if (!simpleGuideSeen(config)) return null
      if (config.quotaStrip?.promptSeen !== true) return null
      const t = makeT(resolveLocale(config))
      const dismiss = () => {
        if (busyRef.current === true) return
        // 已读不是设置变更:立即关闭且不因 RPC 拒绝、旧版 schema 或迟到的失败重新弹出。
        setDismissed(true)
        busyRef.current = true
        writeBalanceClickHintLS() // 本地兜底同步落点,不依赖 RPC 成败
        // Only patch the marker; a stale notice must not overwrite balance settings.
        Promise.resolve().then(() => props.api.updateConfig({ balance: { clickHintSeen: true } })).catch(() => {})
      }
      return el(FloatingCard, { actions: { dismiss }, className: 'cm-qguide', role: 'dialog', 'aria-label': t('balanceClickGuideTitle'), onKeyDown: event => { if (event.key === 'Escape') { event.stopPropagation(); dismiss() } } },
        el('div', { className: 'cm-bbox-head' }, el('h4', null, t('balanceClickGuideTitle')),
          el('button', { type: 'button', className: 'cm-btn small', 'aria-label': t('closeGuide'), 'data-cm-action': 'dismiss', onClick: dismiss }, '×')),
        el('p', null, t('balanceClickGuideBody')),
        el('div', { className: 'cm-buttons' },
          el('button', { type: 'button', className: 'cm-btn small primary', 'data-cm-action': 'dismiss', onClick: dismiss }, t('balanceClickGuideOk'))))
    }

      return BalanceClickGuide
    }
    return { mount }
  },
})
