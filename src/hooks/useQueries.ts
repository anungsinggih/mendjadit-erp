import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { supabase } from "../supabaseClient"
import type { Item, Customer, Vendor } from "../types/shared"

type Range = [number, number]

export function useItemsQuery(params: {
  range: Range
  search: string
  typeFilter: string
}) {
  const { range, search, typeFilter } = params
  return useQuery({
    queryKey: ["items", range[0], range[1], search, typeFilter],
    queryFn: async () => {
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
          `,
          { count: "exact" }
        )

      if (search) {
        query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%`)
      }

      if (typeFilter !== "all") {
        query = query.eq("type", typeFilter)
      }

      const { data, error, count } = await query
        .order("sku", { ascending: true })
        .range(range[0], range[1])

      if (error) throw error

      return { items: (data || []) as Item[], count: count || 0 }
    },
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
  range: Range
  search: string
  typeFilter: string
  refreshTrigger?: number
}) {
  const { range, search, typeFilter, refreshTrigger } = params
  return useQuery({
    queryKey: ["inventory", range[0], range[1], search, typeFilter, refreshTrigger],
    queryFn: async () => {
      let query = supabase
        .from("items")
        .select(
          "id, sku, name, uom, sizes(name), colors(name), inventory_stock(qty_on_hand, avg_cost)",
          { count: "exact" }
        )
        .eq("is_active", true)

      if (search) {
        query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%`)
      }

      if (typeFilter !== "ALL") {
        query = query.eq("type", typeFilter)
      }

      const { data, error, count } = await query
        .order("name")
        .range(range[0], range[1])

      if (error) throw error

      const formatted =
        (data || []).map(d => ({
          ...d,
          size_name: (d.sizes as unknown as { name: string } | null)?.name,
          color_name: (d.colors as unknown as { name: string } | null)?.name,
          inventory_stock: Array.isArray(d.inventory_stock) ? d.inventory_stock[0] : d.inventory_stock
        })) || []

      return { items: formatted as InventoryQueryItem[], count: count || 0 }
    },
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
  const { range, search, statusFilter, termsFilter, dateFrom, dateTo } = params
  return useQuery({
    queryKey: ["sales-history", range[0], range[1], search, statusFilter, termsFilter, dateFrom, dateTo],
    queryFn: async () => {
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
          `,
          { count: "exact" }
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
      if (search.trim()) {
        const q = search.trim()
        query = query.or(`sales_no.ilike.%${q}%,customers.name.ilike.%${q}%`)
      }

      query = query.range(range[0], range[1])

      const { data, error, count } = await query
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

      return { items: enriched as SalesRecord[], count: count || 0 }
    },
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
  const { range, search, statusFilter, termsFilter, dateFrom, dateTo } = params
  return useQuery({
    queryKey: ["purchase-history", range[0], range[1], search, statusFilter, termsFilter, dateFrom, dateTo],
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
          `,
          { count: "exact" }
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
      if (search.trim()) {
        const q = search.trim()
        query = query.or(`purchase_no.ilike.%${q}%,vendors.name.ilike.%${q}%`)
      }

      query = query.range(range[0], range[1])

      const { data, error, count } = await query
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

      return { items: enriched as PurchaseRecord[], count: count || 0 }
    },
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
