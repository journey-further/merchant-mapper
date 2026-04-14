import { useState } from 'react';
import { Button } from '@journey-further/salient-ui/ui/button';
import { downloadUrl, finaliseKeywords } from '../../lib/api';
import { buildWorkflowState } from '../../lib/workflow';
import { useWorkflowStore } from '../../store/workflowStore';
import SectionShell from '../shared/SectionShell';
import DataTable from '../shared/DataTable';

export default function KeywordCombined() {
  const store = useWorkflowStore();
  const {
    sessionId,
    rawDfBlobUrl,
    colourMapBlobUrl,
    combos,
    combinedDfBlobUrl,
    setCombinedDfBlobUrl,
  } = store;
  const state = buildWorkflowState(store);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Awaited<ReturnType<typeof finaliseKeywords>> | null>(null);

  async function buildCombined() {
    if (!sessionId || !rawDfBlobUrl) return;
    setLoading(true);
    setError('');
    try {
      const response = await finaliseKeywords({
        session: sessionId,
        rawDfUrl: rawDfBlobUrl,
        colourMapBlobUrl: colourMapBlobUrl ?? undefined,
        state,
        combos,
      });
      setResult(response);
      setCombinedDfBlobUrl(response.combinedDfBlobUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to build the combined keyword list');
    } finally {
      setLoading(false);
    }
  }

  const csvHref = combinedDfBlobUrl && sessionId
    ? downloadUrl({
        session: sessionId,
        type: 'keywords-combined',
        format: 'csv',
        combinedDfUrl: combinedDfBlobUrl,
      })
    : '#';

  const xlsxHref = combinedDfBlobUrl && sessionId
    ? downloadUrl({
        session: sessionId,
        type: 'keywords-combined',
        format: 'xlsx',
        combinedDfUrl: combinedDfBlobUrl,
      })
    : '#';

  return (
    <SectionShell title="Combined Keyword List">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" onClick={() => void buildCombined()} disabled={loading}>
            {loading ? 'Building…' : 'Build combined list'}
          </Button>

          {combinedDfBlobUrl && (
            <>
              <Button asChild size="sm" variant="outline">
                <a href={csvHref}>Download CSV</a>
              </Button>
              <Button asChild size="sm" variant="outline">
                <a href={xlsxHref}>Download XLSX</a>
              </Button>
            </>
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {result && (
          <>
            <p className="text-sm text-muted-foreground">
              {result.totalKeywords.toLocaleString()} keyword rows generated.
            </p>
            <DataTable rows={result.preview} maxHeight="320px" />
          </>
        )}
      </div>
    </SectionShell>
  );
}
