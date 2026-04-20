import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'

/**
 * Client-upload handshake endpoint.
 *
 * The browser-side @vercel/blob/client `upload()` function calls this route
 * twice:
 *   1. POST { type: 'blob.generate-client-token', payload: { pathname, ... } }
 *      → we validate and return a short-lived client token.
 *   2. POST { type: 'blob.upload-completed', payload: { blob, tokenPayload } }
 *      → Vercel Blob calls this after the direct upload succeeds (no-op for us).
 *
 * This completely bypasses the 4.5 MB Vercel function body limit because the
 * file data goes directly from the browser to Vercel Blob storage — it never
 * passes through this function.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const response = await handleUpload({
      body: req.body as HandleUploadBody,
      request: req,
      onBeforeGenerateToken: async (_pathname) => ({
        // Allow all feed file types
        allowedContentTypes: [
          'text/plain',
          'text/csv',
          'text/tab-separated-values',
          'application/octet-stream',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/zip',
        ],
        maximumSizeInBytes: 200 * 1024 * 1024, // 200 MB
        addRandomSuffix: true,
      }),
      onUploadCompleted: async () => {
        // No server-side bookkeeping needed — the client receives the blob URL
        // directly from Vercel Blob after the upload completes.
      },
    })
    res.status(200).json(response)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(400).json({ error: msg })
  }
}
