// Typed fetch wrappers for all /api/ endpoints.
// All POST endpoints accept JSON bodies; GET endpoints use query params.

import type {
  ParseResponse,
  ColumnsResponse,
  FiltersResponse,
  GroupsResponse,
  ColourSummaryResponse,
  ColourMappingGetResponse,
  ColourMappingPostResponse,
  CategoriesResponse,
  NormalisedFeedResponse,
  KeywordsResponse,
  KeywordsFinaliseResponse,
  GadsConstantsResponse,
  GadsUploadResponse,
  GadsResultsResponse,
  GadsChartsResponse,
  BubbleDataResponse,
  Combo,
  ColourMappingRow,
} from '../types/api';

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${path} ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

async function get<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = params ? `${path}?${new URLSearchParams(params)}` : path;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${path} ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ─── Upload ───────────────────────────────────────────────────────────────────

export async function getBlobUploadToken(filename: string, contentType: string) {
  return post<{ uploadUrl: string; url: string }>('/api/blob-token', {
    filename,
    contentType,
  });
}

export async function parseFeed(params: {
  session: string;
  blobUrl: string;
  filename: string;
  sheetName?: string;
}): Promise<ParseResponse> {
  return post('/api/parse', params);
}

export async function fetchShopifyFeed(params: {
  storeUrl: string;
}): Promise<ParseResponse> {
  return post('/api/fetch-shopify', params);
}

// ─── Feed steps ───────────────────────────────────────────────────────────────

export async function applyColumns(params: {
  session: string;
  rawDfUrl: string;
  keepMap: Record<string, boolean>;
  action?: 'recommended' | 'all' | 'none' | 'invert';
}): Promise<ColumnsResponse> {
  return post('/api/columns', params);
}

export async function getFilters(params: {
  session: string;
  rawDfUrl: string;
  keepMap: Record<string, boolean>;
  filters: Record<string, string[]>;
  numericFilters?: Record<string, { gte?: number; lte?: number }>;
}): Promise<FiltersResponse> {
  return post('/api/filters', params);
}

export async function getGroups(params: {
  session: string;
  rawDfUrl: string;
  filters: Record<string, string[]>;
  groupCol?: string;
}): Promise<GroupsResponse> {
  return post('/api/groups', params);
}

export async function getColourSummary(params: {
  session: string;
  rawDfUrl: string;
  keepMap: Record<string, boolean>;
  filters: Record<string, string[]>;
  colourCol?: string;
}): Promise<ColourSummaryResponse> {
  return post('/api/colour-summary', params);
}

export async function getColourMappingBase(): Promise<ColourMappingGetResponse> {
  return get('/api/colour-mapping');
}

export async function applyColourMapping(params: {
  session: string;
  rawDfUrl: string;
  keepMap: Record<string, boolean>;
  filters: Record<string, string[]>;
  colourCol: string;
  overrides: ColourMappingRow[];
}): Promise<ColourMappingPostResponse> {
  return post('/api/colour-mapping', params);
}

export async function extractCategories(params: {
  session: string;
  rawDfUrl: string;
  keepMap: Record<string, boolean>;
  filters: Record<string, string[]>;
  catSrcCol: string;
  wantMain: boolean;
  wantPenultimate: boolean;
  wantFinal: boolean;
}): Promise<CategoriesResponse> {
  return post('/api/categories', params);
}

export async function getNormalisedFeed(params: {
  session: string;
  rawDfUrl: string;
  colourMapBlobUrl?: string;
  state: object;
}): Promise<NormalisedFeedResponse> {
  return post('/api/normalised-feed', params);
}

// ─── Keywords ─────────────────────────────────────────────────────────────────

export async function buildKeywords(params: {
  session: string;
  rawDfUrl: string;
  colourMapBlobUrl?: string;
  state: object;
  combos: Combo[];
  presets?: boolean;
}): Promise<KeywordsResponse> {
  return post('/api/keywords', params);
}

export async function finaliseKeywords(params: {
  session: string;
  rawDfUrl: string;
  colourMapBlobUrl?: string;
  state: object;
  combos: Combo[];
}): Promise<KeywordsFinaliseResponse> {
  return post('/api/keywords-finalise', params);
}

// ─── Google Ads ───────────────────────────────────────────────────────────────

export async function getGadsConstants(): Promise<GadsConstantsResponse> {
  return get('/api/gads-constants');
}

export async function fetchGadsVolumes(params: {
  combinedDfBlobUrl: string;
  geoIds: string[];
  languageId: string;
}): Promise<GadsUploadResponse> {
  return post('/api/gads-fetch', params);
}

export async function uploadGadsFile(params: {
  blobUrl: string;
  filename: string;
}): Promise<GadsUploadResponse> {
  return post('/api/gads-upload', params);
}

export async function getGadsResults(params: {
  session: string;
  combinedDfBlobUrl: string;
  gadsDfBlobUrl: string;
}): Promise<GadsResultsResponse> {
  return post('/api/gads-results', params);
}

export async function getGadsCharts(params: {
  session: string;
  combinedDfBlobUrl: string;
  gadsDfBlobUrl: string;
}): Promise<GadsChartsResponse> {
  return post('/api/gads-charts', params);
}

// ─── Visualise ────────────────────────────────────────────────────────────────

export async function getBubbleData(params: {
  session: string;
  rawDfUrl: string;
  n: number;
  groupCol?: string;
  state?: object;
}): Promise<BubbleDataResponse> {
  return get('/api/bubble-data', {
    session: params.session,
    rawDfUrl: params.rawDfUrl,
    n: String(params.n),
    ...(params.groupCol ? { groupCol: params.groupCol } : {}),
    ...(params.state ? { state: JSON.stringify(params.state) } : {}),
  });
}

// ─── Download ─────────────────────────────────────────────────────────────────

export function downloadUrl(params: {
  session: string;
  type: string;
  format: 'csv' | 'xlsx';
  rawDfUrl?: string;
  combinedDfUrl?: string;
  gadsDfBlobUrl?: string;
  colourMapBlobUrl?: string;
  state?: string;
}): string {
  const p: Record<string, string> = {
    session: params.session,
    type: params.type,
    format: params.format,
  };
  if (params.rawDfUrl) p.rawDfUrl = params.rawDfUrl;
  if (params.combinedDfUrl) p.combinedDfUrl = params.combinedDfUrl;
  if (params.gadsDfBlobUrl) p.gadsDfBlobUrl = params.gadsDfBlobUrl;
  if (params.colourMapBlobUrl) p.colourMapBlobUrl = params.colourMapBlobUrl;
  if (params.state) p.state = params.state;
  return `/api/download?${new URLSearchParams(p)}`;
}
