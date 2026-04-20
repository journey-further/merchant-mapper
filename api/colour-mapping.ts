import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sendError } from '../api/_lib/handlerUtils'
import { applyColumnSelection, applyFilters } from '../api/_lib/core/feedProcessor'
import {
  loadBaseColourMap, mergeNewMappings, mappingBreakdown,
  unmappedColours, addSuggestions,
} from '../api/_lib/core/colourMapping'
import { loadRows } from '../api/_lib/sessionStore'
import { db, colourMappings } from '../api/_lib/db/index'
import { eq } from 'drizzle-orm'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'GET') {
      const baseMap = loadBaseColourMap()
      const rows = [...baseMap.entries()].map(([productColour, genericColour]) => ({
        productColour, genericColour,
      }))
      return res.status(200).json({ rows })
    }

    if (req.method === 'POST') {
      const { rawDfUrl, session: sessionId, keepMap, filters = {}, colourCol, overrides = [] } = req.body as {
        rawDfUrl: string
        session: string
        keepMap?: Record<string, boolean>
        filters?: Record<string, string[]>
        colourCol: string
        overrides?: { productColour: string; genericColour: string }[]
      }

      let rows = await loadRows(rawDfUrl)
      if (keepMap) rows = applyColumnSelection(rows, keepMap)
      if (Object.keys(filters).length) rows = applyFilters(rows, filters)

      const baseMap = loadBaseColourMap()

      // Persist overrides to Neon (colourMapping core uses snake_case keys internally)
      const overridesSnake = overrides.map(o => ({ product_colour: o.productColour, generic_colour: o.genericColour }))
      if (overridesSnake.length && sessionId) {
        await db.delete(colourMappings).where(eq(colourMappings.sessionId, sessionId))
        await db.insert(colourMappings).values(
          overridesSnake.map(o => ({ sessionId, productColour: o.product_colour, genericColour: o.generic_colour }))
        )
      }

      const updatedMap = mergeNewMappings(baseMap, overridesSnake)
      const bdRaw = mappingBreakdown(rows, colourCol, baseMap, updatedMap)
      const unmappedRaw = unmappedColours(rows, colourCol, updatedMap)
      const allowedGeneric = [...new Set([...updatedMap.values()])].sort()
      const withSuggestions = addSuggestions(unmappedRaw, allowedGeneric)

      return res.status(200).json({
        colourMapBlobUrl: '',
        breakdown: {
          currentlyMapped: bdRaw.currently_mapped,
          newlyMapped: bdRaw.newly_mapped,
          unmapped: bdRaw.unmapped,
          eligible: bdRaw.eligible,
          pctMapped: bdRaw.pct_mapped,
        },
        unmapped: withSuggestions.map(r => ({
          productColour: r.product_colour,
          suggestion: r.suggestion,
          productCount: r.count,
        })),
        allowedGeneric,
      })
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    sendError(res, err)
  }
}
