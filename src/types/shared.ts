export type Item = {
    id: string;
    name: string;
    sku: string;
    type: string;
    uom: string; // ID or name depending on context, normalized to string usually
    price_default: number;
    price_khusus: number;
    default_price_buy?: number; // Cost price

    // Virtual / Joined fields
    size_name?: string;
    color_name?: string;
    display_label?: string; // Pre-computed label for dropdowns
    stock_qty?: number;

    // Master Data Fields (Optional for transactions, required for Master Management)
    min_stock?: number;
    is_active?: boolean;
    brand?: { name: string };
    category?: { name: string };
    // Enhanced relations for Master Data
    uom_detail?: { name: string; code: string }; // Renamed to avoid conflict with 'uom' string
    size?: { name: string; code: string };
    color?: { name: string; code: string };
    // IDs for editing
    uom_id?: string;
    size_id?: string;
    color_id?: string;
    brand_id?: string;
    category_id?: string;
};

export type Customer = {
    id: string;
    name: string;
    phone?: string | null;
    address?: string | null;
    customer_type: 'UMUM' | 'KHUSUS' | 'CUSTOM' | string;
    is_active: boolean;
    display_label?: string;
};

export type Vendor = {
    id: string;
    name: string;
    phone?: string | null;
    address?: string | null;
    is_active: boolean;
    vendor_type?: 'SUPPLIER' | 'KONVEKSI' | 'INTERNAL' | string;
};
