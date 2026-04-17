import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../ui/button';
import { applyColumns } from '../../lib/api';
import { useWorkflowStore } from '../../store/workflowStore';
import SectionShell from '../shared/SectionShell';
import DataTable from '../shared/DataTable';

export default function ColumnPicker() {
  const queryClient = useQueryClient();
  const { sessionId, rawDfBlobUrl, keepMap, setKeepMap } = useWorkflowStore();

  const query = useQuery({
    queryKey: ['columns', sessionId, rawDfBlobUrl, keepMap],
    queryFn: () =>
      applyColumns({
        session: sessionId!,
        rawDfUrl: rawDfBlobUrl!,
        keepMap,
      }),
    enabled: !!sessionId && !!rawDfBlobUrl,
  });

  async function runAction(action: 'recommended' | 'all' | 'none' | 'invert') {
    if (!sessionId || !rawDfBlobUrl) return;
    const result = await applyColumns({
      session: sessionId,
      rawDfUrl: rawDfBlobUrl,
      keepMap,
      action,
    });
    setKeepMap(result.keepMap);
    await queryClient.invalidateQueries({ queryKey: ['filters'] });
  }

  return (
    <SectionShell title="Columns" loading={query.isLoading}>
      {query.error && <p className="text-sm text-destructive">Failed to load column options.</p>}

      {query.data && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void runAction('recommended')}>Recommended</Button>
            <Button variant="outline" size="sm" onClick={() => void runAction('all')}>Keep all</Button>
            <Button variant="outline" size="sm" onClick={() => void runAction('none')}>Keep none</Button>
            <Button variant="outline" size="sm" onClick={() => void runAction('invert')}>Invert</Button>
            <span className="ml-auto text-sm text-muted-foreground">
              {query.data.colCount} columns kept
            </span>
          </div>

          <div className="max-h-72 overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b text-left">
                  <th className="px-3 py-2">Keep</th>
                  <th className="px-3 py-2">Column</th>
                  <th className="px-3 py-2">Unique</th>
                  <th className="px-3 py-2">Example</th>
                </tr>
              </thead>
              <tbody>
                {query.data.columns.map((column) => (
                  <tr key={column.column} className="border-b align-top">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={!!keepMap[column.column]}
                        onChange={(e) =>
                          setKeepMap({
                            ...keepMap,
                            [column.column]: e.target.checked,
                          })
                        }
                      />
                    </td>
                    <td className="px-3 py-2 font-medium">{column.column}</td>
                    <td className="px-3 py-2 tabular-nums">{column.unique}</td>
                    <td className="px-3 py-2 text-muted-foreground">{column.example}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Preview</p>
            <DataTable rows={query.data.preview} maxHeight="320px" />
          </div>
        </div>
      )}
    </SectionShell>
  );
}
