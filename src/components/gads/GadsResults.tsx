import { useQuery } from '@tanstack/react-query';
import { downloadUrl, getGadsResults } from '../../lib/api';
import { useWorkflowStore } from '../../store/workflowStore';
import SectionShell from '../shared/SectionShell';
import DataTable from '../shared/DataTable';
import { Button } from '../../ui/button';

function DownloadGroup({
  label,
  description,
  csvHref,
  xlsxHref,
}: {
  label: string;
  description: string;
  csvHref: string;
  xlsxHref: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs text-muted-foreground">{description}</p>
      <div className="flex gap-2 pt-0.5">
        <Button asChild size="sm">
          <a href={csvHref} download>Download CSV</a>
        </Button>
        <Button asChild size="sm" variant="outline">
          <a href={xlsxHref} download>Download XLSX</a>
        </Button>
      </div>
    </div>
  );
}

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

  const ready = !!combinedDfBlobUrl && !!gadsDfBlobUrl && !!sessionId;

  function dlUrl(type: string, format: 'csv' | 'xlsx') {
    if (!ready) return '#';
    return downloadUrl({
      session: sessionId!,
      type,
      format,
      combinedDfUrl: combinedDfBlobUrl!,
      gadsDfBlobUrl: gadsDfBlobUrl!,
    });
  }

  return (
    <SectionShell title="Google Ads Results" loading={query.isLoading} fetching={query.isFetching}>
      {!combinedDfBlobUrl || !gadsDfBlobUrl ? (
        <p className="text-sm text-muted-foreground">
          Build the combined keyword list and fetch Google Ads volumes to see joined results.
        </p>
      ) : query.error ? (
        <p className="text-sm text-destructive">Failed to build Google Ads results.</p>
      ) : query.data?.hasResults ? (
        <div className="space-y-6">
          {/* Summary + preview table */}
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {query.data.totalRows.toLocaleString()} joined rows,{' '}
              {query.data.keywordsWithVolume.toLocaleString()} with search volume
            </p>
            <DataTable rows={query.data.preview} maxHeight="360px" />
          </div>

          {/* Download CTAs */}
          <div className="rounded-md border p-4">
            <p className="mb-4 text-sm font-semibold">Export your data</p>
            <div className="flex flex-wrap gap-8">
              <DownloadGroup
                label="Keywords with GAds Metrics"
                description="One row per keyword per month — search volumes, competition, close variants."
                csvHref={dlUrl('gads-metrics', 'csv')}
                xlsxHref={dlUrl('gads-metrics', 'xlsx')}
              />
              <DownloadGroup
                label="Sales Opportunity Sheet"
                description="Aggregated view with Opportunity Score and Priority Score per keyword."
                csvHref={dlUrl('sales-opportunity', 'csv')}
                xlsxHref={dlUrl('sales-opportunity', 'xlsx')}
              />
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No Google Ads result rows were produced.</p>
      )}
    </SectionShell>
  );
}
