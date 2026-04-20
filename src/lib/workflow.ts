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

// Normalised column names (lower-case, no spaces) that indicate a gender or age source column.
const GENDER_NORM = new Set(['gender', 'sex', 'targetgender', 'productgender']);
const AGE_NORM = new Set(['agegroup', 'age', 'targetage', 'agerange']);

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function availableKeywordFields(state: WorkflowState): string[] {
  const base = state.columns.map((c) => c.column);
  const fields = new Set(base);

  // Normalised Colour is added by the pipeline whenever a colour source column
  // is selected. The mapping itself lives in the base CSV + Neon DB overrides —
  // there is no blob, so colourMapBlobUrl is always ''. Use colourCol instead.
  if (state.colourCol) {
    fields.add('Normalised Colour');
  }

  // Category columns are added by the category-extraction pipeline.
  if (state.wantMain) fields.add('Main Category');
  if (state.wantPenultimate) fields.add('Penultimate Category');
  if (state.wantFinal) fields.add('Final Category');

  // Age Gender Segment is derived at parse time when gender/age source columns
  // are present. Ensure it's in the list by checking either:
  //  a) it already appears in base (column present in raw feed), OR
  //  b) a known gender/age source column exists (derivation would have run).
  const hasSegmentCol = base.some((c) => norm(c) === 'agegendersegment');
  const hasGenderOrAge = base.some((c) => GENDER_NORM.has(norm(c)) || AGE_NORM.has(norm(c)));
  if (hasSegmentCol || hasGenderOrAge) {
    fields.add('Age Gender Segment');
  }

  // Filter out split price/currency helper columns and raw source columns
  // that aren't useful as keyword building blocks.
  const excluded = new Set(['price_currency', 'sale price_currency']);

  return sortByPriority(Array.from(fields).filter((f) => !excluded.has(f)));
}

export function emptyCombo(): Combo {
  return { name: '', fields: [], splitAmpersand: false };
}
