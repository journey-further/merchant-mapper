import { useQuery } from '@tanstack/react-query';
import { downloadUrl, getGadsResults } from '../../lib/api';
import { useWorkflowStore } from '../../store/workflowStore';
import SectionShell from '../shared/SectionShell';
import DataTable from '../shared/DataTable';
import { Button } from '@journey-further/salient-ui/ui/button';

export default function GadsResults() {
  const { sessionId, combinedDfBlobUrl, gadsDfBlobUrl } = useWorkflowStore();

  const query = useQuery({
    queryKey: ['gads-results', sessionId, combinedDfBlobUrl, gadsDfBlobUrl],
    queryFn: () =>
      getGadsResults({
        session: sessionId!,
        combinedDfBlobUrl: combinedDfBlobUrl!,
        gadsDfBlobUrl: gadsDfBlobUrl!,
      }),
    enabled: !!sessionId && !!combinedDfBlobUrl && !!gadsDfBlobUrl,
  });

  const csvHref = combinedDfBlobUrl && gadsDfBlobUrl && sessionId
    ? downloadUrl({
        session: sessionId,
        type: 'gads-metrics',
        format: 'csv',
        combinedDfUrl: combinedDfBlobUrl,
        gadsDfBlobUrl,
      })
    : '#';

  const xlsxHref = combinedDfBlobUrl && gadsDfBlobUrl && sessionId
    ? downloadUrl({
        session: sessionId,
        type: 'gads-metrics',
        format: 'xlsx',
        combinedDfUrl: combinedDfBlobUrl,
        gadsDfBlobUrl,
      })
    : '#';

  return (
    <SectionShell title="Google Ads Results" loading={query.isLoading}>
      {!combinedDfBlobUrl || !gadsDfBlobUrl ? (
        <p className="text-sm text-muted-foreground">
          Build the combined keyword list and upload a Google Ads metrics export to see joined results.
        </p>
      ) : query.error ? (
        <p className="text-sm text-destructive">Failed to build Google Ads results.</p>
      ) : query.data?.hasResults ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-muted-foreground">
              {query.data.totalRows.toLocaleString()} joined rows, {query.data.keywordsWithVolume.toLocaleString()} with search volume
            </p>
            <Button asChild size="sm" variant="outline">
              <a href={csvHref}>Download CSV</a>
            </Button>
            <Button asChild size="sm" variant="outline">
              <a href={xlsxHref}>Download XLSX</a>
            </Button>
          </div>
          <DataTable rows={query.data.preview} maxHeight="360px" />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No Google Ads result rows were produced.</p>
      )}
    </SectionShell>
  );
}
