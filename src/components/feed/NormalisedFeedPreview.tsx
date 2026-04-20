import { useQuery } from '@tanstack/react-query';
import { Button } from '../../ui/button';
import { downloadUrl, getNormalisedFeed } from '../../lib/api';
import { buildWorkflowState } from '../../lib/workflow';
import { useWorkflowStore } from '../../store/workflowStore';
import SectionShell from '../shared/SectionShell';
import DataTable from '../shared/DataTable';

interface Props {
  onNext?: () => void;
}

export default function NormalisedFeedPreview({ onNext }: Props) {
  const store = useWorkflowStore();
  const { sessionId, rawDfBlobUrl, colourMapBlobUrl } = store;
  const state = buildWorkflowState(store);

  const query = useQuery({
    queryKey: ['normalised-feed', sessionId, rawDfBlobUrl, colourMapBlobUrl, state],
    queryFn: () =>
      getNormalisedFeed({
        session: sessionId!,
        rawDfUrl: rawDfBlobUrl!,
        colourMapBlobUrl: colourMapBlobUrl ?? undefined,
        state,
      }),
    enabled: !!sessionId && !!rawDfBlobUrl,
  });

  const csvHref = sessionId && rawDfBlobUrl
    ? downloadUrl({
        session: sessionId,
        type: 'normalised',
        format: 'csv',
        rawDfUrl: rawDfBlobUrl,
        colourMapBlobUrl: colourMapBlobUrl ?? undefined,
        state: JSON.stringify(state),
      })
    : '#';

  const xlsxHref = sessionId && rawDfBlobUrl
    ? downloadUrl({
        session: sessionId,
        type: 'normalised',
        format: 'xlsx',
        rawDfUrl: rawDfBlobUrl,
        colourMapBlobUrl: colourMapBlobUrl ?? undefined,
        state: JSON.stringify(state),
      })
    : '#';

  return (
    <SectionShell title="Normalised Feed" loading={query.isLoading} fetching={query.isFetching}>
      {query.error && <p className="text-sm text-destructive">Failed to build the normalised feed.</p>}

      {query.data && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-muted-foreground">
              {query.data.rowCount.toLocaleString()} rows, {query.data.colCount.toLocaleString()} columns
            </p>
            <Button asChild size="sm" variant="outline">
              <a href={csvHref}>Download CSV</a>
            </Button>
            <Button asChild size="sm" variant="outline">
              <a href={xlsxHref}>Download XLSX</a>
            </Button>
            {onNext && (
              <Button size="sm" className="ml-auto" onClick={onNext}>
                Next: Build Keywords →
              </Button>
            )}
          </div>

          <DataTable rows={query.data.preview} maxHeight="360px" />
        </div>
      )}
    </SectionShell>
  );
}
