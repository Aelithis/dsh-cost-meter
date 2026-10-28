// One optional display introduction; billing/safety notices are deliberately separate.
window.__ModuleLoader__.load({
  id: 'dsh-cost-meter', chunk: 'client.notices.js',
  factory(require) {
    const { createElement: el, useRef, useState, useEffect } = require('react')
    // Stable across releases. Existing dismissals mean “no more display introductions”.
    const SEEN_KEY = 'dsh-cost-meter:display-onboarding-seen'
    const LEGACY_KEYS = ['dsh-cost-meter:simple-guide-dismissed', 'dsh-cost-meter:balance-click-hint-seen',
      'dsh-cost-meter:peak-progress-intro-v1', 'dsh-cost-meter:sidebar-summary-intro-v1']
    const MARKERS = ['sidebarSimplePromptSeen', 'sidebarSummaryPromptSeen', 'peakProgressPromptSeen']
    const listeners = new Set()
    let dismissed = false
    const locallySeen = () => {
      if (dismissed) return true
      try { return [SEEN_KEY, ...LEGACY_KEYS].some(key => window.localStorage.getItem(key) === '1') } catch { return false }
    }
    const seen = config => locallySeen() || MARKERS.some(key => config[key] === true)
      || config.quotaStrip?.promptSeen === true || config.balance?.clickHintSeen === true
    const notify = () => {
      // A duplicated host slot must not display two cards or briefly reveal a successor.
      const owner = dismissed ? null : [...listeners].find(entry => entry.ready)
      for (const entry of listeners) entry.update(entry === owner)
    }
    const remember = () => {
      dismissed = true
      for (const key of [SEEN_KEY, ...LEGACY_KEYS]) {
        try { window.localStorage.setItem(key, '1') } catch { /* Memory still survives remounts. */ }
      }
      notify()
    }
    function mount({ FloatingCard, makeT, resolveLocale }) {
      return function DisplayIntroduction(props) {
        const store = props.useCost?.(s => s)
        const config = store?.state?.config
        const busy = useRef(false), previousFocus = useRef(null)
        const [visible, setVisible] = useState(false)
        const eligible = !!config && !seen(config)
        useEffect(() => {
          if (!eligible) return
          const entry = { update: setVisible, ready: false }
          const refresh = () => {
            // Optional guidance never covers an existing settings, consent or safety dialog.
            const dialogs = document.querySelectorAll?.('dialog[open],[role="dialog"],[aria-modal="true"]') ?? []
            entry.ready = !document.hidden && ![...dialogs].some(node => !node.matches('[data-cm-onboarding]') && node.getClientRects().length)
            notify()
          }
          const sync = event => {
            if ([SEEN_KEY, ...LEGACY_KEYS].includes(event.key) && event.newValue === '1') { dismissed = true; notify() }
          }
          listeners.add(entry); refresh()
          let frame = null
          const schedule = () => {
            if (frame !== null) return
            frame = window.requestAnimationFrame(() => { frame = null; refresh() })
          }
          const observer = typeof MutationObserver === 'function' ? new MutationObserver(schedule) : null
          if (document.body) observer?.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open', 'hidden', 'aria-modal', 'class', 'style'] })
          document.addEventListener?.('visibilitychange', refresh)
          window.addEventListener?.('storage', sync)
          return () => { observer?.disconnect(); if (frame !== null) window.cancelAnimationFrame(frame); document.removeEventListener?.('visibilitychange', refresh); listeners.delete(entry); notify(); window.removeEventListener?.('storage', sync) }
        }, [eligible])
        useEffect(() => {
          if (visible) previousFocus.current = document.activeElement
        }, [visible])
        if (!eligible || !visible) return null
        const t = makeT(resolveLocale(config)), en = resolveLocale(config) === 'en'
        const text = (zh, english) => en ? english : zh
        const dismiss = () => {
          if (busy.current || dismissed) return
          busy.current = true
          const restoreFocus = document.activeElement?.closest?.('[data-cm-onboarding]')
          remember() // Immediate, independent of rejected, stripped or never-resolving RPCs.
          if (restoreFocus && previousFocus.current?.isConnected) previousFocus.current.focus?.({ preventScroll: true })
          // Never spread a stale settings snapshot. Only mark known introductions read;
          // optional fields absent on older hosts must not be sent to their schemas.
          const patch = Object.fromEntries(MARKERS.filter(key => Object.hasOwn(config, key)).map(key => [key, true]))
          if (Object.hasOwn(config.quotaStrip ?? {}, 'promptSeen')) patch.quotaStrip = { promptSeen: true }
          if (Object.hasOwn(config.balance ?? {}, 'clickHintSeen')) patch.balance = { clickHintSeen: true }
          if (Object.keys(patch).length) Promise.resolve().then(() => props.api?.updateConfig(patch)).catch(() => {})
        }
        return el(FloatingCard, { actions: { dismiss }, className: 'cm-qguide', role: 'dialog', 'data-cm-onboarding': '',
          'aria-label': text('按需设置费用显示', 'Set up your cost display'),
          onKeyDown: event => { if (event.key === 'Escape') { event.stopPropagation(); dismiss() } } },
          el('div', { className: 'cm-bbox-head' }, el('h4', null, text('按需设置费用显示', 'Set up your cost display')),
            el('button', { type: 'button', className: 'cm-btn small', 'aria-label': t('closeGuide'), 'data-cm-action': 'dismiss', onClick: dismiss }, '×')),
          el('p', null, text('在「设置 → 费用 → 显示」中统一选择侧栏样式、额度横条和峰谷进度，随时可改；现在无需设置。',
            'Choose sidebar styles, the quota strip and pricing-period progress in Settings → Cost → Display. You can change them anytime; no setup is required now.')),
          el('p', null, t('balanceClickGuideBody')),
          el('p', null, text('关闭提示会保留当前显示、余额与计费设置。', 'Dismissing this guide keeps your display, balance and billing settings unchanged.')),
          el('div', { className: 'cm-buttons' },
            el('button', { type: 'button', className: 'cm-btn small primary', 'data-cm-action': 'dismiss', onClick: dismiss }, t('balanceClickGuideOk'))))
      }
    }
    return { mount }
  },
})
