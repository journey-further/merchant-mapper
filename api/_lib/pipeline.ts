/**
 * Orchestrates the full processing pipeline from raw rows + params,
 * mirroring Python's get_processed_df().
 */
import {
  applyColumnSelection, applyFilters, applyNumericFilters, splitPriceColumns,
  type Row,
} from './core/feedProcessor.js'
import { applyColourMapping, mergeNewMappings, loadBaseColourMap, type ColourMap } from './core/colourMapping.js'
import { extractCategories } from './core/categoryExtraction.js'
import { applyGrouping, computeGroupStats } from './core/productGroups.js'

export interface PipelineParams {
  keepMap?: Record<string, boolean>
  filters?: Record<string, string[]>
  numericFilters?: Record<string, { gte?: number; lte?: number }>
  groupCol?: string
  colourCol?: string
  colourMapOverrides?: { product_colour: string; generic_colour: string }[]
  catSrcCol?: string
  wantMain?: boolean
  wantPenultimate?: boolean
  wantFinal?: boolean
}

export async function getProcessedRows(raw: Row[], params: PipelineParams): Promise<Row[]> {
  let rows = raw

  if (params.keepMap) rows = applyColumnSelection(rows, params.keepMap)
  if (params.filters && Object.keys(params.filters).length) rows = applyFilters(rows, params.filters)
  if (params.numericFilters && Object.keys(params.numericFilters).length) rows = applyNumericFilters(rows, params.numericFilters)

  if (params.groupCol) {
    const stats = computeGroupStats(rows, [params.groupCol])
    rows = applyGrouping(rows, params.groupCol, stats)
  }

  if (params.colourCol) {
    let map: ColourMap = loadBaseColourMap()
    if (params.colourMapOverrides?.length) map = mergeNewMappings(map, params.colourMapOverrides)
    rows = applyColourMapping(rows, params.colourCol, map)
  }

  if (params.catSrcCol) {
    rows = extractCategories(
      rows,
      params.catSrcCol,
      params.wantMain ?? false,
      params.wantPenultimate ?? false,
      params.wantFinal ?? false,
    )
  }

  rows = splitPriceColumns(rows)
  return rows
}
