import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sendError } from '../api/_lib/handlerUtils.js'
import { applyFilters } from '../api/_lib/core/feedProcessor.js'
import { groupCandidates, computeGroupStats, applyGrouping, feedLabelRollup, type GroupStats } from '../api/_lib/core/productGroups.js'
import { loadRows } from '../api/_lib/sessionStore.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { rawDfUrl, filters = {}, groupCol } = req.body as {
      rawDfUrl: string
      filters?: Record<string, string[]>
      groupCol?: string
    }

    let rows = await loadRows(rawDfUrl)
    if (Object.keys(filters).length) rows = applyFilters(rows, filters)

    const cols = Object.keys(rows[0] ?? {})
    const candidates = groupCandidates(cols)
    const stats = computeGroupStats(rows, candidates)

    const chosen = groupCol ?? candidates[0] ?? null
    const grouped = chosen ? applyGrouping(rows, chosen, stats) : rows
    const rollup = feedLabelRollup(grouped)

    res.status(200).json({
      candidates,
      groupCol: chosen,
      rollup,
      stats: Object.entries(stats).map(([column, s]) => { const gs = s as GroupStats; return { column, groupCount: gs.groupCount, skuCount: gs.skuCount } }),
    })
  } catch (err) {
    sendError(res, err)
  }
}
