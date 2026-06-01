import { keepPreviousData, useQuery, type QueryClient } from "@tanstack/react-query"
import { useQueryClient } from "@tanstack/react-query"
import { supabase } from "../supabaseClient"
import type { Item, Customer, Vendor } from "../types/shared"

type Range = [number, number]
type NamedRelation = { name: string }
type NamedCodeRelation = { name: string; code: string }

function toFiniteNumber(value: unknown, fallback = 0) {
  const nextValue = Number(value)
  return Number.isFinite(nextValue) ? nextValue : fallback
}

function toSingleRelation<T>(value: T | T[] | null | undefined): T | undefined {
  if (Array.isArray(value)) {
    return value[0]
  }

  return value ?? undefined
}

export function useItemsQuery(params: {
  range: Range
  typeFilter: string
}) {
  const { range, typeFilter } = params
  return useQuery({
    queryKey: ["items", typeFilter],
    queryFn: async () => {
      // Fetch ALL items for this typeFilter — client-side search handles filtering
      let query = supabase
        .from("items")
        .select(
          `
            *,
            brand:brands(name),
            category:categories(name),
            uom_detail:uoms(name, code),
            size:sizes(name, code),
            color:colors(name, code)
          `
        )

      if (typeFilter !== "all") {
        query = query.eq("type", typeFilter)
      }

      const { data, error } = await query.order("sku", { ascending: true })

      if (error) throw error

      const normalizedItems = (data || []).map((rawItem) => {
        const item = rawItem as Item & {
          price_default?: unknown
          price_khusus?: unknown
          default_price_buy?: unknown
          min_stock?: unknown
          brand?: NamedRelation | NamedRelation[] | null
          category?: NamedRelation | NamedRelation[] | null
          uom_detail?: NamedCodeRelation | NamedCodeRelation[] | null
          size?: NamedCodeRelation | NamedCodeRelation[] | null
          color?: NamedCodeRelation | NamedCodeRelation[] | null
        }

        return {
          ...item,
          price_default: toFiniteNumber(item.price_default),
          price_khusus: toFiniteNumber(item.price_khusus),
          default_price_buy: toFiniteNumber(item.default_price_buy),
          min_stock: toFiniteNumber(item.min_stock),
          is_active: item.is_active ?? true,
          brand: toSingleRelation(item.brand),
          category: toSingleRelation(item.category),
          uom_detail: toSingleRelation(item.uom_detail),
          size: toSingleRelation(item.size),
          color: toSingleRelation(item.color),
        }
      })

      return normalizedItems as Item[]
    },
    staleTime: 30_000,
    placeholderData: keepPreviousData
  })
}

export type InventoryQueryItem = {
  id: string
  sku: string
  name: string
  uom: string
  category_id?: string
  size_name?: string
  color_name?: string
  inventory_stock?: {
    qty_on_hand: number
    avg_cost: number
  }
}

export function useInventoryQuery(params: {
  typeFilter: string
  refreshTrigger?: number
}) {
  const { typeFilter, refreshTrigger } = params
  return useQuery({
    queryKey: ["inventory", typeFilter, refreshTrigger],
    queryFn: async () => {
      // Fetch ALL active items — client-side search handles filtering
      let query = supabase
        .from("items")
        .select(
          "id, sku, name, uom, sizes(name), colors(name), inventory_stock(qty_on_hand, avg_cost)"
        )
        .eq("is_active", true)

      if (typeFilter !== "ALL") {
        query = query.eq("type", typeFilter)
      }

      const { data, error } = await query.order("name")

      if (error) throw error

      const formatted = (data || []).map(d => ({
        ...d,
        size_name: (d.sizes as unknown as { name: string } | null)?.name,
        color_name: (d.colors as unknown as { name: string } | null)?.name,
        inventory_stock: Array.isArray(d.inventory_stock) ? d.inventory_stock[0] : d.inventory_stock
      }))

      return formatted as InventoryQueryItem[]
    },
    staleTime: 30_000,
    placeholderData: keepPreviousData
  })
}

export function useCustomersQuery() {
  return useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .order("name", { ascending: true })
      if (error) throw error
      return (data as Customer[]) || []
    }
  })
}

export function useCustomerOutstandingQuery() {
  return useQuery({
    queryKey: ["customers-outstanding"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ar_invoices")
        .select("outstanding_amount,status")
      if (error) throw error
      const sum = (data || [])
        .filter((row: { status: string }) => row.status !== "PAID")
        .reduce(
          (acc: number, row: { outstanding_amount: number | null }) =>
            acc + (row.outstanding_amount || 0),
          0
        )
      return sum
    }
  })
}

export function useVendorsQuery() {
  return useQuery({
    queryKey: ["vendors"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendors")
        .select("*")
        .order("name", { ascending: true })
      if (error) throw error
      return (data as Vendor[]) || []
    }
  })
}

export function useVendorOutstandingQuery() {
  return useQuery({
    queryKey: ["vendors-outstanding"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ap_bills")
        .select("outstanding_amount,status")
      if (error) throw error
      const sum = (data || [])
        .filter((row: { status: string }) => row.status !== "PAID")
        .reduce(
          (acc: number, row: { outstanding_amount: number | null }) =>
            acc + (row.outstanding_amount || 0),
          0
        )
      return sum
    }
  })
}

type SalesRecord = {
  id: string
  sales_date: string
  sales_no: string | null
  customer_id: string
  customer_name: string
  customer_type: string
  terms: "CASH" | "CREDIT"
  total_amount: number
  payment_method_code?: string | null
  ar_outstanding?: number | null
  status: "DRAFT" | "POSTED" | "VOID"
  created_at: string
}

export function useSalesHistoryQuery(params: {
  range: Range
  search: string
  statusFilter: string
  termsFilter: string
  dateFrom: string
  dateTo: string
}) {
  const { range, statusFilter, termsFilter, dateFrom, dateTo } = params
  return useQuery({
    // search excluded from queryKey — filtering done client-side
    queryKey: ["sales-history", statusFilter, termsFilter, dateFrom, dateTo],
    queryFn: async () => {
      // Fetch ALL matching records for the given status/terms/date filters
      // search is handled client-side for instant results
      let query = supabase
        .from("sales")
        .select(
          `
            id,
            sales_date,
            sales_no,
            customer_id,
            terms,
            payment_method_code,
            total_amount,
            status,
            created_at,
            customers (
              name,
              customer_type
            ),
            ar_invoices (
              outstanding_amount
            )
          `
        )
        .order("sales_date", { ascending: false })
        .order("created_at", { ascending: false })

      if (statusFilter !== "ALL") {
        query = query.eq("status", statusFilter)
      }
      if (termsFilter !== "ALL") {
        query = query.eq("terms", termsFilter)
      }
      if (dateFrom) {
        query = query.gte("sales_date", dateFrom)
      }
      if (dateTo) {
        query = query.lte("sales_date", dateTo)
      }

      const { data, error } = await query
      if (error) throw error

      const enriched =
        data?.map((sale) => {
          const customer = sale.customers as unknown as { name?: string; customer_type?: string } | undefined
          const arInvoice = Array.isArray(sale.ar_invoices)
            ? (sale.ar_invoices[0] as { outstanding_amount?: number } | undefined)
            : (sale.ar_invoices as { outstanding_amount?: number } | undefined)
          return {
            ...sale,
            customer_name: customer?.name || "Unknown",
            customer_type: customer?.customer_type || "UMUM",
            ar_outstanding: arInvoice?.outstanding_amount ?? null
          }
        }) || []

      return enriched as SalesRecord[]
    },
    staleTime: 30_000,
    placeholderData: keepPreviousData
  })
}

export function useSalesReturnDraftCountQuery() {
  return useQuery({
    queryKey: ["sales-return-draft-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("sales_returns")
        .select("id", { count: "exact", head: true })
        .eq("status", "DRAFT")
      if (error) throw error
      return count || 0
    },
    initialData: 0
  })
}

type PurchaseRecord = {
  id: string
  purchase_date: string
  purchase_no: string | null
  vendor_id: string
  vendor_name: string
  terms: "CASH" | "CREDIT"
  total_amount: number
  payment_method_code?: string | null
  ap_outstanding?: number | null
  status: "DRAFT" | "POSTED" | "VOID"
  created_at: string
}

export function usePurchaseHistoryQuery(params: {
  range: Range
  search: string
  statusFilter: string
  termsFilter: string
  dateFrom: string
  dateTo: string
}) {
  const { statusFilter, termsFilter, dateFrom, dateTo } = params
  return useQuery({
    // search excluded from queryKey — filtering done client-side
    queryKey: ["purchase-history", statusFilter, termsFilter, dateFrom, dateTo],
    queryFn: async () => {
      let query = supabase
        .from("purchases")
        .select(
          `
            id,
            purchase_date,
            purchase_no,
            vendor_id,
            terms,
            payment_method_code,
            total_amount,
            status,
            created_at,
            vendors (
              name
            ),
            ap_bills (
              outstanding_amount
            )
          `
        )
        .order("purchase_date", { ascending: false })
        .order("created_at", { ascending: false })

      if (statusFilter !== "ALL") {
        query = query.eq("status", statusFilter)
      }
      if (termsFilter !== "ALL") {
        query = query.eq("terms", termsFilter)
      }
      if (dateFrom) {
        query = query.gte("purchase_date", dateFrom)
      }
      if (dateTo) {
        query = query.lte("purchase_date", dateTo)
      }

      const { data, error } = await query
      if (error) throw error

      const enriched =
        data?.map((purchase) => {
          const vendor = purchase.vendors as unknown as { name?: string } | undefined
          const apBill = Array.isArray(purchase.ap_bills)
            ? (purchase.ap_bills[0] as { outstanding_amount?: number } | undefined)
            : (purchase.ap_bills as { outstanding_amount?: number } | undefined)
          return {
            ...purchase,
            vendor_name: vendor?.name || "Unknown",
            ap_outstanding: apBill?.outstanding_amount ?? null
          }
        }) || []

      return enriched as PurchaseRecord[]
    },
    staleTime: 30_000,
    placeholderData: keepPreviousData
  })
}

export function usePurchaseReturnDraftCountQuery() {
  return useQuery({
    queryKey: ["purchase-return-draft-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("purchase_returns")
        .select("id", { count: "exact", head: true })
        .eq("status", "DRAFT")
      if (error) throw error
      return count || 0
    },
    initialData: 0
  })
}

type SalesReturnRecord = {
  id: string
  return_date: string
  sales_id: string
  sales_no: string | null
  customer_name: string
  total_amount: number
  status: "DRAFT" | "POSTED" | "VOID"
  created_at: string
  return_no?: string
}

export function useSalesReturnHistoryQuery() {
  return useQuery({
    queryKey: ["sales-returns-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_returns")
        .select(
          `
            id,
            return_date,
            sales_id,
            total_amount,
            status,
            created_at,
            sales!sales_id (
              sales_no,
              customers (
                name
              )
            )
            , return_no
          `
        )
        .order("return_date", { ascending: false })
        .order("created_at", { ascending: false })

      if (error) throw error

      const enriched =
        data?.map(ret => ({
          ...ret,
          sales_no: (ret.sales as unknown as { sales_no: string })?.sales_no || "N/A",
          customer_name: (ret.sales as unknown as { customers: { name: string } })?.customers?.name || "Unknown",
          return_no: ret.return_no || ret.id.substring(0, 8)
        })) || []

      return enriched as SalesReturnRecord[]
    }
  })
}

type PurchaseReturnRecord = {
  id: string
  return_date: string
  purchase_id: string
  purchase_no: string | null
  vendor_name: string
  total_amount: number
  status: "DRAFT" | "POSTED" | "VOID"
  created_at: string
  return_no: string
}

export function usePurchaseReturnHistoryQuery() {
  return useQuery({
    queryKey: ["purchase-returns-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_returns")
        .select(
          `
            id,
            return_date,
            purchase_id,
            total_amount,
            status,
            created_at,
            purchases!purchase_id (
              purchase_no,
              vendors (
                name
              )
            )
            , return_no
          `
        )
        .order("return_date", { ascending: false })
        .order("created_at", { ascending: false })

      if (error) throw error

      const enriched =
        data?.map(ret => ({
          ...ret,
          purchase_no: (ret.purchases as unknown as { purchase_no: string })?.purchase_no || "N/A",
          vendor_name: (ret.purchases as unknown as { vendors: { name: string } })?.vendors?.name || "Unknown",
          return_no: ret.return_no || ret.id.substring(0, 8)
        })) || []

      return enriched as PurchaseReturnRecord[]
    }
  })
}

// ============================================================
// Detail Query Hooks — with parallel fetching & prefetch support
// ============================================================

// ---------- Sales Detail ----------

export type SalesDetailData = {
  sale: {
    id: string
    sales_date: string
    sales_no: string | null
    customer_id: string
    customer_name: string
    customer_type: string
    terms: "CASH" | "CREDIT"
    payment_method_code?: string | null
    total_amount: number
    shipping_fee?: number
    discount_amount?: number
    status: "DRAFT" | "POSTED" | "VOID"
    notes?: string
    created_at: string
  }
  items: {
    id: string
    item_id: string
    item_name: string
    sku: string
    size_name?: string
    color_name?: string
    uom_snapshot: string
    qty: number
    unit_price: number
    subtotal: number
  }[]
  relatedDocs: {
    journal_id?: string
    journal_date?: string
    receipt_id?: string
    receipt_amount?: number
    ar_invoice_id?: string
    ar_total?: number
    ar_outstanding?: number
    ar_status?: string
  }
  returns: {
    id: string
    return_date: string
    total_amount: number
    status: "DRAFT" | "POSTED" | "VOID"
    return_no?: string | null
  }[]
}

async function fetchSalesDetailData(saleId: string): Promise<SalesDetailData> {
  // --- 1. Parallel: header + items + returns ---
  const [headerResult, itemsResult, returnsResult] = await Promise.all([
    supabase
      .from("sales")
      .select(`id, sales_date, sales_no, customer_id, terms, payment_method_code, total_amount, shipping_fee, discount_amount, status, notes, created_at, customers ( name, customer_type )`)
      .eq("id", saleId)
      .single(),
    supabase
      .from("sales_items")
      .select(`id, item_id, qty, unit_price, subtotal, uom_snapshot, items ( name, sku, price_default, price_khusus, sizes ( name ), colors ( name ) )`)
      .eq("sales_id", saleId),
    supabase
      .from("sales_returns")
      .select("id, return_date, total_amount, status, return_no")
      .eq("sales_id", saleId)
      .order("return_date", { ascending: false })
      .order("created_at", { ascending: false }),
  ])

  if (headerResult.error) throw headerResult.error
  if (itemsResult.error) throw itemsResult.error
  if (returnsResult.error) throw returnsResult.error

  const saleData = headerResult.data
  const customer = saleData.customers as unknown as { name?: string; customer_type?: string }

  // --- 2. Conditional: custom prices for DRAFT + CUSTOM customer ---
  let customPriceMap: Record<string, number> = {}
  if (saleData.status === "DRAFT" && customer?.customer_type === "CUSTOM") {
    const { data: priceData } = await supabase
      .from("customer_item_prices")
      .select("item_id, price")
      .eq("customer_id", saleData.customer_id)
      .eq("is_active", true)
    customPriceMap = (priceData || []).reduce((acc, row) => {
      acc[row.item_id as string] = Number(row.price)
      return acc
    }, {} as Record<string, number>)
  }

  // Normalize items
  const customerType = customer?.customer_type || "UMUM"
  const normalizedItems = (itemsResult.data || []).map((item) => {
    const iData = item.items as unknown as {
      name?: string; sku?: string; price_default?: number | null; price_khusus?: number | null
      sizes?: { name: string }; colors?: { name: string }
    }
    const basePrice = Number(iData?.price_default || 0)
    const khususPrice = Number(iData?.price_khusus || basePrice)
    let nextPrice = Number(item.unit_price)
    if (saleData.status === "DRAFT") {
      if (customerType === "CUSTOM") nextPrice = customPriceMap[item.item_id] ?? basePrice
      else if (customerType === "KHUSUS") nextPrice = khususPrice
      else nextPrice = basePrice
    }
    return {
      ...item,
      unit_price: nextPrice,
      subtotal: item.qty * nextPrice,
      item_name: iData?.name || "Unknown",
      sku: iData?.sku || "",
      size_name: iData?.sizes?.name || undefined,
      color_name: iData?.colors?.name || undefined,
    }
  })

  // Merge duplicate lines
  const mergedMap = new Map<string, (typeof normalizedItems)[0]>()
  normalizedItems.forEach((item) => {
    const key = `${item.item_id}::${item.unit_price}`
    const existing = mergedMap.get(key)
    if (!existing) { mergedMap.set(key, { ...item }); return }
    mergedMap.set(key, { ...existing, qty: existing.qty + item.qty, subtotal: existing.subtotal + item.subtotal })
  })

  // --- 3. Conditional: related docs for POSTED ---
  const relatedDocs: SalesDetailData["relatedDocs"] = {}
  if (saleData.status === "POSTED") {
    const relatedPromises: PromiseLike<void>[] = []

    // Journal
    relatedPromises.push(
      supabase.from("journals").select("id, journal_date").eq("ref_type", "sales").eq("ref_id", saleId).single()
        .then(({ data }) => { if (data) { relatedDocs.journal_id = data.id; relatedDocs.journal_date = data.journal_date } })
    )

    // Receipt (CASH)
    if (saleData.terms === "CASH") {
      relatedPromises.push(
        supabase.from("receipts").select("id, amount").eq("ref_type", "sales").eq("ref_id", saleId).single()
          .then(({ data }) => { if (data) { relatedDocs.receipt_id = data.id; relatedDocs.receipt_amount = data.amount } })
      )
    }

    // AR (CREDIT)
    if (saleData.terms === "CREDIT") {
      relatedPromises.push(
        supabase.from("ar_invoices").select("id, total_amount, outstanding_amount, status").eq("sales_id", saleId).single()
          .then(({ data }) => { if (data) { relatedDocs.ar_invoice_id = data.id; relatedDocs.ar_total = data.total_amount; relatedDocs.ar_outstanding = data.outstanding_amount; relatedDocs.ar_status = data.status } })
      )
    }

    await Promise.all(relatedPromises)
  }

  return {
    sale: {
      ...saleData,
      customer_name: customer?.name || "Unknown",
      customer_type: customerType,
    },
    items: Array.from(mergedMap.values()),
    relatedDocs,
    returns: (returnsResult.data || []).map(ret => ({
      ...ret,
      return_no: ret.return_no || ret.id.substring(0, 8),
    })),
  }
}

export function useSalesDetailQuery(id: string | undefined) {
  return useQuery({
    queryKey: ["sales-detail", id],
    queryFn: () => fetchSalesDetailData(id!),
    enabled: !!id,
  })
}

export function prefetchSalesDetail(queryClient: QueryClient, id: string) {
  return queryClient.prefetchQuery({
    queryKey: ["sales-detail", id],
    queryFn: () => fetchSalesDetailData(id),
    staleTime: 30_000,
  })
}

// ---------- Purchase Detail ----------

export type PurchaseDetailData = {
  purchase: {
    id: string
    purchase_date: string
    purchase_no: string | null
    vendor_id: string
    vendor_name: string
    terms: "CASH" | "CREDIT"
    payment_method_code?: string | null
    total_amount: number
    discount_amount?: number
    status: "DRAFT" | "POSTED" | "VOID"
    notes?: string
    created_at: string
  }
  paymentMethodName: string | null
  items: {
    id: string
    item_id: string
    item_name: string
    sku: string
    size_name?: string
    color_name?: string
    uom_snapshot: string
    qty: number
    unit_cost: number
    subtotal: number
  }[]
  relatedDocs: {
    journal_id?: string
    journal_date?: string
    ap_bill_id?: string
    ap_total?: number
    ap_outstanding?: number
    ap_status?: string
    payment_id?: string
    payment_amount?: number
  }
  inventoryHistory: {
    item_id: string | null
    item_name: string | null
    sku: string | null
    size_name?: string | null
    color_name?: string | null
    qty_change: number | null
    trx_date: string | null
    ref_no: string | null
  }[]
  returns: {
    id: string
    return_date: string
    total_amount: number
    status: "DRAFT" | "POSTED" | "VOID"
    return_no?: string | null
  }[]
}

async function fetchPurchaseDetailData(purchaseId: string): Promise<PurchaseDetailData> {
  // --- 1. Parallel: header + items + returns ---
  const [headerResult, itemsResult, returnsResult] = await Promise.all([
    supabase
      .from("purchases")
      .select(`id, purchase_date, purchase_no, vendor_id, terms, payment_method_code, total_amount, discount_amount, status, notes, created_at, vendors ( name )`)
      .eq("id", purchaseId)
      .single(),
    supabase
      .from("purchase_items")
      .select(`id, item_id, qty, unit_cost, subtotal, uom_snapshot, items ( name, sku, sizes ( name ), colors ( name ) )`)
      .eq("purchase_id", purchaseId),
    supabase
      .from("purchase_returns")
      .select("id, return_date, total_amount, status, return_no")
      .eq("purchase_id", purchaseId)
      .order("return_date", { ascending: false })
      .order("created_at", { ascending: false }),
  ])

  if (headerResult.error) throw headerResult.error
  if (itemsResult.error) throw itemsResult.error
  if (returnsResult.error) throw returnsResult.error

  const purchaseData = headerResult.data
  const vendor = purchaseData.vendors as unknown as { name?: string }

  // --- 2. Payment method name (conditional) ---
  let paymentMethodName: string | null = null
  if (purchaseData.terms === "CASH" && purchaseData.payment_method_code) {
    const { data: methodData } = await supabase
      .from("payment_methods")
      .select("name")
      .eq("code", purchaseData.payment_method_code)
      .single()
    paymentMethodName = methodData?.name || purchaseData.payment_method_code
  }

  // Normalize items
  const mappedItems = (itemsResult.data || []).map(item => ({
    ...item,
    item_name: (item.items as unknown as { name: string })?.name || "Unknown",
    sku: (item.items as unknown as { sku: string })?.sku || "",
    size_name: (item.items as unknown as { sizes?: { name: string } })?.sizes?.name || undefined,
    color_name: (item.items as unknown as { colors?: { name: string } })?.colors?.name || undefined,
  }))

  // Merge duplicate lines
  const mergedItems = Object.values(
    mappedItems.reduce((acc, item) => {
      const key = `${item.item_id}-${item.unit_cost}`
      if (!acc[key]) { acc[key] = { ...item }; return acc }
      acc[key].qty += item.qty
      acc[key].subtotal += item.subtotal
      return acc
    }, {} as Record<string, (typeof mappedItems)[0]>)
  )

  // --- 3. Related docs + inventory history (POSTED only) ---
  const relatedDocs: PurchaseDetailData["relatedDocs"] = {}
  let inventoryHistory: PurchaseDetailData["inventoryHistory"] = []

  if (purchaseData.status === "POSTED") {
    const relatedPromises: PromiseLike<void>[] = []

    // Journal
    relatedPromises.push(
      supabase.from("journals").select("id, journal_date").eq("ref_type", "purchase").eq("ref_id", purchaseId).single()
        .then(({ data }) => { if (data) { relatedDocs.journal_id = data.id; relatedDocs.journal_date = data.journal_date } })
    )

    // AP Bill (CREDIT)
    if (purchaseData.terms === "CREDIT") {
      relatedPromises.push(
        supabase.from("ap_bills").select("id, total_amount, outstanding_amount, status").eq("purchase_id", purchaseId).single()
          .then(({ data }) => { if (data) { relatedDocs.ap_bill_id = data.id; relatedDocs.ap_total = data.total_amount; relatedDocs.ap_outstanding = data.outstanding_amount; relatedDocs.ap_status = data.status } })
      )
    }

    // Payment (CASH)
    if (purchaseData.terms === "CASH") {
      relatedPromises.push(
        supabase.from("payments").select("id, amount").eq("ref_type", "purchase").eq("ref_id", purchaseId).maybeSingle()
          .then(({ data }) => { if (data) { relatedDocs.payment_id = data.id; relatedDocs.payment_amount = data.amount } })
      )
    }

    await Promise.all(relatedPromises)

    // Inventory history (if no journal but has purchase_no)
    if (!relatedDocs.journal_id && purchaseData.purchase_no) {
      const { data: invData, error: invError } = await supabase
        .from("view_stock_card")
        .select("item_id, item_name, sku, qty_change, trx_date, ref_no")
        .eq("trx_type", "PURCHASE")
        .eq("ref_no", purchaseData.purchase_no)

      if (!invError && invData) {
        const ids = Array.from(new Set(invData.map(row => row.item_id).filter(Boolean) as string[]))
        if (ids.length > 0) {
          const { data: itemMeta } = await supabase.from("items").select("id, sizes(name), colors(name)").in("id", ids)
          const metaMap = new Map((itemMeta || []).map(row => [
            row.id,
            { size_name: (row.sizes as unknown as { name?: string } | null)?.name || null, color_name: (row.colors as unknown as { name?: string } | null)?.name || null }
          ]))
          inventoryHistory = invData.map(row => ({
            ...row,
            size_name: metaMap.get(row.item_id || "")?.size_name ?? null,
            color_name: metaMap.get(row.item_id || "")?.color_name ?? null,
          }))
        } else {
          inventoryHistory = invData as PurchaseDetailData["inventoryHistory"]
        }
      }
    }
  }

  return {
    purchase: {
      ...purchaseData,
      vendor_name: vendor?.name || "Unknown",
    },
    paymentMethodName,
    items: mergedItems,
    relatedDocs,
    inventoryHistory,
    returns: (returnsResult.data || []).map(ret => ({
      ...ret,
      return_no: ret.return_no || ret.id.substring(0, 8),
    })),
  }
}

export function usePurchaseDetailQuery(id: string | undefined) {
  return useQuery({
    queryKey: ["purchase-detail", id],
    queryFn: () => fetchPurchaseDetailData(id!),
    enabled: !!id,
  })
}

export function prefetchPurchaseDetail(queryClient: QueryClient, id: string) {
  return queryClient.prefetchQuery({
    queryKey: ["purchase-detail", id],
    queryFn: () => fetchPurchaseDetailData(id),
    staleTime: 30_000,
  })
}

// ───────────────────────────────────────────────────
// Sales Return Detail
// ───────────────────────────────────────────────────

type SalesReturnDetailData = {
  returnDoc: {
    id: string
    return_date: string
    sales_id: string
    sales_no: string
    customer_name: string
    total_amount: number
    status: string
    payment_method_code: string | null
    notes: string | null
    created_at: string
  }
  items: {
    id: string
    item_id: string
    item_name: string
    sku: string
    uom_snapshot: string
    qty: number
    unit_price: number
    subtotal: number
    cost_snapshot: number
  }[]
}

async function fetchSalesReturnDetailData(returnId: string): Promise<SalesReturnDetailData> {
  const [headerResult, itemsResult] = await Promise.all([
    supabase.from("sales_returns").select(`
      id, return_date, sales_id, total_amount, status, payment_method_code, notes, created_at,
      sales!sales_id ( sales_no, customers ( name ) )
    `).eq("id", returnId).single(),
    supabase.from("sales_return_items").select(`
      id, item_id, qty, unit_price, cost_snapshot, subtotal, uom_snapshot,
      items ( name, sku )
    `).eq("sales_return_id", returnId),
  ])

  if (headerResult.error) throw headerResult.error
  if (itemsResult.error) throw itemsResult.error

  const rd = headerResult.data
  const returnDoc = {
    ...rd,
    sales_no: (rd.sales as unknown as { sales_no: string })?.sales_no || "N/A",
    customer_name: (rd.sales as unknown as { customers: { name: string } })?.customers?.name || "Unknown",
  }

  const mapped = (itemsResult.data || []).map(item => ({
    ...item,
    item_name: (item.items as unknown as { name: string })?.name || "Unknown",
    sku: (item.items as unknown as { sku: string })?.sku || "",
  }))

  // Merge duplicates
  const map = new Map<string, SalesReturnDetailData["items"][0]>()
  mapped.forEach(row => {
    const key = `${row.item_id}::${row.unit_price}::${row.uom_snapshot}`
    const existing = map.get(key)
    if (!existing) { map.set(key, { ...row }); return }
    const totalQty = existing.qty + row.qty
    const weightedCost = totalQty > 0
      ? ((existing.cost_snapshot * existing.qty) + (row.cost_snapshot * row.qty)) / totalQty
      : existing.cost_snapshot
    map.set(key, { ...existing, qty: totalQty, subtotal: existing.subtotal + row.subtotal, cost_snapshot: Number(weightedCost.toFixed(4)) })
  })

  return { returnDoc, items: Array.from(map.values()) }
}

export function useSalesReturnDetailQuery(id: string | undefined) {
  return useQuery({
    queryKey: ["sales-return-detail", id],
    queryFn: () => fetchSalesReturnDetailData(id!),
    enabled: !!id,
  })
}

export function prefetchSalesReturnDetail(queryClient: QueryClient, id: string) {
  return queryClient.prefetchQuery({
    queryKey: ["sales-return-detail", id],
    queryFn: () => fetchSalesReturnDetailData(id),
    staleTime: 30_000,
  })
}

// ───────────────────────────────────────────────────
// Purchase Return Detail
// ───────────────────────────────────────────────────

type PurchaseReturnDetailData = {
  returnDoc: {
    id: string
    return_date: string
    purchase_id: string
    purchase_no: string
    vendor_name: string
    total_amount: number
    status: string
    payment_method_code: string | null
    notes: string | null
    created_at: string
  }
  items: {
    id: string
    item_id: string
    item_name: string
    sku: string
    uom_snapshot: string
    qty: number
    unit_cost: number
    subtotal: number
  }[]
}

async function fetchPurchaseReturnDetailData(returnId: string): Promise<PurchaseReturnDetailData> {
  const [headerResult, itemsResult] = await Promise.all([
    supabase.from("purchase_returns").select(`
      id, return_date, purchase_id, total_amount, status, payment_method_code, notes, created_at,
      purchases!purchase_id ( purchase_no, vendors ( name ) )
    `).eq("id", returnId).single(),
    supabase.from("purchase_return_items").select(`
      id, item_id, qty, unit_cost, subtotal, uom_snapshot,
      items ( name, sku )
    `).eq("purchase_return_id", returnId),
  ])

  if (headerResult.error) throw headerResult.error
  if (itemsResult.error) throw itemsResult.error

  const rd = headerResult.data
  const returnDoc = {
    ...rd,
    purchase_no: (rd.purchases as unknown as { purchase_no: string })?.purchase_no || "N/A",
    vendor_name: (rd.purchases as unknown as { vendors: { name: string } })?.vendors?.name || "Unknown",
  }

  const mapped = (itemsResult.data || []).map(item => ({
    ...item,
    item_name: (item.items as unknown as { name: string })?.name || "Unknown",
    sku: (item.items as unknown as { sku: string })?.sku || "",
  }))

  // Merge duplicates
  const map = new Map<string, PurchaseReturnDetailData["items"][0]>()
  mapped.forEach(row => {
    const key = `${row.item_id}::${row.unit_cost}::${row.uom_snapshot}`
    const existing = map.get(key)
    if (!existing) { map.set(key, { ...row }); return }
    const totalQty = existing.qty + row.qty
    const weightedCost = totalQty > 0
      ? ((existing.unit_cost * existing.qty) + (row.unit_cost * row.qty)) / totalQty
      : existing.unit_cost
    map.set(key, { ...existing, qty: totalQty, subtotal: existing.subtotal + row.subtotal, unit_cost: Number(weightedCost.toFixed(4)) })
  })

  return { returnDoc, items: Array.from(map.values()) }
}

export function usePurchaseReturnDetailQuery(id: string | undefined) {
  return useQuery({
    queryKey: ["purchase-return-detail", id],
    queryFn: () => fetchPurchaseReturnDetailData(id!),
    enabled: !!id,
  })
}

export function prefetchPurchaseReturnDetail(queryClient: QueryClient, id: string) {
  return queryClient.prefetchQuery({
    queryKey: ["purchase-return-detail", id],
    queryFn: () => fetchPurchaseReturnDetailData(id),
    staleTime: 30_000,
  })
}


export { useQueryClient }

// ─── Customer Detail ────────────────────────────────────────────────────────

async function fetchCustomerDetailData(customerId: string) {
  const [customerRes, salesRes, lifetimeRes, arRes] = await Promise.all([
    supabase
      .from("customers")
      .select("id,name,phone,address,customer_type,is_active")
      .eq("id", customerId)
      .single(),
    supabase
      .from("sales")
      .select("id,sales_no,sales_date,status,total_amount")
      .eq("customer_id", customerId)
      .order("sales_date", { ascending: false })
      .limit(20),
    supabase
      .from("sales")
      .select("total_amount,status")
      .eq("customer_id", customerId)
      .eq("status", "POSTED"),
    supabase
      .from("ar_invoices")
      .select("outstanding_amount,status")
      .eq("customer_id", customerId),
  ])

  if (customerRes.error) throw customerRes.error
  if (salesRes.error) throw salesRes.error
  if (lifetimeRes.error) throw lifetimeRes.error

  const customer = customerRes.data
  const sales = (salesRes.data || []) as { id: string; sales_no: string | null; sales_date: string | null; status: string; total_amount: number | null }[]
  const lifetimeValue = (lifetimeRes.data || []).reduce(
    (sum: number, row: { total_amount: number | null }) => sum + (row.total_amount || 0),
    0
  )

  let outstanding: number | null = null
  if (!arRes.error) {
    outstanding = (arRes.data || [])
      .filter((row: { status: string }) => row.status !== "PAID")
      .reduce(
        (sum: number, row: { outstanding_amount: number | null }) => sum + (row.outstanding_amount || 0),
        0
      )
  }

  return { customer, sales, lifetimeValue, outstanding }
}

export function useCustomerDetailQuery(id: string | undefined) {
  return useQuery({
    queryKey: ["customer-detail", id],
    queryFn: () => fetchCustomerDetailData(id!),
    enabled: !!id,
  })
}

export function prefetchCustomerDetail(queryClient: QueryClient, id: string) {
  return queryClient.prefetchQuery({
    queryKey: ["customer-detail", id],
    queryFn: () => fetchCustomerDetailData(id),
    staleTime: 30_000,
  })
}

// ─── Vendor Detail ──────────────────────────────────────────────────────────

async function fetchVendorDetailData(vendorId: string) {
  const [vendorRes, purchasesRes, lifetimeRes, apRes] = await Promise.all([
    supabase
      .from("vendors")
      .select("id,name,phone,address,is_active,vendor_type")
      .eq("id", vendorId)
      .single(),
    supabase
      .from("purchases")
      .select("id,purchase_no,purchase_date,status,total_amount")
      .eq("vendor_id", vendorId)
      .order("purchase_date", { ascending: false })
      .limit(20),
    supabase
      .from("purchases")
      .select("total_amount,status")
      .eq("vendor_id", vendorId)
      .eq("status", "POSTED"),
    supabase
      .from("ap_bills")
      .select("outstanding_amount,status")
      .eq("vendor_id", vendorId),
  ])

  if (vendorRes.error) throw vendorRes.error
  if (purchasesRes.error) throw purchasesRes.error
  if (lifetimeRes.error) throw lifetimeRes.error

  const vendor = vendorRes.data
  const purchases = (purchasesRes.data || []) as { id: string; purchase_no: string | null; purchase_date: string | null; status: string; total_amount: number | null }[]
  const lifetimeValue = (lifetimeRes.data || []).reduce(
    (sum: number, row: { total_amount: number | null }) => sum + (row.total_amount || 0),
    0
  )

  let outstanding: number | null = null
  if (!apRes.error) {
    outstanding = (apRes.data || [])
      .filter((row: { status: string }) => row.status !== "PAID")
      .reduce(
        (sum: number, row: { outstanding_amount: number | null }) => sum + (row.outstanding_amount || 0),
        0
      )
  }

  return { vendor, purchases, lifetimeValue, outstanding }
}

export function useVendorDetailQuery(id: string | undefined) {
  return useQuery({
    queryKey: ["vendor-detail", id],
    queryFn: () => fetchVendorDetailData(id!),
    enabled: !!id,
  })
}

export function prefetchVendorDetail(queryClient: QueryClient, id: string) {
  return queryClient.prefetchQuery({
    queryKey: ["vendor-detail", id],
    queryFn: () => fetchVendorDetailData(id),
    staleTime: 30_000,
  })
}
