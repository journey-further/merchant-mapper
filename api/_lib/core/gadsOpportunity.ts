import type { Row } from './feedProcessor.js'

const STOCK_ANCHOR = 50.0
const SV_DIVISOR = 2000.0
const SV_FLOOR = 0.1
const VALUE_ANCHOR = 5000.0

function num(v: unknown, fallback = 0): number {
  const n = parseFloat(String(v ?? ''))
  return isNaN(n) ? fallback : n
}

export function computeOpportunity(combinedRows: Row[], gadsRows: Row[]): Row[] {
  if (!combinedRows.length || !gadsRows.length) return []

  // Build lookup: keyword_norm → [gads rows]
  const gadsMap = new Map<string, Row[]>()
  for (const row of gadsRows) {
    const kn = String(row.keyword_norm ?? '').toLowerCase().trim()
    if (!gadsMap.has(kn)) gadsMap.set(kn, [])
    gadsMap.get(kn)!.push(row)
  }

  const ORDERED = [
    'list_name','keyword','Product Count','Unique Product Groups',
    'Clicks (28d)','Clicks Monthly Est','Total Quantity','Sales Currency','Total Sales Value',
    'avg_monthly_searches','competition_level','competition_index',
    'year','month','date','monthly_searches','exact_match','matched_to','close_variants',
  ]

  const out: Row[] = []
  for (const row of combinedRows) {
    const kn = String(row.keyword ?? '').toLowerCase().trim()
    const matches = gadsMap.get(kn) ?? [{}]
    for (const gRow of matches) {
      const merged: Row = { ...row, ...gRow }
      merged.keyword_norm = kn
      merged.exact_match = String(kn === String(gRow.canonical_keyword ?? '').toLowerCase().trim())
      merged.matched_to = String(gRow.canonical_keyword ?? '')
      const yr = String(gRow.year ?? '').trim()
      const mo = String(gRow.month ?? '').trim().padStart(2, '0')
      merged.date = yr && mo !== '00' ? `${yr}-${mo}-01` : ''
      out.push(merged)
    }
  }

  // Reorder columns
  const allKeys = new Set(out.flatMap(r => Object.keys(r)))
  const orderedKeys = [...ORDERED.filter(k => allKeys.has(k)), ...[...allKeys].filter(k => !ORDERED.includes(k))]
  return out.map(row => Object.fromEntries(orderedKeys.map(k => [k, row[k] ?? ''])))
}

export function computeSalesOpportunity(finalView: Row[]): Row[] {
  if (!finalView.length) return []

  const DROP = new Set(['year','month','monthly_searches','canonical_keyword','keyword_norm',
    'Capture Rate','Baseline Capture Rate','Expected Clicks','Potential Click Upside',
    'Value per Click','Opportunity Value','Opportunity Score'])

  // Deduplicate by (list_name, keyword)
  const seen = new Set<string>()
  const deduped: Row[] = []
  for (const row of finalView) {
    const key = `${row.list_name}||${row.keyword}`
    if (!seen.has(key)) { seen.add(key); deduped.push(row) }
  }

  const result: Row[] = []
  const scores: number[] = []

  for (const row of deduped) {
    const clicksMonthly = Math.max(num(row['Clicks Monthly Est']), num(row['Clicks (28d)']) * 30 / 28)
    const upg = Math.max(num(row['Unique Product Groups']), 0)
    const logUpg = Math.log(Math.max(upg, 1))
    const pc = Math.max(num(row['Product Count'], 1), 1)
    const qty = Math.max(num(row['Total Quantity']), 0)
    const avgQty = qty / pc
    const stockMult = Math.min(Math.log1p(avgQty) / Math.log1p(STOCK_ANCHOR), 1.0)
    const sv = Math.max(num(row.avg_monthly_searches), 0)
    const svMult = Math.max(1 - Math.exp(-sv / SV_DIVISOR), SV_FLOOR)
    const sales = Math.max(num(row['Total Sales Value']), 0)
    const spg = sales / Math.max(upg, 1)
    const valueMult = Math.min(Math.log1p(spg) / Math.log1p(VALUE_ANCHOR), 1.0)
    const score = Math.round(clicksMonthly * logUpg * stockMult * svMult * valueMult * 100) / 100
    scores.push(score)
    result.push({ ...row, 'Opportunity Score': String(score) })
  }

  // Priority Score: log10 normalised to 0-10 capped at 95th percentile
  const nonzero = scores.filter(s => s > 0).sort((a, b) => a - b)
  const cap = nonzero.length ? Math.max(nonzero[Math.floor(nonzero.length * 0.95)], 1) : 1
  const logCap = Math.log10(cap + 1)

  const FINAL_DROP = new Set([
    'Clicks Monthly Est','competition_level','competition_index',
    'low_top_of_page_bid_micros','high_top_of_page_bid_micros',
    'exact_match','matched_to','close_variants','keyword_norm',
  ])
  const ORDERED = [
    'list_name','keyword','Main Category','Penultimate Category','Final Category',
    'Priority Score','Product Count','Unique Product Groups','Clicks (28d)',
    'Total Quantity','Sales Currency','Total Sales Value','Avg. Monthly Searches','Opportunity Score',
  ]

  return result
    .map((row, i) => {
      const priority = Math.min(10 * Math.log10(scores[i] + 1) / logCap, 10)
      const out: Row = {}
      for (const [k, v] of Object.entries(row)) {
        if (FINAL_DROP.has(k)) continue
        if (k === 'avg_monthly_searches') { out['Avg. Monthly Searches'] = v; continue }
        out[k] = v
      }
      out['Priority Score'] = String(Math.round(priority * 10) / 10)
      // Reorder
      const allKeys = new Set(Object.keys(out))
      return Object.fromEntries([
        ...ORDERED.filter(k => allKeys.has(k)).map(k => [k, out[k]]),
        ...[...allKeys].filter(k => !ORDERED.includes(k)).map(k => [k, out[k]]),
      ])
    })
    .sort((a, b) => parseFloat(b['Priority Score'] ?? '0') - parseFloat(a['Priority Score'] ?? '0'))
}
