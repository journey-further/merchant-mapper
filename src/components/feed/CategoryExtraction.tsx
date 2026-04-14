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
    <SectionShell title="Category Extraction" loading={query.isLoading}>
      {!catSrcCol ? (
        <p className="text-sm text-muted-foreground">No category source column is available in the current feed.</p>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-[minmax(0,280px)_1fr]">
            <label className="space-y-2 text-sm">
              <span className="font-medium">Category source</span>
              <select
                className="block w-full rounded-md border bg-background px-3 py-2"
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

            <div className="flex flex-wrap items-center gap-4 pt-7 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={wantMain}
                  onChange={(e) => setCatOptions(e.target.checked, wantPenultimate, wantFinal)}
                />
                Main category
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={wantPenultimate}
                  onChange={(e) => setCatOptions(wantMain, e.target.checked, wantFinal)}
                />
                Penultimate category
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={wantFinal}
                  onChange={(e) => setCatOptions(wantMain, wantPenultimate, e.target.checked)}
                />
                Final category
              </label>
            </div>
          </div>

          {query.error && <p className="mt-3 text-sm text-destructive">Failed to extract categories.</p>}
          {query.data && <DataTable rows={query.data.preview} maxHeight="320px" />}
        </>
      )}
    </SectionShell>
  );
}
