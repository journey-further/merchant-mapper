import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sendError } from '../api/_lib/handlerUtils'
import { applyColumnSelection, defaultKeepMap, countProducts } from '../api/_lib/core/feedProcessor'
import { columnMeta, clicksSortedPreview } from '../api/_lib/handlerUtils'
import { loadRows } from '../api/_lib/sessionStore'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { rawDfUrl, keepMap: inKeepMap, action } = req.body as {
      rawDfUrl: string
      keepMap?: Record<string, boolean>
      action?: 'recommended' | 'all' | 'none' | 'invert'
    }

    const rows = await loadRows(rawDfUrl)
    const cols = Object.keys(rows[0] ?? {})
    let keepMap = inKeepMap ?? defaultKeepMap(cols)

    if (action === 'recommended') keepMap = defaultKeepMap(cols)
    else if (action === 'all') keepMap = Object.fromEntries(cols.map(c => [c, true]))
    else if (action === 'none') keepMap = Object.fromEntries(cols.map(c => [c, false]))
    else if (action === 'invert') keepMap = Object.fromEntries(cols.map(c => [c, !keepMap[c]]))

    const preview = clicksSortedPreview(applyColumnSelection(rows, keepMap))

    res.status(200).json({
      keepMap,
      columns: columnMeta(rows, keepMap),
      preview,
      rowCount: rows.length,
      colCount: cols.filter(c => keepMap[c]).length,
    })
  } catch (err) {
    sendError(res, err)
  }
}
