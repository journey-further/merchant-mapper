import { norm, toNumber, toCcy, isBlank, INVALIDS } from './utils.js'

export type Row = Record<string, string>

// --- Column finders ---

function findCol(columns: string[], targets: string[]): string | null {
  for (const t of targets) {
    const found = columns.find(c => norm(c) === t)
    if (found) return found
  }
  return null
}

export function findClicksCol(columns: string[]): string | null {
  return findCol(columns, ['allclicks', 'all_clicks', '28dayclicks', 'clicks'])
}

// --- Segment derivation ---

export function deriveAgeGenderSegment(rows: Row[]): Row[] {
  if (!rows.length) return rows
  const cols = Object.keys(rows[0])
  const genderCol = findCol(cols, ['gender', 'sex', 'targetgender', 'productgender'])
  const ageCol = findCol(cols, ['agegroup', 'age', 'targetage', 'agerange'])
  if (!genderCol && !ageCol) return rows

  return rows.map(row => {
    const gender = String(row[genderCol ?? ''] ?? '').toLowerCase().trim()
    const age = String(row[ageCol ?? ''] ?? '').toLowerCase().trim()
    let segment = ''
    if (age === 'kids' || age === 'children') {
      if (gender === 'male') segment = 'boys'
      else if (gender === 'female') segment = 'girls'
      else segment = 'childrens'
    } else if (gender === 'male') {
      segment = 'mens'
    } else if (gender === 'female') {
      segment = 'womens'
    } else if (gender === 'unisex') {
      segment = 'unisex'
    }
    // Always add the key so the column appears consistently in column metadata
    return { ...row, 'Age Gender Segment': segment }
  })
}

// --- Column selection ---

const RECOMMENDED_RAW = [
  'title', 'availability', 'price', 'brand', 'gtin', 'mpn', 'condition',
  'language', 'agegroup', 'producttype', 'gender', 'color', 'imagelink',
  'additionalimagelink', 'feedlabel', 'itemgroupid', 'quantity',
  'googleproductcategory', 'agegendersegment', 'allclicks', 'material',
]

export function defaultKeepMap(columns: string[]): Record<string, boolean> {
  const recommended = columns.filter(c => RECOMMENDED_RAW.includes(norm(c)))
  if (!recommended.length) return Object.fromEntries(columns.map(c => [c, true]))
  return Object.fromEntries(columns.map(c => [c, RECOMMENDED_RAW.includes(norm(c))]))
}

export function applyColumnSelection(rows: Row[], keepMap: Record<string, boolean>): Row[] {
  const kept = Object.keys(keepMap).filter(k => keepMap[k])
  return rows.map(row => Object.fromEntries(kept.map(k => [k, row[k] ?? ''])))
}

// --- Filters ---

export function filterOptions(rows: Row[], maxUnique = 200, exclude: Set<string> = new Set()): Record<string, string[]> {
  if (!rows.length) return {}
  const cols = Object.keys(rows[0])
  const result: Record<string, string[]> = {}
  for (const col of cols) {
    if (exclude.has(col)) continue
    const vals = new Set<string>()
    for (const row of rows) {
      const v = String(row[col] ?? '').trim()
      if (!isBlank(v)) vals.add(v)
    }
    if (vals.size >= 2 && vals.size <= maxUnique) {
      result[col] = [...vals].sort()
    }
  }
  return result
}

export function applyFilters(rows: Row[], filters: Record<string, string[]>): Row[] {
  return rows.filter(row =>
    Object.entries(filters).every(([col, vals]) => vals.includes(row[col] ?? ''))
  )
}

// --- Numeric filters ---

export function numericFilterOptions(rows: Row[]): Record<string, { min: number; max: number; type: string }> {
  if (!rows.length) return {}
  const cols = Object.keys(rows[0])
  const priceCols = cols.filter(c => norm(c).includes('price'))
  const clicksCols = cols.filter(c => ['allclicks', '28dayclicks', 'clicks'].includes(norm(c)))
  const result: Record<string, { min: number; max: number; type: string }> = {}

  for (const col of [...priceCols, ...clicksCols]) {
    const nums = rows.map(r => toNumber(r[col])).filter(n => !isNaN(n))
    if (!nums.length) continue
    result[col] = {
      min: Math.min(...nums),
      max: Math.max(...nums),
      type: priceCols.includes(col) ? 'price' : 'numeric',
    }
  }
  return result
}

export function applyNumericFilters(
  rows: Row[],
  numericFilters: Record<string, { gte?: number; lte?: number }>,
): Row[] {
  return rows.filter(row =>
    Object.entries(numericFilters).every(([col, { gte, lte }]) => {
      const n = toNumber(row[col])
      if (isNaN(n)) return true
      if (gte !== undefined && n < gte) return false
      if (lte !== undefined && n > lte) return false
      return true
    })
  )
}

// --- Price column splitting ---

const CCY_RE = /\b([A-Z]{3})\b/

export function splitPriceColumns(rows: Row[]): Row[] {
  if (!rows.length) return rows
  const cols = Object.keys(rows[0])
  const priceCols = cols.filter(c => norm(c).includes('price') || norm(c) === 'saleprice')

  // Detect which price cols contain embedded currency codes
  const colsToSplit = priceCols.filter(col =>
    rows.some(row => CCY_RE.test(String(row[col] ?? '')))
  )
  if (!colsToSplit.length) return rows

  return rows.map(row => {
    const out: Row = {}
    for (const col of cols) {
      out[col] = row[col] ?? ''
      if (colsToSplit.includes(col)) {
        const raw = String(row[col] ?? '')
        out[col] = String(toNumber(raw) || '')
        out[`${col}_currency`] = toCcy(raw)
      }
    }
    return out
  })
}

// --- Product count ---

export function countProducts(rows: Row[]): number {
  if (!rows.length) return 0
  const cols = Object.keys(rows[0])
  const idCol = findCol(cols, ['id', 'itemid', 'item_id', 'offerid', 'offer_id', 'productid'])
  if (!idCol) return rows.length
  return new Set(rows.map(r => r[idCol])).size
}
