import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Badge } from '../ui/badge';
import AppHeader from '../components/layout/AppHeader';
import UploadDropzone from '../components/feed/UploadDropzone';
import ShopifyFetcher from '../components/feed/ShopifyFetcher';
import { useWorkflowStore } from '../store/workflowStore';
import type { FeedSourceType } from '../store/workflowStore';

// Feed tab sections (lazy-imported to keep initial bundle small)
import { lazy, Suspense, useState } from 'react';
import { Skeleton } from '../ui/skeleton';

const ColumnPicker = lazy(() => import('../components/feed/ColumnPicker'));
const FiltersPanel = lazy(() => import('../components/feed/FiltersPanel'));
const ProductGroups = lazy(() => import('../components/feed/ProductGroups'));
const ColourSummary = lazy(() => import('../components/feed/ColourSummary'));
const ColourMapping = lazy(() => import('../components/feed/ColourMapping'));
const CategoryExtraction = lazy(() => import('../components/feed/CategoryExtraction'));
const NormalisedFeedPreview = lazy(() => import('../components/feed/NormalisedFeedPreview'));

const PackChart = lazy(() => import('../components/visualise/PackChart'));

const KeywordBuilder = lazy(() => import('../components/keywords/KeywordBuilder'));
const KeywordCombined = lazy(() => import('../components/keywords/KeywordCombined'));
const NormalisedFeedMini = lazy(() => import('../components/feed/NormalisedFeedMini'));

const GadsConfig = lazy(() => import('../components/gads/GadsConfig'));
const GadsResults = lazy(() => import('../components/gads/GadsResults'));
const GadsCharts = lazy(() => import('../components/gads/GadsCharts'));

function SectionFallback() {
  return (
    <div className="space-y-2 p-4">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  );
}

type TabValue = 'feed' | 'keywords' | 'gads' | 'visualise';

export default function WorkflowPage() {
  const { rawDfBlobUrl, productCount, fileName, feedSourceType, setFeedSource, resetSession } = useWorkflowStore();
  const hasFile = !!rawDfBlobUrl;
  const [activeTab, setActiveTab] = useState<TabValue>('feed');

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main className="mx-auto max-w-screen-xl px-6 py-6">
        {/* Source selection + input — shown until a feed is loaded */}
        {!hasFile && (
          <div className="mx-auto max-w-lg py-16">
            <h2 className="mb-2 text-center text-lg font-semibold">Get started</h2>
            <p className="mb-6 text-center text-sm text-muted-foreground">
              Choose your product data source below.
            </p>

            {/* Source toggle */}
            <div className="mb-6 flex rounded-lg border border-input overflow-hidden text-sm font-medium">
              {(
                [
                  { value: 'merchant_centre', label: 'Merchant Centre' },
                  { value: 'shopify', label: 'Shopify' },
                ] as { value: FeedSourceType; label: string }[]
              ).map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setFeedSource(value)}
                  className={[
                    'flex-1 py-2 px-4 transition-colors',
                    feedSourceType === value
                      ? 'bg-foreground text-background'
                      : 'bg-background text-muted-foreground hover:text-foreground',
                  ].join(' ')}
                >
                  {label}
                </button>
              ))}
            </div>

            {feedSourceType === 'shopify' ? <ShopifyFetcher /> : <UploadDropzone />}
          </div>
        )}

        {hasFile && (
          <>
            <div className="mb-4 flex items-center gap-3">
              <span className="text-sm text-muted-foreground">
                {fileName}
              </span>
              <Badge variant="secondary">
                {productCount.toLocaleString()} products
              </Badge>
              <button
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                onClick={() => resetSession()}
              >
                {feedSourceType === 'shopify' ? 'Use different store' : 'Upload different file'}
              </button>
            </div>

            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)}>
              <TabsList className="mb-6">
                <TabsTrigger value="feed">Feed</TabsTrigger>
                <TabsTrigger value="keywords">Keywords</TabsTrigger>
                <TabsTrigger value="gads">Google Ads</TabsTrigger>
                <TabsTrigger value="visualise">Visualise</TabsTrigger>
              </TabsList>

              {/* ── Feed tab ───────────────────────────────────────────── */}
              <TabsContent value="feed">
                <Suspense fallback={<SectionFallback />}>
                  <ColumnPicker />
                </Suspense>
                <Suspense fallback={<SectionFallback />}>
                  <FiltersPanel />
                </Suspense>
                <Suspense fallback={<SectionFallback />}>
                  <ProductGroups />
                </Suspense>
                <Suspense fallback={<SectionFallback />}>
                  <ColourSummary />
                </Suspense>
                <Suspense fallback={<SectionFallback />}>
                  <ColourMapping />
                </Suspense>
                <Suspense fallback={<SectionFallback />}>
                  <CategoryExtraction />
                </Suspense>
                <Suspense fallback={<SectionFallback />}>
                  <NormalisedFeedPreview onNext={() => setActiveTab('keywords')} />
                </Suspense>
              </TabsContent>

              {/* ── Keywords tab ───────────────────────────────────────── */}
              <TabsContent value="keywords">
                <Suspense fallback={null}>
                  <NormalisedFeedMini />
                </Suspense>
                <Suspense fallback={<SectionFallback />}>
                  <KeywordBuilder />
                </Suspense>
                <Suspense fallback={<SectionFallback />}>
                  <KeywordCombined onNext={() => setActiveTab('gads')} />
                </Suspense>
              </TabsContent>

              {/* ── Google Ads tab ─────────────────────────────────────── */}
              <TabsContent value="gads">
                <Suspense fallback={<SectionFallback />}>
                  <GadsConfig />
                </Suspense>
                <Suspense fallback={<SectionFallback />}>
                  <GadsResults />
                </Suspense>
                <Suspense fallback={<SectionFallback />}>
                  <GadsCharts />
                </Suspense>
              </TabsContent>

              {/* ── Visualise tab ──────────────────────────────────────── */}
              <TabsContent value="visualise">
                <Suspense fallback={<SectionFallback />}>
                  <PackChart />
                </Suspense>
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>
    </div>
  );
}
