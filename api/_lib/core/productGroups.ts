import { norm, toNumber, toCcy, fmtInt, fmtQty, fmtSales, INVALIDS, isBlank } from './utils.js'
import type { Row } from './feedProcessor.js'

const URL_RE = /https?:\/\/[^\s,]+/i

function firstUrl(v: string): string {
  const m = v.match(URL_RE)
  return m ? m[0].trim() : ''
}

function findCol(columns: string[], target: string): string | null {
  return columns.find(c => norm(c) === norm(target)) ?? null
}

export function groupCandidates(columns: string[]): string[] {
  const groupIdCol = findCol(columns, 'item group id')
  const imgCol = findCol(columns, 'image link') ?? findCol(columns, 'image_link')
  const addCol = findCol(columns, 'additional image link') ?? findCol(columns, 'additional_image_link')
  const cands: string[] = []
  if (groupIdCol) cands.push(groupIdCol)
  if (imgCol && !cands.includes(imgCol)) cands.push(imgCol)
  if (addCol && !cands.includes(addCol)) cands.push(addCol)
  return cands
}

export interface GroupStats {
  keys: string[]
  hasKey: boolean[]
  groupCount: number
  skuCount: number
}

export function computeGroupStats(rows: Row[], candidates: string[]): Record<string, GroupStats> {
  if (!rows.length) return {}
  const columns = Object.keys(rows[0])
  const groupIdCol = findCol(columns, 'item group id')
  const stats: Record<string, GroupStats> = {}

  for (const col of candidates) {
    const isGroupId = col === groupIdCol
    const keys = rows.map(row => {
      const raw = String(row[col] ?? '').trim()
      return isGroupId ? raw : firstUrl(raw)
    })
    const hasKey = keys.map(k => !isBlank(k))
    const distinctKeys = new Set(keys.filter((k, i) => hasKey[i]))
    stats[col] = {
      keys,
      hasKey,
      groupCount: distinctKeys.size,
      skuCount: hasKey.filter(Boolean).length,
    }
  }
  return stats
}

export function applyGrouping(rows: Row[], groupCol: string, stats: Record<string, GroupStats>): Row[] {
  const { keys, hasKey } = stats[groupCol]
  const factorMap = new Map<string, number>()
  let next = 1
  return rows.map((row, i) => {
    if (!hasKey[i]) return { ...row, image_group_id: '' }
    const key = keys[i]
    if (!factorMap.has(key)) factorMap.set(key, next++)
    return { ...row, image_group_id: String(factorMap.get(key)) }
  })
}

export function feedLabelRollup(rows: Row[]): Record<string, string>[] {
  if (!rows.length) return []
  const columns = Object.keys(rows[0])
  const feedLabelCol = findCol(columns, 'feed label')
  const priceCol = findCol(columns, 'price')
  const qtyCol = findCol(columns, 'quantity') ?? findCol(columns, 'qauntity') ?? findCol(columns, 'sell on google quantity')

  type Bucket = { skuRows: number; groups: Set<string>; totalQty: number; totalSales: number; currency: string }
  const buckets = new Map<string, Bucket>()

  for (const row of rows) {
    const feedLabel = feedLabelCol ? (String(row[feedLabelCol] ?? '').trim() || '(blank)') : '(all)'
    const currency = priceCol ? (toCcy(row[priceCol]) || '(unknown)') : '(unknown)'
    const key = `${feedLabel}||${currency}`
    const qty = qtyCol ? (toNumber(row[qtyCol]) || 0) : 0
    const priceAmt = priceCol ? (toNumber(row[priceCol]) || 0) : 0
    const groupId = row['image_group_id'] ?? ''

    if (!buckets.has(key)) {
      buckets.set(key, { skuRows: 0, groups: new Set(), totalQty: 0, totalSales: 0, currency })
    }
    const b = buckets.get(key)!
    b.skuRows++
    if (groupId && !isBlank(groupId)) b.groups.add(groupId)
    b.totalQty += qty
    b.totalSales += priceAmt * qty
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, b]) => {
      const [feedLabel, currency] = key.split('||')
      const row: Record<string, string> = {
        'Feed Label': feedLabel,
        'SKU Rows': fmtInt(b.skuRows),
        'Product Groups': fmtInt(b.groups.size),
        'Total Quantity': fmtQty(b.totalQty),
      }
      if (priceCol) {
        row['Currency'] = b.currency
        row['Total Sales Value'] = fmtSales(b.totalSales, b.currency)
      }
      return row
    })
}
