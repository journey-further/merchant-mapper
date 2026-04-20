import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sendError } from '../api/_lib/handlerUtils.js'
import { applyColumnSelection, applyFilters } from '../api/_lib/core/feedProcessor.js'
import { detectColourColumns, colourSummary } from '../api/_lib/core/colourMapping.js'
import { loadRows } from '../api/_lib/sessionStore.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { rawDfUrl, keepMap, filters = {}, colourCol } = req.body as {
      rawDfUrl: string
      keepMap?: Record<string, boolean>
      filters?: Record<string, string[]>
      colourCol?: string
    }

    let rows = await loadRows(rawDfUrl)
    if (keepMap) rows = applyColumnSelection(rows, keepMap)
    if (Object.keys(filters).length) rows = applyFilters(rows, filters)

    const cols = Object.keys(rows[0] ?? {})
    const candidates = detectColourColumns(cols)
    const chosen = colourCol ?? candidates[0] ?? null

    const rawSummary = chosen ? colourSummary(rows, chosen) : []
    const nonEmpty = rawSummary.reduce((sum, r) => sum + r.count, 0)
    res.status(200).json({
      colourCandidates: candidates,
      colourCol: chosen ?? '',
      valueCounts: rawSummary.map(r => ({
        colour: r.value,
        productCount: r.count,
        pct: r.pct.toFixed(1) + '%',
      })),
      nonEmpty,
    })
  } catch (err) {
    sendError(res, err)
  }
}
