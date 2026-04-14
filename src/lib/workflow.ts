import type { Combo } from '../types/api';
import type { useWorkflowStore } from '../store/workflowStore';

type WorkflowState = ReturnType<typeof useWorkflowStore.getState>;

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

  return Array.from(fields);
}

export function emptyCombo(): Combo {
  return { name: '', fields: [], splitAmpersand: false };
}
