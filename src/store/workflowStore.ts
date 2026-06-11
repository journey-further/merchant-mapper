import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ColumnMeta, Combo } from '../types/api';

export type FeedSourceType = 'merchant_centre' | 'shopify';

interface WorkflowStore {
  // Session identity
  sessionId: string | null;
  fileHash: string | null;
  fileName: string | null;
  sheetName: string | null;
  feedSourceType: FeedSourceType;
  shopifyStoreUrl: string | null;

  // Blob URLs (replacing Parquet on disk)
  rawDfBlobUrl: string | null;
  combinedDfBlobUrl: string | null;
  gadsDfBlobUrl: string | null;
  colourMapBlobUrl: string | null;

  // Workflow config (previously Flask session keys)
  keepMap: Record<string, boolean>;
  filters: Record<string, string[]>;
  numericFilters: Record<string, { gte?: number; lte?: number }>;
  groupCol: string | null;
  colourCol: string | null;
  catSrcCol: string | null;
  wantMain: boolean;
  wantPenultimate: boolean;
  wantFinal: boolean;
  combos: Combo[];
  geoIds: string[];
  languageId: string;

  // Cached column metadata (not persisted, derived on upload)
  columns: ColumnMeta[];
  productCount: number;

  // True once the first batch of feed queries have resolved after a fresh upload.
  // Defaults to true so persisted sessions don't block on page reload.
  feedDataReady: boolean;

  // Actions
  setFeedDataReady: () => void;
  setSession: (params: {
    sessionId: string;
    fileHash: string;
    fileName: string;
    sheetName: string | null;
    rawDfBlobUrl: string;
    columns: ColumnMeta[];
    keepMap: Record<string, boolean>;
    productCount: number;
    catSrcCol: string | null;
  }) => void;
  setKeepMap: (map: Record<string, boolean>) => void;
  setFilters: (filters: Record<string, string[]>) => void;
  setNumericFilters: (numericFilters: Record<string, { gte?: number; lte?: number }>) => void;
  setGroupCol: (col: string) => void;
  setColourCol: (col: string) => void;
  setCatSrcCol: (col: string) => void;
  setCatOptions: (wantMain: boolean, wantPenultimate: boolean, wantFinal: boolean) => void;
  setCombos: (combos: Combo[]) => void;
  setFeedSource: (type: FeedSourceType, url?: string) => void;
  setGeoIds: (ids: string[]) => void;
  setLanguageId: (id: string) => void;
  setCombinedDfBlobUrl: (url: string) => void;
  setGadsDfBlobUrl: (url: string) => void;
  setColourMapBlobUrl: (url: string) => void;
  resetSession: () => void;
}

const DEFAULT_STATE = {
  sessionId: null,
  fileHash: null,
  fileName: null,
  sheetName: null,
  feedSourceType: 'merchant_centre' as FeedSourceType,
  shopifyStoreUrl: null,
  rawDfBlobUrl: null,
  combinedDfBlobUrl: null,
  gadsDfBlobUrl: null,
  colourMapBlobUrl: null,
  keepMap: {},
  filters: {},
  numericFilters: {},
  groupCol: null,
  colourCol: null,
  catSrcCol: null,
  wantMain: false,
  wantPenultimate: false,
  wantFinal: false,
  combos: [{ name: '', fields: [], splitAmpersand: false }],
  geoIds: [],
  languageId: '1000', // English default
  columns: [],
  productCount: 0,
  feedDataReady: true,
};

export const useWorkflowStore = create<WorkflowStore>()(
  persist(
    (set) => ({
      ...DEFAULT_STATE,

      setFeedDataReady: () => set({ feedDataReady: true }),

      setSession: (params) =>
        set({
          feedDataReady: false,
          sessionId: params.sessionId,
          fileHash: params.fileHash,
          fileName: params.fileName,
          sheetName: params.sheetName,
          rawDfBlobUrl: params.rawDfBlobUrl,
          columns: params.columns,
          keepMap: params.keepMap,
          productCount: params.productCount,
          catSrcCol: params.catSrcCol,
          // Reset downstream state when a new file is uploaded
          combinedDfBlobUrl: null,
          gadsDfBlobUrl: null,
          colourMapBlobUrl: null,
          filters: {},
          numericFilters: {},
          groupCol: null,
          colourCol: null,
          wantMain: false,
          wantPenultimate: false,
          wantFinal: false,
          combos: [{ name: '', fields: [], splitAmpersand: false }],
          geoIds: [],
        }),

      setFeedSource: (feedSourceType, shopifyStoreUrl) =>
        set({ feedSourceType, shopifyStoreUrl: shopifyStoreUrl ?? null }),
      setKeepMap: (keepMap) => set({ keepMap }),
      setFilters: (filters) => set({ filters }),
      setNumericFilters: (numericFilters) => set({ numericFilters }),
      setGroupCol: (groupCol) => set({ groupCol }),
      setColourCol: (colourCol) => set({ colourCol }),
      setCatSrcCol: (catSrcCol) => set({ catSrcCol }),
      setCatOptions: (wantMain, wantPenultimate, wantFinal) =>
        set({ wantMain, wantPenultimate, wantFinal }),
      setCombos: (combos) => set({ combos }),
      setGeoIds: (geoIds) => set({ geoIds }),
      setLanguageId: (languageId) => set({ languageId }),
      setCombinedDfBlobUrl: (combinedDfBlobUrl) => set({ combinedDfBlobUrl }),
      setGadsDfBlobUrl: (gadsDfBlobUrl) => set({ gadsDfBlobUrl }),
      setColourMapBlobUrl: (colourMapBlobUrl) => set({ colourMapBlobUrl }),
      resetSession: () => set(DEFAULT_STATE),
    }),
    {
      name: 'merchant-mapper-session',
      partialize: (state) => ({
        sessionId: state.sessionId,
        fileHash: state.fileHash,
        fileName: state.fileName,
        sheetName: state.sheetName,
        rawDfBlobUrl: state.rawDfBlobUrl,
        combinedDfBlobUrl: state.combinedDfBlobUrl,
        gadsDfBlobUrl: state.gadsDfBlobUrl,
        colourMapBlobUrl: state.colourMapBlobUrl,
        feedSourceType: state.feedSourceType,
        shopifyStoreUrl: state.shopifyStoreUrl,
        keepMap: state.keepMap,
        filters: state.filters,
        numericFilters: state.numericFilters,
        groupCol: state.groupCol,
        colourCol: state.colourCol,
        catSrcCol: state.catSrcCol,
        wantMain: state.wantMain,
        wantPenultimate: state.wantPenultimate,
        wantFinal: state.wantFinal,
        combos: state.combos,
        geoIds: state.geoIds,
        languageId: state.languageId,
        productCount: state.productCount,
        // Persist columns so keyword field dropdowns remain fully populated after
        // navigation or page reload without requiring a re-upload.
        columns: state.columns,
      }),
    }
  )
);
