/** Read-only OpenRouter prices loaded in Prices settings. Model tooltips reuse that snapshot. */
window.__ModuleLoader__.load({
  id: 'dsh-cost-meter', chunk: 'client.openrouter.js',
  factory: require => {
    const React = require('react')
    const { createElement: el, useState, useEffect, useRef } = React
    function parseCatalog(value) {
      if (!value || typeof value.fetchedAt !== 'string' || typeof value.stale !== 'boolean' || typeof value.error !== 'string' || !Array.isArray(value.models)) throw new Error('Invalid OpenRouter catalog')
      const rate = n => typeof n === 'number' && Number.isFinite(n) && n >= 0
      for (const row of value.models) {
        if (!row || typeof row.id !== 'string' || typeof row.name !== 'string' || !rate(row.input) || !rate(row.output)
          || !['cachedInput', 'cacheWrite'].every(key => row[key] === null || rate(row[key]))
          || !(row.contextLength === null || Number.isSafeInteger(row.contextLength) && row.contextLength >= 0)) throw new Error('Invalid OpenRouter model price')
      }
      return value
    }
    const schema = { parse: parseCatalog }
    const CONTRIBUTION = {
      package: 'dsh-cost-meter-openrouter', face: 'host', descriptors: [{
        id: 'dsh-cost-meter#costMeter/getOpenRouterCatalog', service: 'costMeter', namespace: 'costMeter', method: 'getOpenRouterCatalog',
        invocation: { kind: 'direct' }, parameters: [],
        result: { mode: 'strict', typeSymbol: 'dsh-cost-meter#OpenRouterCatalog', schema, create: () => schema },
      }],
    }
    const modelUrl = id => 'https://openrouter.ai/' + id.split('/').map(encodeURIComponent).join('/')
    const priceText = value => value === null ? '—' : '$' + String(value)
    const changedRates = (before, after) => {
      const old = new Map((before?.models ?? []).map(row => [row.id, row]))
      return new Set(after.models.filter(row => old.has(row.id) && ['input', 'output', 'cachedInput', 'cacheWrite'].some(key => old.get(row.id)[key] !== row[key])).map(row => row.id))
    }
    const priceSnapshots = new WeakMap()
    const priceSession = api => {
      if (!priceSnapshots.has(api)) priceSnapshots.set(api, { value: null, error: '', checkedAt: 0, pending: null, changed: new Set(), query: '', sort: 'name', page: 0 })
      return priceSnapshots.get(api)
    }
    const readPrices = (api, session) => {
      if (session.pending) return session.pending
      session.pending = Promise.resolve().then(() => api.getOpenRouterCatalog()).then(raw => {
        const next = parseCatalog(raw)
        if (!next.stale && next.fetchedAt !== session.value?.fetchedAt) session.changed = changedRates(session.value, next)
        // An error response without rows must not discard the last usable table.
        session.value = next.error && !next.models.length && session.value?.models.length ? { ...session.value, stale: true, error: next.error } : next
        session.error = next.error
        return session.value
      }).catch(error => { session.error = String(error?.message ?? error); throw error }).finally(() => { session.checkedAt = Date.now(); session.pending = null })
      return session.pending
    }
    function PriceBrowser({ api, state, resolveLocale }) {
      const en = resolveLocale(state.config) === 'en', text = (zh, english) => en ? english : zh
      const session = priceSession(api)
      const [value, setValue] = useState(() => session.value), [error, setError] = useState(() => session.error), [busy, setBusy] = useState(false)
      const [query, setQuery] = useState(() => session.query), [sort, setSort] = useState(() => session.sort), [page, setPage] = useState(() => session.page)
      const [changed, setChanged] = useState(() => session.changed)
      const refreshRef = useRef(() => {})
      useEffect(() => {
        let active = true, pending = false
        const refresh = async (force = false) => {
          if (!active || pending || document.hidden) return
          if (!force && !session.pending && session.value && Date.now() - session.checkedAt < 60000) return
          pending = true; setBusy(true)
          try {
            const next = await readPrices(api, session)
            if (!active) return
            setChanged(session.changed)
            setValue(next); setError(next.error)
          } catch (e) { if (active) setError(String(e?.message ?? e)) }
          finally { pending = false; if (active) setBusy(false) }
        }
        const requestRefresh = () => refresh(true)
        refreshRef.current = requestRefresh
        void refresh()
        const timer = setInterval(requestRefresh, 60000)
        document.addEventListener('visibilitychange', requestRefresh)
        return () => { active = false; clearInterval(timer); document.removeEventListener('visibilitychange', requestRefresh) }
      }, [api])
      const rows = (value?.models ?? []).filter(row => (row.id + ' ' + row.name).toLowerCase().includes(query.trim().toLowerCase()))
        .sort((a, b) => (sort === 'name' ? 0 : a[sort] - b[sort]) || a.id.localeCompare(b.id))
      const current = Math.min(page, Math.max(0, Math.ceil(rows.length / 50) - 1))
      const button = (label, onClick, disabled = false) => el('button', { type: 'button', className: 'cm-btn small', onClick, disabled }, label)
      return el('section', { className: 'cm-price-card', 'aria-label': text('OpenRouter 模型价格', 'OpenRouter model prices') },
        el('div', { className: 'cm-price-head', style: { flexWrap: 'wrap' } },
          el('h3', { className: 'cm-h' }, text('OpenRouter 模型价格', 'OpenRouter model prices')),
          button(busy ? text('刷新中…', 'Refreshing…') : text('刷新价格', 'Refresh prices'), () => refreshRef.current(), busy)),
        el('p', { className: 'cm-note' }, text('公开目录 · 美元 / 百万 tokens · 无需 API Key，不产生模型调用费用。优先显示上次价格，前台每分钟更新，也可手动刷新。', 'Public catalog · USD / million tokens · No API key or inference charges. Previous prices appear immediately; updates every minute while visible or on manual refresh.')),
        el('div', { className: 'cm-buttons' },
          el('input', { className: 'cm-input', type: 'search', value: query, autoComplete: 'off', 'aria-label': text('搜索 OpenRouter 模型', 'Search OpenRouter models'), placeholder: text('搜索模型，例如 flash', 'Search models, e.g. flash'), style: { flex: '1 1 180px', minWidth: 0, maxWidth: '100%' }, onChange: event => { session.query = event.target.value; session.page = 0; setQuery(session.query); setPage(0) } }),
          el('select', { className: 'cm-input', value: sort, 'aria-label': text('价格排序', 'Price order'), onChange: event => { session.sort = event.target.value; session.page = 0; setSort(session.sort); setPage(0) } },
            ...[['name', text('按模型名称', 'Model name')], ['input', text('输入价格从低到高', 'Input price: low to high')], ['output', text('输出价格从低到高', 'Output price: low to high')]].map(([id, label]) => el('option', { key: id, value: id }, label)))),
        el('p', { className: 'cm-note', role: 'status' }, value?.fetchedAt ? text('最近更新：', 'Last updated: ') + new Date(value.fetchedAt).toLocaleString(en ? 'en-US' : 'zh-CN') : text('尚未取得价格', 'Prices not loaded yet')),
        error ? el('p', { className: 'cm-msg err', role: 'alert' }, (value?.models.length ? text('刷新失败，以下保留上次价格：', 'Refresh failed; previous prices are retained: ') : text('价格查询失败：', 'Price lookup failed: ')) + error) : null,
        rows.length ? el('div', { className: 'cm-scroll', tabIndex: 0, 'aria-label': text('OpenRouter 价格表', 'OpenRouter price table') },
          el('table', { className: 'cm-table' },
            el('thead', null, el('tr', null, ...[text('模型', 'Model'), text('输入', 'Input'), text('输出', 'Output'), text('缓存读取', 'Cache read'), text('缓存写入', 'Cache write'), text('上下文 tokens', 'Context tokens')].map((name, i) => el('th', { key: name, scope: 'col', className: i ? 'num' : undefined }, name)))),
            el('tbody', null, rows.slice(current * 50, current * 50 + 50).map(row => el('tr', { key: row.id },
              el('td', { style: { whiteSpace: 'normal', minWidth: 180, maxWidth: 300, overflowWrap: 'anywhere' } },
                el('a', { href: modelUrl(row.id), target: '_blank', rel: 'noopener noreferrer', style: { color: 'var(--dsw-alias-brand-primary)' } }, row.name),
                el('div', { className: 'cm-sess-id' }, row.id),
                changed.has(row.id) ? el('span', { className: 'cm-price-legacy' }, text('价格已变动', 'Price changed')) : null),
              ...['input', 'output', 'cachedInput', 'cacheWrite'].map(key => el('td', { key, className: 'num' }, priceText(row[key]))),
              el('td', { className: 'num' }, row.contextLength === null ? '—' : row.contextLength.toLocaleString()))))))
          : el('p', { className: 'cm-empty' }, busy && !value ? text('正在查询公开目录…', 'Loading public catalog…') : text('没有匹配的模型。', 'No matching models.')),
        el('div', { className: 'cm-buttons' },
          el('span', { className: 'cm-note' }, rows.length ? `${current * 50 + 1}–${Math.min((current + 1) * 50, rows.length)} / ${rows.length}` : '0'),
          button(text('上一页', 'Previous'), () => { session.page = current - 1; setPage(session.page) }, current === 0),
          button(text('下一页', 'Next'), () => { session.page = current + 1; setPage(session.page) }, (current + 1) * 50 >= rows.length)),
        el('p', { className: 'cm-note' }, text('显示当前公开 token 参考价；— 表示目录未提供。具体路由、阶梯价格和图片、搜索等附加费用请点模型查看。优惠与实际结算以 OpenRouter 为准。', 'Current public token reference rates; — means unavailable. Open a model for routing, price tiers and extra image/search fees. Promotions and final charges are determined by OpenRouter.')))
    }
    // The host model picker exposes no per-option slot. Preserve its native title
    // tooltip, resolving each row through the host catalog instead of guessing IDs
    // from display names or touching React internals / selection handlers.
    function pickerModel(button, groups) {
      const name = button.querySelector('span[class$="_modelName"]')?.textContent
      const section = button.closest('section[role="group"][aria-labelledby]')
      const heading = section && document.getElementById(section.getAttribute('aria-labelledby'))
      if (!name || !heading || !section.contains(heading)) return null
      const matches = groups.filter(group => group.name === heading.textContent)
      if (matches.length !== 1 || !['openrouter', 'llm-openrouter'].includes(matches[0].id)) return null
      const models = matches[0].models.filter(model => model.name === name)
      return models.length === 1 ? models[0] : null
    }
    function priceTooltip(model, value, locale) {
      const en = locale === 'en', text = (zh, english) => en ? english : zh
      const row = value?.models.find(row => row.id === model.id)
      const lines = [model.name, 'OpenRouter · ' + model.id]
      if (row) {
        lines.push(text('美元 / 百万 tokens', 'USD / million tokens'))
        for (const [key, zh, english] of [['input', '输入', 'Input'], ['output', '输出', 'Output'], ['cachedInput', '缓存读取', 'Cache read'], ['cacheWrite', '缓存写入', 'Cache write']]) lines.push(text(zh, english) + ': ' + priceText(row[key]))
        if (row.contextLength !== null) lines.push(text('上下文', 'Context') + ': ' + row.contextLength.toLocaleString() + ' tokens')
      } else lines.push(text('公开目录未提供此模型的 token 单价', 'Token price unavailable for this model in the public catalog'))
      if (value?.fetchedAt) lines.push(text('最近更新: ', 'Updated: ') + new Date(value.fetchedAt).toLocaleString(en ? 'en-US' : 'zh-CN'))
      if (value.stale) lines.push(text('刷新失败，价格未更新', 'Refresh failed; prices have not been updated'))
      lines.push(text('公开参考价；优惠与结算以 OpenRouter 为准', 'Public reference rates; promotions and billing follow OpenRouter'))
      return lines.join('\n')
    }
    function installPickerPrices({ api, getGroups, getLocale, subscribeGroups }) {
      if (typeof MutationObserver !== 'function' || !document.body) return () => {}
      const selector = 'button[role="menuitemradio"]'
      const owned = new Map()
      const session = priceSession(api)
      let active = true
      const restore = (button, item) => {
        if (button.getAttribute('title') === item.written) {
          if (item.original === null) button.removeAttribute('title')
          else button.setAttribute('title', item.original)
        }
        owned.delete(button)
      }
      const scan = () => {
        if (!active) return
        const rows = new Map()
        if (session.value) {
          const groups = getGroups()
          for (const button of document.querySelectorAll(selector)) {
            const model = pickerModel(button, groups)
            if (model) rows.set(button, model)
          }
        }
        for (const [button, item] of owned) if (!rows.has(button)) restore(button, item)
        for (const [button, model] of rows) {
          let item = owned.get(button)
          const title = button.getAttribute('title')
          if (!item || title !== item.written) item = { original: title, written: null }
          item.written = priceTooltip(model, session.value, getLocale())
          owned.set(button, item)
          if (title !== item.written) button.setAttribute('title', item.written)
        }
      }
      const observer = new MutationObserver(records => {
        if (records.some(record => {
          if (record.type === 'attributes') return record.target.matches(selector) && record.target.getAttribute('title') !== owned.get(record.target)?.written
          if (record.type === 'characterData') return record.target.parentElement?.closest(selector)
          return [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1 && (node.matches(selector) || node.querySelector(selector)))
        })) scan()
      })
      observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['title'] })
      const unsubscribe = subscribeGroups?.(scan)
      scan()
      return () => {
        active = false; observer.disconnect(); unsubscribe?.()
        for (const [button, item] of owned) restore(button, item)
      }
    }
    async function mount(ctx, source, resolveLocale) {
      const getLocale = typeof source === 'function' ? source : () => source && resolveLocale ? resolveLocale(source.getSnapshot().state?.config ?? { activeLocale: source.getSnapshot().locale }) : ctx.get('locale')?.getSnapshot?.().active ?? 'en'
      const unmount = await ctx.get('remote').$mount(CONTRIBUTION)
      ctx.effect(() => () => unmount(), 'cost-meter: OpenRouter catalog contribution')
      // dsh-pocket 手机端适配(task-10):价格列表/表头窄屏换行、表格横向滚动;桌面端规则不变。
      const responsiveStyle = document.createElement('style')
      responsiveStyle.textContent = '@media (max-width:1023px){.cm-price-head{flex-wrap:wrap;gap:6px}.cm-scroll>.cm-table{min-width:520px}.cm-price-card{padding:10px 12px}}body[data-dsh-pocket-layout="mobile"] .cm-price-head{flex-wrap:wrap}'
      document.head.appendChild(responsiveStyle)
      ctx.effect(() => () => responsiveStyle.remove(), 'cost-meter: OpenRouter responsive styles')
      const remote = ctx.get('remote.costMeter')
      const api = { getOpenRouterCatalog: async () => {
        const result = await remote.getOpenRouterCatalog()
        if (!result?.ok) throw new Error(result?.error?.message || 'OpenRouter price lookup failed')
        return parseCatalog(result.value)
      } }
      if (typeof ctx.inject === 'function') ctx.inject(['modelDirectories'], scope => {
        const catalog = scope.get('modelDirectories')?.catalog?.store
        if (!catalog?.getSnapshot) return
        scope.effect(() => installPickerPrices({ api, getGroups: () => catalog.getSnapshot()?.value?.groups ?? [], getLocale, subscribeGroups: fn => catalog.subscribe?.(fn) }), 'cost-meter: model price tooltips')
      })
      return props => el(PriceBrowser, { ...props, api })
    }
    return { mount, PriceBrowser, CONTRIBUTION, parseCatalog, changedRates, priceText, modelUrl, pickerModel, priceTooltip, installPickerPrices }
  },
})
