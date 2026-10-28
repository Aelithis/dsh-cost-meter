/** Local-only peak-period progress and scheduled pricing alerts. */
window.__ModuleLoader__.load({
  id: 'dsh-cost-meter', chunk: 'client.peak.js',
  factory: require => {
    const React = require('react')
    const { createElement: el, useState, useEffect, Fragment } = React
    const css = 'PEAK_STYLE_SOURCE'
    const PEAK_ALERT_PREVIEW_EVENT = 'cm-peak-alert-preview'
    let lastPeakNotifyAtMs = 0

    function mount(helpers) {
      const { peakView, peakPhaseAt, peakPhaseForConfig = (config, now) => peakPhaseAt(now, config.peakWindows, config.peakHolidays), peakConfigForState = state => state?.config, phaseLabelKeys, countdownText, resolveLocale, makeT, Tooltip, FloatingCard } = helpers
      let style = document.getElementById('dsh-cost-meter-peak-style')
      if (!style) { style = document.createElement('style'); style.id = 'dsh-cost-meter-peak-style'; document.head.appendChild(style) }
      style.textContent = css
      /* PEAK_COMPONENT_SOURCE */
      /* PEAK_ALERT_SOURCE */

      return props => el(props.view === 'alert' ? PeakAlert : PeakProgress, props)
    }
    return { mount }
  },
})
