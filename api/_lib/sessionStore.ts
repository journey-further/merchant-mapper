import { put } from '@vercel/blob'
import { db, sessions, sessionBlobs } from './db/index.js'
import { eq, and } from 'drizzle-orm'
import type { Row } from './core/feedProcessor.js'

export type BlobType = 'raw' | 'combined' | 'gads'

function blobToken(): string {
  const token = process.env.BLOB_READ_WRITE_TOKEN ?? ''
  if (!token) throw new Error('BLOB_READ_WRITE_TOKEN is not set')
  return token
}

export async function getOrCreateSession(fileHash: string, filename: string): Promise<string> {
  const existing = await db.select().from(sessions).where(eq(sessions.fileHash, fileHash)).limit(1)
  if (existing.length) return existing[0].id

  const inserted = await db.insert(sessions).values({ fileHash, filename }).returning()
  return inserted[0].id
}

export async function saveRows(sessionId: string, type: BlobType, rows: Row[]): Promise<string> {
  // Store rows as JSON in Vercel Blob — avoids Neon's 64MB HTTP request limit
  const json = JSON.stringify(rows)
  const blob = await put(`mm/sessions/${sessionId}/${type}.json`, json, {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
    token: blobToken(),
  })

  // Store only the blob URL reference in Neon (tiny)
  await db
    .insert(sessionBlobs)
    .values({ sessionId, resultType: type, data: { blobUrl: blob.url } })
    .onConflictDoUpdate({
      target: [sessionBlobs.sessionId, sessionBlobs.resultType],
      set: { data: { blobUrl: blob.url }, updatedAt: new Date() },
    })

  return `neon:${sessionId}:${type}`
}

export async function loadRows(ref: string): Promise<Row[]> {
  const [, sessionId, type] = ref.split(':')
  const result = await db
    .select()
    .from(sessionBlobs)
    .where(and(eq(sessionBlobs.sessionId, sessionId), eq(sessionBlobs.resultType, type as BlobType)))
    .limit(1)

  if (!result.length) throw new Error(`No session blob found for ${ref}`)

  const { blobUrl } = result[0].data as { blobUrl: string }

  // Fetch the private blob with the read/write token
  const resp = await fetch(blobUrl, {
    headers: { Authorization: `Bearer ${blobToken()}` },
  })
  if (!resp.ok) throw new Error(`Failed to fetch blob: ${resp.status}`)

  return resp.json() as Promise<Row[]>
}
