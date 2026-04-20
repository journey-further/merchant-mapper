import fs from 'node:fs'
import path from 'node:path'
import { norm, isBlank } from './utils'

export type ColourMap = Map<string, string> // normalised product_colour → generic_colour

export function loadBaseColourMap(): ColourMap {
  const csvPath = path.join(process.cwd(), 'api/_lib/colour_mapping.csv')
  const lines = fs.readFileSync(csvPath, 'utf8').split('\n').slice(1)
  const map: ColourMap = new Map()
  for (const line of lines) {
    const [raw, generic] = line.split(',')
    if (raw && generic) {
      map.set(raw.trim().toLowerCase(), generic.trim().toLowerCase())
    }
  }
  return map
}

export function detectColourColumns(columns: string[]): string[] {
  const targets = new Set(['genericcolour', 'productcolour', 'color', 'colour'])
  return columns.filter(c => targets.has(norm(c)))
}

export function applyColourMapping(
  rows: Record<string, string>[],
  colourCol: string,
  map: ColourMap,
): Record<string, string>[] {
  return rows.map(row => ({
    ...row,
    'Normalised Colour': map.get(String(row[colourCol] ?? '').toLowerCase().trim()) ?? '',
  }))
}

export function unmappedColours(
  rows: Record<string, string>[],
  colourCol: string,
  map: ColourMap,
): { product_colour: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const raw = String(row[colourCol] ?? '').toLowerCase().trim()
    if (!isBlank(raw) && !map.has(raw)) {
      counts.set(raw, (counts.get(raw) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([product_colour, count]) => ({ product_colour, count }))
    .sort((a, b) => b.count - a.count)
}

export function colourSummary(
  rows: Record<string, string>[],
  colourCol: string,
): { value: string; count: number; pct: number }[] {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const v = String(row[colourCol] ?? '').trim()
    if (!isBlank(v)) counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  const total = rows.length
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([value, count]) => ({ value, count, pct: total ? (count / total) * 100 : 0 }))
}

export function mappingBreakdown(
  rows: Record<string, string>[],
  colourCol: string,
  baseMap: ColourMap,
  updatedMap: ColourMap,
) {
  let currentlyMapped = 0, newlyMapped = 0, unmapped = 0, eligible = 0
  for (const row of rows) {
    const raw = String(row[colourCol] ?? '').toLowerCase().trim()
    if (isBlank(raw)) continue
    eligible++
    const wasIn = baseMap.has(raw)
    const isIn = updatedMap.has(raw)
    if (wasIn) currentlyMapped++
    else if (isIn) newlyMapped++
    else unmapped++
  }
  return {
    currently_mapped: currentlyMapped,
    newly_mapped: newlyMapped,
    unmapped,
    eligible,
    pct_mapped: eligible ? ((currentlyMapped + newlyMapped) / eligible) * 100 : 0,
  }
}

export function mergeNewMappings(base: ColourMap, newRows: { product_colour: string; generic_colour: string }[]): ColourMap {
  const merged = new Map(base)
  for (const { product_colour, generic_colour } of newRows) {
    merged.set(product_colour.toLowerCase().trim(), generic_colour.toLowerCase().trim())
  }
  return merged
}

export function addSuggestions(
  unmapped: { product_colour: string; count: number }[],
  genericColours: string[],
): ({ product_colour: string; count: number; suggestion: string })[] {
  const genericsNorm = genericColours.map(g => ({ raw: g, norm: norm(g) }))
  return unmapped.map(item => {
    const words = item.product_colour.split(/\s+/)
    let suggestion = ''
    for (const word of words) {
      const wn = norm(word)
      const match = genericsNorm.find(g => g.norm === wn || g.norm.includes(wn))
      if (match) { suggestion = match.raw; break }
    }
    return { ...item, suggestion }
  })
}
