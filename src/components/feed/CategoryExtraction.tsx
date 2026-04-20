import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { extractCategories } from '../../lib/api';
import { useWorkflowStore } from '../../store/workflowStore';
import SectionShell from '../shared/SectionShell';
import DataTable from '../shared/DataTable';

export default function CategoryExtraction() {
  const {
    sessionId,
    rawDfBlobUrl,
    keepMap,
    filters,
    catSrcCol,
    wantMain,
    wantPenultimate,
    wantFinal,
    setCatSrcCol,
    setCatOptions,
  } = useWorkflowStore();

  const query = useQuery({
    queryKey: ['categories', sessionId, rawDfBlobUrl, keepMap, filters, catSrcCol, wantMain, wantPenultimate, wantFinal],
    queryFn: () =>
      extractCategories({
        session: sessionId!,
        rawDfUrl: rawDfBlobUrl!,
        keepMap,
        filters,
        catSrcCol: catSrcCol!,
        wantMain,
        wantPenultimate,
        wantFinal,
      }),
    enabled: !!sessionId && !!rawDfBlobUrl && !!catSrcCol,
  });

  useEffect(() => {
    if (query.data?.catSrcCol && query.data.catSrcCol !== catSrcCol) {
      setCatSrcCol(query.data.catSrcCol);
    }
  }, [catSrcCol, query.data?.catSrcCol, setCatSrcCol]);

  return (
    <SectionShell title="Category Extraction" loading={query.isLoading} fetching={query.isFetching}>
      {!catSrcCol ? (
        <p className="text-sm text-muted-foreground">No category source column is available in the current feed.</p>
      ) : (
        <>
          <p className="mb-3 text-sm text-muted-foreground">
            Split a column like product&nbsp;type into separate category fields.
          </p>

          <div className="flex flex-wrap items-end gap-4">
            <label className="space-y-1 text-sm">
              <span className="font-medium">Column to split into categories</span>
              <select
                className="block rounded-md border bg-background px-3 py-2"
                value={catSrcCol}
                onChange={(e) => setCatSrcCol(e.target.value)}
              >
                {query.data?.allCols.map((column) => (
                  <option key={column} value={column}>
                    {column}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex flex-wrap items-center gap-4 pb-2 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={wantMain}
                  onChange={(e) => setCatOptions(e.target.checked, wantPenultimate, wantFinal)}
                />
                Create <strong>Main Category</strong> <span className="text-muted-foreground">(first segment)</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={wantPenultimate}
                  onChange={(e) => setCatOptions(wantMain, e.target.checked, wantFinal)}
                />
                Create <strong>Penultimate Category</strong> <span className="text-muted-foreground">(second-to-last)</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={wantFinal}
                  onChange={(e) => setCatOptions(wantMain, wantPenultimate, e.target.checked)}
                />
                Create <strong>Final Category</strong> <span className="text-muted-foreground">(last segment)</span>
              </label>
            </div>
          </div>

          <p className="mt-2 text-xs text-muted-foreground">Updates apply automatically.</p>

          {query.error && <p className="mt-3 text-sm text-destructive">Failed to extract categories.</p>}

          {query.data && (
            <div className="mt-4">
              <DataTable rows={query.data.preview} maxHeight="360px" />
            </div>
          )}
        </>
      )}
    </SectionShell>
  );
}
