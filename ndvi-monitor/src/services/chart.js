import { INDICES, MONTH_NAMES } from '../config'

export function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function formatAxisMonth(ts) {
  const d = new Date(ts)
  return MONTH_NAMES[d.getMonth()] + ' ' + d.getFullYear()
}

export function buildMonthTicks(data) {
  const map = {}
  data.forEach((d) => {
    const dt = new Date(d.date)
    map[dt.getFullYear() + '-' + (dt.getMonth() + 1)] = new Date(dt.getFullYear(), dt.getMonth(), 1).getTime()
  })
  let values = Object.keys(map).map((k) => map[k]).sort((a, b) => a - b)
  if (values.length <= 7) return values
  const step = Math.ceil(values.length / 7)
  const thinned = values.filter((_, i) => i % step === 0)
  if (thinned[thinned.length - 1] !== values[values.length - 1]) thinned.push(values[values.length - 1])
  return thinned
}

export function currentDateMarkerPlugin() {
  return {
    id: 'currentDateMarker',
    afterDraw(chart) {
      const opts = chart.options.plugins.currentDateMarker
      if (!opts || !opts.xValue) return
      const xScale = chart.scales.x
      if (!xScale) return
      const area = chart.chartArea
      const x = xScale.getPixelForValue(opts.xValue)
      if (x < area.left || x > area.right) return
      const ctx = chart.ctx
      ctx.save()
      ctx.strokeStyle = '#1a56db'
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(x, area.top)
      ctx.lineTo(x, area.bottom)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = '#1a56db'
      ctx.font = 'bold 10px sans-serif'
      ctx.fillText(opts.label || '', Math.min(x + 4, area.right - 50), area.top + 12)
      ctx.restore()
    },
  }
}

export function buildChartConfig(ctx, data, index, large, getStageLabel, benchmarkValue) {
  const cfg = INDICES[index] || INDICES.ndvi
  const monthTicks = buildMonthTicks(data)
  const gradient = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height || 220)
  gradient.addColorStop(0, '#22c55e')
  gradient.addColorStop(0.4, '#a3e635')
  gradient.addColorStop(0.55, '#facc15')
  gradient.addColorStop(0.78, '#fb923c')
  gradient.addColorStop(1, '#ef4444')
  const tickFont = large ? 12 : 11
  const titleFont = large ? 13 : 12
  const datasets = [{
    label: cfg.name,
    data: data.map((d) => ({ x: new Date(d.date).getTime(), y: d.value })),
    borderColor: cfg.color,
    backgroundColor: gradient,
    borderWidth: 2,
    pointRadius: large ? 4 : 3,
    pointBackgroundColor: cfg.color,
    pointHoverRadius: 5,
    fill: true,
    tension: 0.3,
  }]
  if (typeof benchmarkValue === 'number') {
    datasets.push({
      label: 'Benchmark',
      data: data.map((d) => ({ x: new Date(d.date).getTime(), y: benchmarkValue })),
      borderColor: '#4fa8ff',
      borderDash: [6, 4],
      borderWidth: 1.5,
      pointRadius: 0,
      fill: false,
    })
  }

  return {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: typeof benchmarkValue === 'number',
          labels: { color: '#9aa4b1', boxWidth: 14, font: { size: 10 } },
        },
        tooltip: {
          backgroundColor: 'rgba(20, 25, 40, 0.92)',
          titleFont: { size: 12 },
          bodyFont: { size: 12 },
          padding: 10,
          callbacks: {
            title(items) {
              if (!items || !items.length) return ''
              return new Date(items[0].parsed.x).toLocaleDateString('en-US', {
                weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
              })
            },
            label(item) {
              const parts = [cfg.name + ': ' + item.parsed.y.toFixed(2)]
              if (getStageLabel) {
                const stage = getStageLabel(new Date(item.parsed.x))
                if (stage) parts.push(stage)
              }
              return parts
            },
          },
        },
        currentDateMarker: { xValue: null, label: '' },
      },
      scales: {
        x: {
          type: 'linear',
          ticks: {
            font: { size: tickFont },
            color: '#555',
            maxRotation: 0,
            autoSkip: false,
            callback: (value) => formatAxisMonth(value),
          },
          grid: { display: false },
          afterBuildTicks(axis) {
            axis.ticks = monthTicks.map((v) => ({ value: v }))
          },
        },
        y: {
          min: 0,
          max: 1,
          ticks: { stepSize: 0.2, font: { size: tickFont }, color: '#555' },
          grid: { color: '#eeeeee' },
          title: {
            display: true,
            text: cfg.name,
            font: { size: titleFont },
            color: '#333',
          },
        },
      },
    },
    plugins: [currentDateMarkerPlugin()],
  }
}
