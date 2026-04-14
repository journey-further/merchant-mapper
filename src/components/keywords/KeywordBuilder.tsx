import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@journey-further/salient-ui/ui/button';
import { buildKeywords } from '../../lib/api';
import { availableKeywordFields, buildWorkflowState, emptyCombo } from '../../lib/workflow';
import { useWorkflowStore } from '../../store/workflowStore';
import SectionShell from '../shared/SectionShell';
import DataTable from '../shared/DataTable';
import type { Combo } from '../../types/api';

export default function KeywordBuilder() {
  const store = useWorkflowStore();
  const { sessionId, rawDfBlobUrl, colourMapBlobUrl, combos, setCombos } = store;
  const [presetLoading, setPresetLoading] = useState(false);
  const fields = availableKeywordFields(store);
  const state = buildWorkflowState(store);

  const query = useQuery({
    queryKey: ['keywords', sessionId, rawDfBlobUrl, colourMapBlobUrl, state, combos],
    queryFn: () =>
      buildKeywords({
        session: sessionId!,
        rawDfUrl: rawDfBlobUrl!,
        colourMapBlobUrl: colourMapBlobUrl ?? undefined,
        state,
        combos,
      }),
    enabled: !!sessionId && !!rawDfBlobUrl,
  });

  async function loadPresets() {
    if (!sessionId || !rawDfBlobUrl) return;
    setPresetLoading(true);
    try {
      const response = await buildKeywords({
        session: sessionId,
        rawDfUrl: rawDfBlobUrl,
        colourMapBlobUrl: colourMapBlobUrl ?? undefined,
        state,
        combos,
        presets: true,
      });
      setCombos(response.combos.length ? response.combos : [emptyCombo()]);
    } finally {
      setPresetLoading(false);
    }
  }

  function updateCombo(index: number, updater: (combo: Combo) => Combo) {
    setCombos(combos.map((combo, comboIndex) => (comboIndex === index ? updater(combo) : combo)));
  }

  return (
    <SectionShell title="Keyword Builder" loading={query.isLoading}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setCombos([...combos, emptyCombo()])}>
            Add combo
          </Button>
          <Button variant="outline" size="sm" onClick={() => void loadPresets()} disabled={presetLoading}>
            {presetLoading ? 'Loading presets…' : 'Use presets'}
          </Button>
        </div>

        {combos.map((combo, index) => (
          <div key={index} className="space-y-3 rounded-md border p-4">
            <div className="grid gap-3 md:grid-cols-[minmax(0,220px)_1fr_auto]">
              <label className="space-y-2 text-sm">
                <span className="font-medium">List name</span>
                <input
                  className="w-full rounded-md border bg-background px-3 py-2"
                  value={combo.name}
                  onChange={(e) => updateCombo(index, (current) => ({ ...current, name: e.target.value }))}
                  placeholder={`List ${index + 1}`}
                />
              </label>

              <div className="grid gap-3 md:grid-cols-3">
                {[0, 1, 2].map((slot) => (
                  <label key={slot} className="space-y-2 text-sm">
                    <span className="font-medium">Field {slot + 1}</span>
                    <select
                      className="block w-full rounded-md border bg-background px-3 py-2"
                      value={combo.fields[slot] ?? ''}
                      onChange={(e) =>
                        updateCombo(index, (current) => {
                          const nextFields = [...current.fields];
                          nextFields[slot] = e.target.value;
                          return {
                            ...current,
                            fields: nextFields.filter(Boolean),
                          };
                        })
                      }
                    >
                      <option value="">None</option>
                      {fields.map((field) => (
                        <option key={field} value={field}>
                          {field}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>

              <div className="flex items-end gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={combo.splitAmpersand}
                    onChange={(e) => updateCombo(index, (current) => ({ ...current, splitAmpersand: e.target.checked }))}
                  />
                  Split `&`
                </label>
                {combos.length > 1 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCombos(combos.filter((_, comboIndex) => comboIndex !== index))}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </div>

            {query.data?.perListTables[index] && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Preview</p>
                <DataTable
                  rows={query.data.perListTables[index].rows}
                  columns={query.data.perListTables[index].displayCols}
                  maxHeight="260px"
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </SectionShell>
  );
}
