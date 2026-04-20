import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sendError } from '../api/_lib/handlerUtils'
import { applyColumnSelection, applyFilters } from '../api/_lib/core/feedProcessor'
import { extractCategories, preferredCategoryColumn } from '../api/_lib/core/categoryExtraction'
import { loadRows } from '../api/_lib/sessionStore'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { rawDfUrl, keepMap, filters = {}, catSrcCol, wantMain, wantPenultimate, wantFinal } = req.body as {
      rawDfUrl: string
      keepMap?: Record<string, boolean>
      filters?: Record<string, string[]>
      catSrcCol?: string
      wantMain?: boolean
      wantPenultimate?: boolean
      wantFinal?: boolean
    }

    let rows = await loadRows(rawDfUrl)
    if (keepMap) rows = applyColumnSelection(rows, keepMap)
    if (Object.keys(filters).length) rows = applyFilters(rows, filters)

    const cols = Object.keys(rows[0] ?? {})
    const srcCol = catSrcCol ?? preferredCategoryColumn(cols) ?? cols[0]

    const w = { wantMain: wantMain ?? false, wantPenultimate: wantPenultimate ?? false, wantFinal: wantFinal ?? false }
    const selectedCols: string[] = [
      ...(w.wantMain        ? ['Main Category']        : []),
      ...(w.wantPenultimate ? ['Penultimate Category'] : []),
      ...(w.wantFinal       ? ['Final Category']       : []),
    ]

    let preview: Record<string, string>[] = []

    if (selectedCols.length) {
      // One or more segments selected — show source value + extracted columns,
      // deduplicated by source path and sorted alphabetically.
      const extracted = extractCategories(rows, srcCol, w.wantMain, w.wantPenultimate, w.wantFinal)
      const seen = new Set<string>()
      for (const row of extracted) {
        const srcVal = String(row[srcCol] ?? '')
        if (seen.has(srcVal)) continue
        seen.add(srcVal)
        const entry: Record<string, string> = { [srcCol]: srcVal }
        for (const col of selectedCols) entry[col] = String(row[col] ?? '')
        preview.push(entry)
      }
      preview.sort((a, b) => String(a[srcCol]).localeCompare(String(b[srcCol])))
    } else {
      // No segments selected — show unique source values with product counts so
      // the user can see what's in the column before deciding what to extract.
      const counts = new Map<string, number>()
      for (const row of rows) {
        const v = String(row[srcCol] ?? '')
        counts.set(v, (counts.get(v) ?? 0) + 1)
      }
      preview = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([value, count]) => ({ [srcCol]: value, 'Product Count': String(count) }))
    }

    // Cap at 500 rows to keep the table manageable
    if (preview.length > 500) preview = preview.slice(0, 500)

    res.status(200).json({
      preview,
      allCols: cols,
      catSrcCol: srcCol,
    })
  } catch (err) {
    sendError(res, err)
  }
}
