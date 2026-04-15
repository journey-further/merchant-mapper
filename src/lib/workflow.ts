import type { Combo } from '../types/api';
import type { useWorkflowStore } from '../store/workflowStore';

type WorkflowState = ReturnType<typeof useWorkflowStore.getState>;

// Fields shown first in any field-picker, in this order.
export const PRIORITY_FIELDS = [
  'Age Gender Segment',
  'Normalised Colour',
  'material',
  'Final Category',
  'Penultimate Category',
  'Main Category',
];

/** Sort a field list so PRIORITY_FIELDS come first, then remainder alphabetically. */
export function sortByPriority(fields: string[]): string[] {
  const priorityIndex = (f: string) => {
    const idx = PRIORITY_FIELDS.findIndex(
      (p) => p.toLowerCase() === f.toLowerCase()
    );
    return idx === -1 ? Infinity : idx;
  };
  return [...fields].sort((a, b) => {
    const pa = priorityIndex(a);
    const pb = priorityIndex(b);
    if (pa !== pb) return pa - pb;
    return a.localeCompare(b);
  });
}

export function buildWorkflowState(state: WorkflowState) {
  return {
    keepMap: state.keepMap,
    filters: state.filters,
    groupCol: state.groupCol,
    colourCol: state.colourCol,
    catSrcCol: state.catSrcCol,
    wantMain: state.wantMain,
    wantPenultimate: state.wantPenultimate,
    wantFinal: state.wantFinal,
  };
}

export function availableKeywordFields(state: WorkflowState): string[] {
  const base = state.columns.map((c) => c.column);
  const fields = new Set(base);

  if (state.colourMapBlobUrl && state.colourCol) {
    fields.add('Normalised Colour');
  }
  if (state.wantMain) fields.add('Main Category');
  if (state.wantPenultimate) fields.add('Penultimate Category');
  if (state.wantFinal) fields.add('Final Category');
  if (base.some((c) => c.toLowerCase() === 'age gender segment')) {
    fields.add('Age Gender Segment');
  }

  // Filter out split price/currency helper columns and raw source columns
  // that aren't useful as keyword building blocks
  const excluded = new Set(['price_currency', 'sale price_currency']);

  return sortByPriority(Array.from(fields).filter((f) => !excluded.has(f)));
}

export function emptyCombo(): Combo {
  return { name: '', fields: [], splitAmpersand: false };
}
