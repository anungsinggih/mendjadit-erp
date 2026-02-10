# 🚀 Saran Optimasi Performa - Ziyada MVP App

## 📊 Analisis Aplikasi Saat Ini

**Tech Stack:**
- React 19.2.0
- Vite 7.2.4
- Supabase (Database + Auth)
- TailwindCSS
- React Router DOM 7.12.0

**Komponen:** ~102 file TSX
**Ukuran:** Medium-scale business application

---

## 🎯 Rekomendasi Optimasi (Prioritas Tinggi ke Rendah)

### 1. ⚡ CODE SPLITTING & LAZY LOADING (CRITICAL)

**Masalah:** Semua komponen di-load sekaligus saat pertama kali akses
**Dampak:** Initial bundle size besar, First Contentful Paint lambat

**Solusi:**

```tsx
// src/App.tsx - Implementasi lazy loading
import { lazy, Suspense } from 'react'

// Lazy load halaman yang jarang diakses
const Reporting = lazy(() => import('./components/Reporting'))
const Inventory = lazy(() => import('./components/Inventory'))
const Finance = lazy(() => import('./components/Finance'))
const PurchaseDetail = lazy(() => import('./components/PurchaseDetail'))
const SalesDetail = lazy(() => import('./components/SalesDetail'))
const Items = lazy(() => import('./components/Items'))
const Customers = lazy(() => import('./components/Customers'))

// Loading component
const PageLoader = () => (
  <div className="flex items-center justify-center h-screen">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
  </div>
)

// Wrap routes dengan Suspense
<Suspense fallback={<PageLoader />}>
  <Routes>
    <Route path="/reporting" element={<Reporting />} />
    <Route path="/inventory" element={<Inventory />} />
    {/* ... */}
  </Routes>
</Suspense>
```

**Estimasi Improvement:** 40-60% reduction initial bundle size

---

### 2. 🗄️ REACT QUERY / TANSTACK QUERY (HIGH PRIORITY)

**Masalah:** Banyak `useEffect` + `useState` untuk data fetching, tidak ada caching

**Solusi:** Install React Query untuk:
- Automatic caching
- Background refetching
- Deduplication
- Stale-while-revalidate

```bash
npm install @tanstack/react-query
```

```tsx
// Example: SalesHistory.tsx
import { useQuery } from '@tanstack/react-query'

function SalesHistory() {
  const { data: sales, isLoading } = useQuery({
    queryKey: ['sales', startDate, endDate],
    queryFn: async () => {
      const { data } = await supabase
        .from('sales')
        .select('*')
        .gte('sale_date', startDate)
        .lte('sale_date', endDate)
      return data
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  })
  
  // No more manual loading states!
}
```

**Estimasi Improvement:** 
- 50-70% reduction in unnecessary API calls
- Better UX dengan instant cache hits

---

### 3. 🎨 MEMOIZATION (MEDIUM PRIORITY)

**Masalah:** Re-renders yang tidak perlu pada komponen besar

**Solusi:**

```tsx
// Wrap expensive components
import { memo } from 'react'

const SalesItemRow = memo(({ item, onDelete }) => {
  return (
    <TableRow>
      <TableCell>{item.name}</TableCell>
      {/* ... */}
    </TableRow>
  )
})

// Memoize expensive calculations
import { useMemo } from 'react'

function SalesEntryForm() {
  const itemsTotal = useMemo(() => {
    return lines.reduce((sum, line) => sum + line.subtotal, 0)
  }, [lines])
  
  const totalAmount = useMemo(() => {
    return itemsTotal - (discountAmount || 0) + (shippingFee || 0)
  }, [itemsTotal, discountAmount, shippingFee])
}

// Memoize callbacks
import { useCallback } from 'react'

const handleAddItem = useCallback((item) => {
  setLines(prev => [...prev, item])
}, [])
```

**Estimasi Improvement:** 20-30% reduction in re-renders

---

### 4. 🔍 VIRTUAL SCROLLING (MEDIUM PRIORITY)

**Masalah:** Render 1000+ rows di tabel inventory/sales history = lag

**Solusi:** Install `@tanstack/react-virtual`

```bash
npm install @tanstack/react-virtual
```

```tsx
// Example: InventoryList.tsx
import { useVirtualizer } from '@tanstack/react-virtual'

function InventoryList({ items }) {
  const parentRef = useRef(null)
  
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 50, // row height
    overscan: 5,
  })
  
  return (
    <div ref={parentRef} style={{ height: '600px', overflow: 'auto' }}>
      <div style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map(virtualRow => (
          <div
            key={virtualRow.index}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualRow.start}px)`,
            }}
          >
            <ItemRow item={items[virtualRow.index]} />
          </div>
        ))}
      </div>
    </div>
  )
}
```

**Estimasi Improvement:** 
- Render only visible rows (10-20 instead of 1000+)
- 80-90% faster scrolling

---

### 5. 📦 DATABASE INDEXING (HIGH PRIORITY)

**Masalah:** Query lambat pada tabel besar

**Solusi:** Tambah index di Supabase

```sql
-- Migration: 0113_add_performance_indexes.sql

-- Sales queries
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date DESC);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);
CREATE INDEX IF NOT EXISTS idx_sales_date_status ON sales(sale_date DESC, status);

-- Purchase queries
CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(purchase_date DESC);
CREATE INDEX IF NOT EXISTS idx_purchases_vendor ON purchases(vendor_id);
CREATE INDEX IF NOT EXISTS idx_purchases_status ON purchases(status);

-- Journal queries
CREATE INDEX IF NOT EXISTS idx_journals_date ON journals(journal_date DESC);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON journal_lines(account_id);

-- Inventory queries
CREATE INDEX IF NOT EXISTS idx_inventory_item ON inventory_history(item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_date ON inventory_history(trx_date DESC);

-- Items queries
CREATE INDEX IF NOT EXISTS idx_items_sku ON items(sku);
CREATE INDEX IF NOT EXISTS idx_items_active ON items(is_active);
```

**Estimasi Improvement:** 50-80% faster queries

---

### 6. 🎭 DEBOUNCING & THROTTLING (MEDIUM PRIORITY)

**Masalah:** Search/filter trigger terlalu sering

**Solusi:**

```tsx
import { useMemo } from 'react'

// Custom debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value)
  
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)
    
    return () => clearTimeout(handler)
  }, [value, delay])
  
  return debouncedValue
}

// Usage in search
function ItemsList() {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  
  const { data } = useQuery({
    queryKey: ['items', debouncedSearch],
    queryFn: () => fetchItems(debouncedSearch),
  })
}
```

**Estimasi Improvement:** 70-90% reduction in API calls during typing

---

### 7. 🖼️ IMAGE OPTIMIZATION (LOW PRIORITY)

**Masalah:** Upload gambar besar tanpa kompresi

**Solusi:** Sudah ada `browser-image-compression`, pastikan digunakan optimal

```tsx
import imageCompression from 'browser-image-compression'

const options = {
  maxSizeMB: 0.5,          // 500KB max
  maxWidthOrHeight: 1920,  // Full HD max
  useWebWorker: true,      // Use web worker untuk non-blocking
  fileType: 'image/webp',  // WebP lebih kecil dari JPEG
}

const compressedFile = await imageCompression(file, options)
```

---

### 8. 🔄 PAGINATION (MEDIUM PRIORITY)

**Masalah:** Load semua data sekaligus

**Solusi:** Implement server-side pagination

```tsx
// Example: SalesHistory.tsx
const PAGE_SIZE = 50

function SalesHistory() {
  const [page, setPage] = useState(1)
  
  const { data } = useQuery({
    queryKey: ['sales', page],
    queryFn: async () => {
      const from = (page - 1) * PAGE_SIZE
      const to = from + PAGE_SIZE - 1
      
      const { data, count } = await supabase
        .from('sales')
        .select('*', { count: 'exact' })
        .range(from, to)
        .order('sale_date', { ascending: false })
      
      return { data, count }
    },
  })
  
  const totalPages = Math.ceil((data?.count || 0) / PAGE_SIZE)
}
```

---

### 9. 🎯 BUNDLE ANALYSIS (ONE-TIME)

**Solusi:** Analyze bundle size

```bash
npm install -D rollup-plugin-visualizer
```

```ts
// vite.config.ts
import { visualizer } from 'rollup-plugin-visualizer'

export default defineConfig({
  plugins: [
    react(),
    visualizer({
      open: true,
      gzipSize: true,
      brotliSize: true,
    }),
  ],
})
```

Run `npm run build` untuk lihat bundle composition

---

### 10. 🚦 LOADING STATES & SKELETON (UX)

**Solusi:** Better loading experience

```tsx
// Skeleton component
function TableSkeleton() {
  return (
    <div className="animate-pulse space-y-2">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="h-12 bg-gray-200 rounded"></div>
      ))}
    </div>
  )
}

// Usage
function SalesHistory() {
  const { data, isLoading } = useQuery(...)
  
  if (isLoading) return <TableSkeleton />
  
  return <Table data={data} />
}
```

---

## 📈 Implementation Roadmap

### Phase 1: Quick Wins (1-2 hari)
1. ✅ Add database indexes
2. ✅ Implement debouncing on search
3. ✅ Add memoization to expensive components

### Phase 2: Core Improvements (3-5 hari)
4. ✅ Implement React Query
5. ✅ Add code splitting & lazy loading
6. ✅ Add pagination

### Phase 3: Advanced (1 minggu)
7. ✅ Implement virtual scrolling
8. ✅ Optimize images
9. ✅ Bundle analysis & optimization

---

## 🎯 Expected Results

**Before Optimization:**
- Initial Load: ~3-5s
- Time to Interactive: ~4-6s
- Bundle Size: ~800KB-1.2MB
- API Calls per page: 5-10

**After Optimization:**
- Initial Load: ~1-2s (50-60% faster)
- Time to Interactive: ~2-3s (40-50% faster)
- Bundle Size: ~300-500KB (60-70% smaller)
- API Calls per page: 1-3 (70-80% reduction)

---

## 💡 Monitoring & Metrics

Install Lighthouse CI atau Web Vitals untuk tracking:

```bash
npm install web-vitals
```

```tsx
// src/reportWebVitals.ts
import { onCLS, onFID, onFCP, onLCP, onTTFB } from 'web-vitals'

function sendToAnalytics(metric) {
  console.log(metric)
  // Send to analytics service
}

onCLS(sendToAnalytics)
onFID(sendToAnalytics)
onFCP(sendToAnalytics)
onLCP(sendToAnalytics)
onTTFB(sendToAnalytics)
```

---

## 🔧 Tools untuk Development

1. **React DevTools Profiler** - Detect unnecessary re-renders
2. **Chrome DevTools Performance** - Analyze runtime performance
3. **Lighthouse** - Overall performance score
4. **Bundle Analyzer** - Visualize bundle composition

---

## ✅ Checklist Implementasi

- [ ] Setup React Query
- [ ] Add lazy loading untuk routes
- [ ] Add database indexes
- [ ] Implement debouncing
- [ ] Add memoization
- [ ] Add pagination
- [ ] Add virtual scrolling (optional)
- [ ] Optimize images
- [ ] Add loading skeletons
- [ ] Run bundle analysis
- [ ] Measure Web Vitals

---

**Prioritas Tertinggi untuk Mulai:**
1. Database Indexing (paling mudah, impact besar)
2. React Query (fundamental improvement)
3. Code Splitting (reduce initial load)
