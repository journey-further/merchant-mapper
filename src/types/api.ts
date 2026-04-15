// API request/response types

export interface ColumnMeta {
  column: string;
  keep: boolean;
  example: string;
  unique: number;
}

export interface ParseResponse {
  columns: ColumnMeta[];
  productCount: number;
  fileName: string;
  sheetName: string | null;
  sheets: string[] | null;
  rawDfBlobUrl: string;
  fileHash: string;
  catSrcCol: string | null;
}

export interface ColumnsResponse {
  keepMap: Record<string, boolean>;
  columns: ColumnMeta[];
  preview: Record<string, string>[];
  rowCount: number;
  colCount: number;
}

export interface NumericFilterOption {
  min: number;
  max: number;
  type: 'price' | 'numeric';
}

export interface FiltersResponse {
  options: Record<string, string[]>;
  numericOptions: Record<string, NumericFilterOption>;
  filteredCount: number;
  totalCount: number;
  preview: Record<string, string>[];
}

export interface GroupsResponse {
  candidates: string[];
  groupCol: string;
  rollup: Array<Record<string, string | number>>;
  stats?: Array<{ column: string; groupCount: number; skuCount: number }>;
}

export interface ColourSummaryResponse {
  colourCandidates: string[];
  colourCol: string;
  valueCounts: Array<{ colour: string; productCount: number; pct: string }>;
  nonEmpty: number;
}

export interface ColourMappingRow {
  productColour: string;
  genericColour: string;
}

export interface ColourMappingGetResponse {
  rows: ColourMappingRow[];
}

export interface ColourMappingPostResponse {
  colourMapBlobUrl: string;
  breakdown: {
    currentlyMapped: number;
    newlyMapped: number;
    unmapped: number;
    eligible: number;
    pctMapped: number;
  };
  unmapped: Array<{ productColour: string; suggestion: string; productCount: number }>;
  allowedGeneric: string[];
}

export interface CategoriesResponse {
  preview: Record<string, string>[];
  allCols: string[];
  catSrcCol: string;
}

export interface NormalisedFeedResponse {
  preview: Record<string, string>[];
  rowCount: number;
  colCount: number;
}

export interface Combo {
  name: string;
  fields: string[];
  splitAmpersand: boolean;
}

export interface KeywordListTable {
  listName: string;
  rows: Record<string, string | number>[];
  displayCols: string[];
}

export interface KeywordsResponse {
  combos: Combo[];
  perListTables: KeywordListTable[];
}

export interface KeywordsFinaliseResponse {
  combinedDfBlobUrl: string;
  preview: Record<string, string>[];
  totalKeywords: number;
}

export interface GadsConstantsResponse {
  countries: Array<{ criteriaId: string; name: string; countryCode: string }>;
  languages: Array<{ languageId: string; name: string }>;
}

export interface GadsProgressEvent {
  status: 'running' | 'done' | 'error';
  pct: number;
  batch: number;
  totalBatches: number;
  gadsDfBlobUrl?: string;
  message?: string;
}

export interface GadsUploadResponse {
  gadsDfBlobUrl: string;
  preview: Record<string, string | number>[];
  rowCount: number;
}

export interface GadsResultsResponse {
  hasResults: boolean;
  preview: Record<string, string | number>[];
  totalRows: number;
  keywordsWithVolume: number;
}

export interface GadsChartsResponse {
  chronologicalSpec: object;
  seasonalitySpec: object;
}

export interface BubbleDataResponse {
  items: Array<{ title: string; clicks: number; category: string }>;
  total: number;
  groupCandidates: string[];
}
