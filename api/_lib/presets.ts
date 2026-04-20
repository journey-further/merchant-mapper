import { INVALIDS } from './core/utils.js'
import type { Row } from './core/feedProcessor.js'

export interface Combo {
  name: string
  fields: string[]
  splitAmpersand: boolean
}

export function buildPresetCombos(rows: Row[]): Combo[] {
  if (!rows.length) return [{ name: '', fields: [], splitAmpersand: false }]
  const cols = Object.keys(rows[0])
  const colSet = new Set(cols)
  const colLower = Object.fromEntries(cols.map(c => [c.toLowerCase(), c]))
  const materialCol = colLower['material'] ?? null

  const presets: Array<{ name: string; fields: string[]; splitAmpersand: boolean }> = [
    { name: 'Gender + Category', fields: ['Age Gender Segment', 'Final Category'], splitAmpersand: true },
    { name: 'Gender + Colour + Category', fields: ['Age Gender Segment', 'Normalised Colour', 'Final Category'], splitAmpersand: true },
    { name: 'Material + Category', fields: ['__material__', 'Final Category'], splitAmpersand: true },
    { name: 'Colour + Material + Category', fields: ['Normalised Colour', '__material__', 'Final Category'], splitAmpersand: true },
  ]

  const combos: Combo[] = []
  for (const preset of presets) {
    const fields = preset.fields.map(f => f === '__material__' ? (materialCol ?? '') : f)
    if (!fields.every(f => f && colSet.has(f))) continue
    const hasValidRow = rows.some(row =>
      fields.every(f => {
        const v = String(row[f] ?? '').trim().toLowerCase()
        return !INVALIDS.has(v)
      })
    )
    if (!hasValidRow) continue
    combos.push({ name: preset.name, fields, splitAmpersand: preset.splitAmpersand })
  }

  return combos.length ? combos : [{ name: '', fields: [], splitAmpersand: false }]
}
