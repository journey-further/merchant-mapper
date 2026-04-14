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

  return url;
}
