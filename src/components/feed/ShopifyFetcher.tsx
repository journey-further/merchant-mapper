import { useRef, useState } from 'react';
import { Button } from '../../ui/button';
import { fetchShopifyFeed } from '../../lib/api';
import { useWorkflowStore } from '../../store/workflowStore';

type Status = 'idle' | 'fetching' | 'error';

export default function ShopifyFetcher() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const { setSession, setFeedSource } = useWorkflowStore();

  async function handleFetch() {
    const raw = inputRef.current?.value?.trim() ?? '';
    if (!raw) return;

    setStatus('fetching');
    setErrorMsg('');

    // Persist the URL before fetching so it's available if the user re-loads
    setFeedSource('shopify', raw);

    try {
      const result = await fetchShopifyFeed({ storeUrl: raw });
      setSession({
        sessionId: result.sessionId,
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
      const msg = e instanceof Error ? e.message : 'Failed to fetch catalogue';
      setErrorMsg(msg);
      setStatus('error');
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleFetch();
  }

  const busy = status === 'fetching';

  return (
    <div className="rounded-lg border-2 border-dashed border-muted-foreground/30 p-10">
      <p className="mb-1 text-sm font-medium text-center">Enter your Shopify store URL</p>
      <p className="mb-6 text-xs text-muted-foreground text-center">
        Works with any public Shopify store — the product catalogue is fetched from{' '}
        <span className="font-mono">/products.json</span>
      </p>

      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="url"
          placeholder="https://www.example.com"
          disabled={busy}
          onKeyDown={onKeyDown}
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
        <Button variant="outline" disabled={busy} onClick={handleFetch}>
          {busy ? 'Fetching…' : 'Fetch catalogue'}
        </Button>
      </div>

      {status === 'error' && (
        <p className="mt-3 text-sm text-destructive text-center">{errorMsg}</p>
      )}
    </div>
  );
}
