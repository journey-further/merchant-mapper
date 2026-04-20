import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getNormalisedFeed } from '../../lib/api';
import { buildWorkflowState } from '../../lib/workflow';
import { useWorkflowStore } from '../../store/workflowStore';
import DataTable from '../shared/DataTable';

/**
 * Compact, collapsible normalised feed preview for use on other tabs
 * (e.g. above the Keyword Builder) so users can remind themselves of
 * available field values without switching tabs.
 */
export default function NormalisedFeedMini() {
  const store = useWorkflowStore();
  const { sessionId, rawDfBlobUrl, colourMapBlobUrl } = store;
  const state = buildWorkflowState(store);
  const [open, setOpen] = useState(true);

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
    staleTime: 60_000,
  });

  return (
    <div className="mb-4 rounded-md border bg-muted/30">
      <button
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium"
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
        Feed field reference
        <span className="ml-1 text-xs font-normal text-muted-foreground">
          — expand to see sample values for each column
        </span>
      </button>

      {open && (
        <div className="border-t px-4 pb-4 pt-3">
          {query.isLoading && (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
          {query.error && (
            <p className="text-sm text-destructive">Failed to load feed preview.</p>
          )}
          {query.data && (
            <DataTable rows={query.data.preview} maxHeight="260px" />
          )}
        </div>
      )}
    </div>
  );
}
