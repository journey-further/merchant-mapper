import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sendError, records } from '../api/_lib/handlerUtils.js'
import { loadRows } from '../api/_lib/sessionStore.js'
import { getProcessedRows } from '../api/_lib/pipeline.js'
import { makeKeywords } from '../api/_lib/core/keywordBuilder.js'
import { buildPresetCombos, type Combo } from '../api/_lib/presets.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { rawDfUrl, state = {}, combos: inCombos, presets } = req.body as {
      rawDfUrl: string
      state?: Record<string, unknown>
      combos?: Combo[]
      presets?: boolean
    }

    const raw = await loadRows(rawDfUrl)
    const processed = await getProcessedRows(raw, state as never)
    const allCols = Object.keys(processed[0] ?? {})

    let combos: Combo[] = inCombos ?? []
    if (presets) combos = buildPresetCombos(processed)

    const perListTables = combos.map((combo, i) => {
      const fields = (combo.fields ?? []).filter(f => allCols.includes(f))
      const table = makeKeywords(processed, fields, Boolean(combo.splitAmpersand))
      const listName = combo.name || `List ${i + 1}`
      const displayCols = Object.keys(table[0] ?? {}).filter(c => c !== 'Clicks Monthly Est')
      return { listName, rows: records(table), displayCols }
    })

    res.status(200).json({ combos, perListTables })
  } catch (err) {
    sendError(res, err)
  }
}
