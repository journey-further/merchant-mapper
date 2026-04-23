import { useQuery } from '@tanstack/react-query';
import { downloadUrl, getGadsResults } from '../../lib/api';
import { useWorkflowStore } from '../../store/workflowStore';
import { buildWorkflowState } from '../../lib/workflow';
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
        <Button asChild size="sm" variant="outline">
          <a href={csvHref} download>Download CSV</a>
        </Button>
        <Button asChild size="sm" variant="outline" className="bg-[#F3F4F6] hover:bg-[#E5E7EB]">
          <a href={xlsxHref} download>Download XLSX</a>
        </Button>
      </div>
    </div>
  );
}

export default function GadsResults() {
  const store = useWorkflowStore();
  const { sessionId, rawDfBlobUrl, combinedDfBlobUrl, gadsDfBlobUrl } = store;

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
  const combinedReportReady = ready && !!rawDfBlobUrl;

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

  function combinedReportUrl() {
    if (!combinedReportReady) return '#';
    return downloadUrl({
      session: sessionId!,
      type: 'combined-report',
      format: 'xlsx',
      rawDfUrl: rawDfBlobUrl!,
      combinedDfUrl: combinedDfBlobUrl!,
      gadsDfBlobUrl: gadsDfBlobUrl!,
      state: JSON.stringify(buildWorkflowState(store)),
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
          <div className="rounded-md border p-4 space-y-5">
            <p className="text-sm font-semibold">Export your data</p>
            <Button asChild size="sm" disabled={!combinedReportReady}>
              <a href={combinedReportUrl()} download="combined-report.xlsx">
                Download Combined Spreadsheet
              </a>
            </Button>
            <p className="text-xs text-muted-foreground -mt-3">
              Single XLSX with Sales Opportunity, GAds Metrics, volume charts data, and normalised feed — all in one file.
            </p>
            <div className="border-t pt-4 flex flex-wrap gap-8">
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
