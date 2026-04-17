import { useRef, useState } from 'react';
import { Button } from '../../ui/button';
import { uploadFileToBlob } from '../../lib/blobUpload';
import { parseFeed } from '../../lib/api';
import { useWorkflowStore } from '../../store/workflowStore';
import { v4 as uuidv4 } from 'uuid';

export default function UploadDropzone() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'parsing' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const { setSession } = useWorkflowStore();

  async function handleFile(file: File) {
    setStatus('uploading');
    setErrorMsg('');
    try {
      const blobUrl = await uploadFileToBlob(file);
      setStatus('parsing');
      const sessionId = uuidv4();
      const result = await parseFeed({
        session: sessionId,
        blobUrl,
        filename: file.name,
      });
      setSession({
        sessionId,
        fileHash: result.fileHash,
        fileName: result.fileName,
        sheetName: result.sheetName,
        rawDfBlobUrl: result.rawDfBlobUrl,
        columns: result.columns,
        keepMap: Object.fromEntries(result.columns.map((c) => [c.column, c.keep])),
        productCount: result.productCount,
        catSrcCol: result.catSrcCol,
      });
      setStatus('idle');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Upload failed');
      setStatus('error');
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  const busy = status === 'uploading' || status === 'parsing';

  return (
    <div
      className="rounded-lg border-2 border-dashed border-muted-foreground/30 p-10 text-center hover:border-muted-foreground/60 transition-colors"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <p className="mb-1 text-sm font-medium">Upload a feed file</p>
      <p className="mb-4 text-xs text-muted-foreground">TSV, CSV, Excel, or ZIP — up to 100 MB</p>

      <Button
        variant="outline"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? (status === 'uploading' ? 'Uploading…' : 'Parsing…') : 'Choose file'}
      </Button>

      <input
        ref={inputRef}
        type="file"
        accept=".tsv,.txt,.csv,.xlsx,.xls,.zip"
        className="hidden"
        onChange={onInputChange}
      />

      {status === 'error' && (
        <p className="mt-3 text-sm text-destructive">{errorMsg}</p>
      )}
    </div>
  );
}
