import type { VercelRequest, VercelResponse } from '@vercel/node'
import crypto from 'node:crypto'
import { sendError } from '../api/_lib/handlerUtils'
import { fetchShopifyProducts, shopifyKeepMap } from '../api/_lib/core/shopifyFetcher'
import { countProducts } from '../api/_lib/core/feedProcessor'
import { preferredCategoryColumn } from '../api/_lib/core/categoryExtraction'
import { columnMeta } from '../api/_lib/handlerUtils'
import { getOrCreateSession, saveRows } from '../api/_lib/sessionStore'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { storeUrl } = req.body as { storeUrl: string }
    if (!storeUrl?.trim()) return res.status(400).json({ error: 'storeUrl is required' })

    const rows = await fetchShopifyProducts(storeUrl.trim())
    const cols = Object.keys(rows[0] ?? {})
    const keepMap = shopifyKeepMap(cols)
    const fileHash = crypto.createHash('md5').update(storeUrl).digest('hex')
    const displayName = storeUrl.replace(/https?:\/\//, '').replace(/\/$/, '')

    const sessionId = await getOrCreateSession(fileHash, displayName)
    const rawRef = await saveRows(sessionId, 'raw', rows)

    res.status(200).json({
      rawDfBlobUrl: rawRef,
      sessionId,
      columns: columnMeta(rows, keepMap),
      productCount: countProducts(rows),
      fileName: displayName,
      sheetName: null,
      sheets: null,
      fileHash,
      catSrcCol: preferredCategoryColumn(cols),
    })
  } catch (err) {
    sendError(res, err)
  }
}
