import { norm, toNumber, toCcy, INVALIDS, isBlank } from './utils.js'
import type { Row } from './feedProcessor.js'

const OUT_COLS = [
  'keyword', 'Product Count', 'Unique Product Groups',
  'Clicks (28d)', 'Clicks Monthly Est',
  'Total Quantity', 'Sales Currency', 'Total Sales Value',
]

const CATEGORY_COLS = ['Main Category', 'Penultimate Category', 'Final Category']

function categoryMode(values: string[]): string {
  const valid = values.map(v => v.trim().toLowerCase()).filter(v => !INVALIDS.has(v))
  if (!valid.length) return ''
  const counts = new Map<string, number>()
  for (const v of valid) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
}

function findCol(columns: string[], ...targets: string[]): string | null {
  for (const t of targets) {
    const found = columns.find(c => norm(c) === norm(t))
    if (found) return found
  }
  return null
}

export function makeKeywords(rows: Row[], cols: string[], explodeAmpersand = false): Row[] {
  if (!cols.length || !rows.length) return []

  const allCols = Object.keys(rows[0])
  const priceCol = findCol(allCols, 'price')
  const priceCcyCol = findCol(allCols, 'price_currency')
  const qtyCol = findCol(allCols, 'quantity', 'qauntity', 'sell on google quantity')
  const clicksCol = findCol(allCols, 'all clicks', 'all_clicks', '28 day clicks', 'clicks')
  const hasGroupId = allCols.includes('image_group_id')

  type Expanded = { keyword: string; srcIdx: number }
  const expanded: Expanded[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const vals = cols.map(c => String(row[c] ?? '').trim().toLowerCase())
    if (vals.some(v => INVALIDS.has(v))) continue

    if (explodeAmpersand) {
      const tokenLists = vals.map(v => {
        if (!v.includes('&')) return [v]
        const parts = v.split(/\s*&\s*/).map(p => p.trim()).filter(Boolean)
        return parts.length ? parts : [v]
      })
      // Cartesian product
      const product = (lists: string[][]): string[][] => {
        if (!lists.length) return [[]]
        const [first, ...rest] = lists
        return first.flatMap(v => product(rest).map(combo => [v, ...combo]))
      }
      for (const combo of product(tokenLists)) {
        const kw = combo.join(' ').replace(/\s+/g, ' ').trim()
        if (kw && !INVALIDS.has(kw)) expanded.push({ keyword: kw, srcIdx: i })
      }
    } else {
      const kw = vals.join(' ').replace(/\s+/g, ' ').trim()
      if (kw && !INVALIDS.has(kw)) expanded.push({ keyword: kw, srcIdx: i })
    }
  }

  if (!expanded.length) return []

  // Aggregate by keyword
  type Agg = {
    count: number
    groupIds: Set<string>
    clicks28d: number
    qty: number
    salesValue: number
    currencies: Set<string>
    catValues: Record<string, string[]>
  }

  const agg = new Map<string, Agg>()

  for (const { keyword, srcIdx } of expanded) {
    const row = rows[srcIdx]
    const qty = qtyCol ? (toNumber(row[qtyCol]) || 0) : 0
    const clicks28d = clicksCol ? (toNumber(row[clicksCol]) || 0) : 0
    const priceAmt = priceCol ? toNumber(row[priceCol]) : NaN
    const currency = priceCcyCol ? String(row[priceCcyCol] ?? '') : (priceCol ? toCcy(row[priceCol]) : '')
    const salesValue = !isNaN(priceAmt) ? qty * priceAmt : 0
    const groupId = hasGroupId ? String(row['image_group_id'] ?? '') : ''

    if (!agg.has(keyword)) {
      agg.set(keyword, { count: 0, groupIds: new Set(), clicks28d: 0, qty: 0, salesValue: 0, currencies: new Set(), catValues: {} })
    }
    const a = agg.get(keyword)!
    a.count++
    if (groupId && !isBlank(groupId)) a.groupIds.add(groupId)
    a.clicks28d += clicks28d
    a.qty += qty
    a.salesValue += salesValue
    if (currency) a.currencies.add(currency)

    for (const cat of CATEGORY_COLS) {
      if (allCols.includes(cat)) {
        if (!a.catValues[cat]) a.catValues[cat] = []
        a.catValues[cat].push(String(row[cat] ?? ''))
      }
    }
  }

  const result: Row[] = [...agg.entries()].map(([keyword, a]) => {
    const uniqueGroups = hasGroupId ? a.groupIds.size : a.count
    const currencies = [...a.currencies].filter(Boolean)
    const salesCurrency = currencies.length === 1 ? currencies[0] : currencies.length > 1 ? 'MIXED' : '(unknown)'
    const totalSales = salesCurrency !== 'MIXED' && priceCol ? Math.round(a.salesValue) : NaN
    const row: Row = {
      keyword,
      'Product Count': String(a.count),
      'Unique Product Groups': String(uniqueGroups),
      'Clicks (28d)': String(Math.round(a.clicks28d)),
      'Clicks Monthly Est': String(Math.round(a.clicks28d * 30 / 28 * 100) / 100),
      'Total Quantity': String(Math.round(a.qty)),
      'Sales Currency': salesCurrency,
      'Total Sales Value': isNaN(totalSales) ? '' : String(totalSales),
    }
    for (const cat of CATEGORY_COLS) {
      if (a.catValues[cat]) row[cat] = categoryMode(a.catValues[cat])
    }
    return row
  })

  return result.sort((a, b) => {
    const pc = parseInt(b['Product Count']) - parseInt(a['Product Count'])
    if (pc !== 0) return pc
    const upg = parseInt(b['Unique Product Groups']) - parseInt(a['Unique Product Groups'])
    if (upg !== 0) return upg
    return a.keyword.localeCompare(b.keyword)
  })
}

export const KEYWORD_OUT_COLS = OUT_COLS
export { CATEGORY_COLS }
