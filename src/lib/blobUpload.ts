import { upload } from '@vercel/blob/client'

/**
 * Upload a feed file directly from the browser to Vercel Blob storage.
 *
 * Uses @vercel/blob/client `upload()` which:
 *   1. Calls /api/blob-token to get a short-lived client upload token.
 *   2. Uploads the file directly to Vercel Blob — the file never passes through
 *      a serverless function, so there is no 4.5 MB body-size limit.
 *   3. Uses multipart upload automatically for large files.
 *
 * Returns the blob's downloadUrl (a time-limited signed URL suitable for
 * passing to /api/parse).
 */
export async function uploadFileToBlob(file: File): Promise<string> {
  const blob = await upload(`mm/uploads/${file.name}`, file, {
    access: 'private',
    handleUploadUrl: '/api/blob-token',
    multipart: true,
  })
  return blob.downloadUrl ?? blob.url
}
