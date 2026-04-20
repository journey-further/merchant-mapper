import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as d3h from 'd3-hierarchy';
import { Badge } from '../../ui/badge';
import { Skeleton } from '../../ui/skeleton';
import { useWorkflowStore } from '../../store/workflowStore';
import { getBubbleData } from '../../lib/api';
import { buildWorkflowState, sortByPriority } from '../../lib/workflow';
import PackControls from './PackControls';

/**
 * Returns '#000000' or '#ffffff' for maximum contrast against the given
 * hex background, using the WCAG relative luminance formula.
 */
function contrastColour(hex: string): '#000000' | '#ffffff' {
  const c = hex.replace('#', '');
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  // Linearise sRGB channels
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.179 ? '#000000' : '#ffffff';
}

// 12-colour qualitatively-distinct palette
const PALETTE = [
  '#4878CF', '#6ACC65', '#D65F5F', '#B47CC7', '#C4AD66',
  '#77BEDB', '#E08E4A', '#56A68F', '#E05C8A', '#A5C94F',
  '#8C7B75', '#547AA5',
];

interface DataNode {
  title?: string;
  value?: number;
  category?: string;
  name?: string;
  children?: DataNode[];
}

interface TooltipState {
  x: number;
  y: number;
  title: string;
  value: number;
}

export default function PackChart() {
  const store = useWorkflowStore();
  const { sessionId, rawDfBlobUrl } = store;
  const state = buildWorkflowState(store);

  const [n, setN] = useState(500);
  const [groupCol, setGroupCol] = useState<string>('');
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const { width } = entries[0].contentRect;
      if (width > 0) setSize({ width, height: Math.max(500, Math.round(width * 0.75)) });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ['bubble-data', sessionId, n, groupCol, state],
    queryFn: () =>
      getBubbleData({
        session: sessionId!,
        rawDfUrl: rawDfBlobUrl!,
        n,
        groupCol: groupCol || undefined,
        state,
      }),
    enabled: !!sessionId && !!rawDfBlobUrl,
    staleTime: 60_000,
  });


  const sortedCandidates = useMemo(
    () => sortByPriority(data?.groupCandidates ?? []),
    [data?.groupCandidates]
  );

  const hierarchical = !!groupCol;

  const { productCircles, categoryCircles } = useMemo(() => {
    if (!data?.items.length) return { productCircles: [], categoryCircles: [] };
    const { width, height } = size;
    const items = data.items;

    let root: d3h.HierarchyCircularNode<DataNode>;

    if (hierarchical) {
      const grouped = new Map<string, typeof items>();
      for (const item of items) {
        const cat = item.category || 'Uncategorised';
        if (!grouped.has(cat)) grouped.set(cat, []);
        grouped.get(cat)!.push(item);
      }
      const treeData: DataNode = {
        name: 'root',
        children: [...grouped].map(([cat, kids]) => ({
          name: cat,
          children: kids as DataNode[],
        })),
      };
      root = d3h.pack<DataNode>().size([width, height]).padding(6)(
        d3h.hierarchy(treeData).sum((d) => Math.max((d as { value?: number }).value ?? 0, 1))
      );
    } else {
      const treeData: DataNode = { children: items as DataNode[] };
      root = d3h.pack<DataNode>().size([width, height]).padding(2)(
        d3h.hierarchy(treeData).sum((d) => Math.max((d as { value?: number }).value ?? 0, 1))
      );
    }

    const all = root.descendants();
    return {
      productCircles: all.filter((node) => node.depth === (hierarchical ? 2 : 1)),
      categoryCircles: hierarchical ? all.filter((node) => node.depth === 1) : [],
    };
  }, [data, size, hierarchical]);

  const catColorMap = useMemo(() => {
    const map = new Map<string, string>();
    let i = 0;
    for (const c of categoryCircles) {
      const name = (c.data as DataNode).name ?? '';
      if (!map.has(name)) { map.set(name, PALETTE[i % PALETTE.length]); i++; }
    }
    return map;
  }, [categoryCircles]);

  if (!sessionId || !rawDfBlobUrl) {
    return (
      <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
        Upload a feed to see the product visualisation.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <PackControls
          n={n}
          total={data?.total ?? 0}
          groupCol={groupCol}
          candidates={sortedCandidates}
          onNChange={setN}
          onGroupColChange={setGroupCol}
        />
        {data && (
          <Badge variant="secondary">
            Showing {data.items.length.toLocaleString()} of {data.total.toLocaleString()}
          </Badge>
        )}
      </div>

      {/* Chart */}
      <div ref={containerRef} className="relative w-full">
        {isLoading && <Skeleton className="h-[600px] w-full rounded-lg" />}

        {error && (
          <div className="flex h-[400px] items-center justify-center text-sm text-destructive">
            Failed to load chart data.
          </div>
        )}

        {!isLoading && !error && data && (
          <svg
            width={size.width}
            height={size.height}
            style={{ display: 'block' }}
            onMouseLeave={() => setTooltip(null)}
          >
            {/* Category circle backgrounds — drawn first so product circles paint over them */}
            {categoryCircles.map((c, i) => {
              const name = (c.data as DataNode).name ?? '';
              const color = catColorMap.get(name) ?? PALETTE[0];
              return (
                <circle key={`cat-${i}`} cx={c.x} cy={c.y} r={c.r} fill={color} fillOpacity={0.13} stroke={color} strokeWidth={2} />
              );
            })}

            {/* Product circles */}
            {productCircles.map((c, i) => {
              const item = c.data as DataNode;
              const catName = hierarchical ? (item.category || 'Uncategorised') : null;
              const color = catName ? (catColorMap.get(catName) ?? PALETTE[0]) : PALETTE[i % PALETTE.length];
              return (
                <circle
                  key={`prod-${i}`}
                  cx={c.x} cy={c.y} r={Math.max(c.r, 1)}
                  fill={color} fillOpacity={0.85} stroke="white" strokeWidth={0.5}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={(e) => setTooltip({ x: e.clientX, y: e.clientY, title: item.title ?? '', value: item.value ?? 0 })}
                  onMouseMove={(e) => setTooltip((prev) => prev ? { ...prev, x: e.clientX, y: e.clientY } : null)}
                  onMouseLeave={() => setTooltip(null)}
                />
              );
            })}

            {/* Category labels — rendered last so they always appear above product circles */}
            {categoryCircles.map((c, i) => {
              if (c.r <= 24) return null;
              const name = (c.data as DataNode).name ?? '';
              const color = catColorMap.get(name) ?? PALETTE[0];
              const fontSize = Math.max(10, Math.min(15, c.r * 0.14));
              const label = name.length > 22 ? name.slice(0, 20) + '…' : name;
              const pillW = Math.min(label.length * fontSize * 0.62 + 12, c.r * 1.85);
              const pillH = fontSize + 8;
              return (
                <g key={`lbl-${i}`} style={{ pointerEvents: 'none' }}>
                  <rect
                    x={c.x - pillW / 2}
                    y={c.y - pillH / 2}
                    width={pillW}
                    height={pillH}
                    rx={pillH / 2}
                    fill={color}
                    fillOpacity={0.92}
                  />
                  <text
                    x={c.x}
                    y={c.y + fontSize * 0.35}
                    textAnchor="middle"
                    fontSize={fontSize}
                    fill={contrastColour(color)}
                    fontWeight={700}
                    fontFamily="sans-serif"
                  >
                    {label}
                  </text>
                </g>
              );
            })}
          </svg>
        )}

        {tooltip && (
          <div
            className="pointer-events-none fixed z-50 max-w-[220px] rounded border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md"
            style={{ left: tooltip.x + 14, top: tooltip.y - 10 }}
          >
            <div className="font-medium leading-tight">{tooltip.title}</div>
            {data?.valueLabel && (
              <div className="mt-0.5 text-muted-foreground">
                {tooltip.value.toLocaleString()} {data.valueLabel}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
