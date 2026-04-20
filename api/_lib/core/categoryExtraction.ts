import { norm } from './utils.js'

export function preferredCategoryColumn(columns: string[]): string | null {
  const gpc = columns.find(c => norm(c) === 'googleproductcategory')
  if (gpc) return gpc
  const pt = columns.find(c => norm(c) === 'producttype')
  if (pt) return pt
  const any = columns.find(c => norm(c).includes('category'))
  return any ?? columns[0] ?? null
}

export function extractCategories(
  rows: Record<string, string>[],
  srcCol: string,
  wantMain: boolean,
  wantPenultimate: boolean,
  wantFinal: boolean,
): Record<string, string>[] {
  return rows.map(row => {
    const parts = String(row[srcCol] ?? '').split(/\s*>\s*/).map(p => p.trim().toLowerCase()).filter(Boolean)
    const out = { ...row }
    if (wantMain) out['Main Category'] = parts[0] ?? ''
    if (wantPenultimate) out['Penultimate Category'] = parts.length > 1 ? parts[parts.length - 2] : (parts[0] ?? '')
    if (wantFinal) out['Final Category'] = parts[parts.length - 1] ?? ''
    return out
  })
}
