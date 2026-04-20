import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sendError } from '../api/_lib/handlerUtils.js'
import { loadRows } from '../api/_lib/sessionStore.js'
import type { Row } from '../api/_lib/core/feedProcessor.js'

const PALETTE = ['#4C6A92','#6F8F72','#B97A57','#8C6C99','#C4A46B','#5B7C99','#9E6E6E']
const BRAND = '#2b0573'
const MONTH_ORDER = ['January','February','March','April','May','June','July','August','September','October','November','December']
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function baseOptions(title: string) {
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { color: BRAND, boxWidth: 12 } },
      title: { display: true, text: title, color: BRAND, font: { size: 14 } },
    },
  }
}

function buildDataset(label: string, data: (number | null)[], color: string) {
  return { label, data, borderColor: color, pointBackgroundColor: color, backgroundColor: color, fill: false, tension: 0.3, pointRadius: 3, borderWidth: 2 }
}

function buildChartData(combined: Row[], gads: Row[]) {
  const gadsMap = new Map<string, Row[]>()
  for (const r of gads) {
    const kn = String(r.keyword_norm ?? '').toLowerCase().trim()
    if (!gadsMap.has(kn)) gadsMap.set(kn, [])
    gadsMap.get(kn)!.push(r)
  }

  const fv: Array<Row & { dateKey: string; monthName: string }> = []
  for (const row of combined) {
    const kn = String(row.keyword ?? '').toLowerCase().trim()
    for (const gr of gadsMap.get(kn) ?? []) {
      const year = parseInt(gr.year ?? '')
      const month = parseInt(gr.month ?? '')
      const searches = parseFloat(gr.monthly_searches ?? '')
      if (isNaN(year) || isNaN(month) || isNaN(searches)) continue
      const dateKey = `${year}-${String(month).padStart(2, '0')}`
      const monthName = MONTH_ORDER[month - 1] ?? 'January'
      fv.push({ ...row, ...gr, dateKey, monthName })
    }
  }

  // List totals for legend sort
  const listTotals = new Map<string, number>()
  for (const r of fv) {
    const ln = String(r.list_name ?? '')
    listTotals.set(ln, (listTotals.get(ln) ?? 0) + parseFloat(r.monthly_searches ?? '0'))
  }
  const legendSort = [...listTotals.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k)

  return { fv, legendSort }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { combinedDfBlobUrl, gadsDfBlobUrl, chosenLists } = req.body as {
      combinedDfBlobUrl: string; gadsDfBlobUrl: string; chosenLists?: string[]
    }

    const [combined, gads] = await Promise.all([loadRows(combinedDfBlobUrl), loadRows(gadsDfBlobUrl)])
    const { fv, legendSort } = buildChartData(combined, gads)

    const lists = chosenLists?.length ? chosenLists : legendSort
    const subset = fv.filter(r => lists.includes(String(r.list_name ?? '')))

    // Chronological chart
    const chronMap = new Map<string, Map<string, number>>() // list → dateKey → sum
    const dateKeys = new Set<string>()
    for (const r of subset) {
      const ln = String(r.list_name ?? '')
      if (!chronMap.has(ln)) chronMap.set(ln, new Map())
      const prev = chronMap.get(ln)!.get(r.dateKey) ?? 0
      chronMap.get(ln)!.set(r.dateKey, prev + parseFloat(String(r.monthly_searches ?? '0')))
      dateKeys.add(r.dateKey)
    }
    const sortedDates = [...dateKeys].sort()
    const dateLabels = sortedDates.map(d => {
      const [y, m] = d.split('-')
      return `${MONTH_SHORT[parseInt(m) - 1]} ${y}`
    })
    const chronDatasets = legendSort
      .filter(ln => lists.includes(ln))
      .map((ln, i) => buildDataset(ln, sortedDates.map(d => chronMap.get(ln)?.get(d) ?? null), PALETTE[i % PALETTE.length]))

    const chronOptions = { ...baseOptions('Total search volume by list'), scales: {
      x: { title: { display: true, text: 'Month', color: BRAND }, ticks: { color: BRAND, maxTicksLimit: 12 }, grid: { display: false } },
      y: { title: { display: true, text: 'Total searches', color: BRAND }, ticks: { color: BRAND }, grid: { display: false }, beginAtZero: true },
    }}
    const chronologicalSpec = { type: 'line', data: { labels: dateLabels, datasets: chronDatasets }, options: chronOptions }

    // Seasonality chart
    const seasonMap = new Map<string, Map<string, number>>() // list → monthName → sum
    const monthCounts = new Map<string, Map<string, number>>()
    for (const r of subset) {
      const ln = String(r.list_name ?? '')
      if (!seasonMap.has(ln)) { seasonMap.set(ln, new Map()); monthCounts.set(ln, new Map()) }
      const prev = seasonMap.get(ln)!.get(r.monthName) ?? 0
      seasonMap.get(ln)!.set(r.monthName, prev + parseFloat(String(r.monthly_searches ?? '0')))
    }
    const seasonDatasets = legendSort
      .filter(ln => lists.includes(ln))
      .map((ln, i) => {
        const monthData = seasonMap.get(ln) ?? new Map()
        const maxVal = Math.max(...[...monthData.values()], 1)
        return buildDataset(ln, MONTH_ORDER.map(m => {
          const v = monthData.get(m)
          return v != null ? Math.round((v / maxVal) * 1000) / 10 : null
        }), PALETTE[i % PALETTE.length])
      })

    const seasonOptions = { ...baseOptions('Seasonality by list (% of peak month)'), scales: {
      x: { title: { display: true, text: 'Month', color: BRAND }, ticks: { color: BRAND }, grid: { display: false } },
      y: { title: { display: true, text: '% of peak', color: BRAND }, ticks: { color: BRAND }, min: 0, max: 100, grid: { display: false } },
    }}
    const seasonalitySpec = { type: 'line', data: { labels: MONTH_SHORT, datasets: seasonDatasets }, options: seasonOptions }

    res.status(200).json({ chronologicalSpec, seasonalitySpec })
  } catch (err) {
    sendError(res, err)
  }
}
