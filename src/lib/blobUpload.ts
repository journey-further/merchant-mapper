import { getBlobUploadToken } from './api';

export async function uploadFileToBlob(file: File): Promise<string> {
  const { uploadUrl, url } = await getBlobUploadToken(file.name, file.type || 'application/octet-stream');

  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });

  if (!res.ok) {
    throw new Error(`Blob upload failed: ${res.status} ${res.statusText}`);
  }

  // Vercel relay returns {url} in the response body; dev server returns empty 200.
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    const data = await res.json() as { url?: string };
    if (data.url) return data.url;
  }

  return url;
}
