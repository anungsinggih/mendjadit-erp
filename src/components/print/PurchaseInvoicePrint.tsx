import { type FunctionComponent } from 'react'

type PurchaseInvoicePrintProps = {
    data: {
        id: string
        purchase_no: string | null
        purchase_date: string
        vendor_name: string
        terms: string
        total_amount: number
        discount_amount?: number | null
        notes?: string | null
        payment_method_code?: string | null
    }
    items: Array<{
        id: string
        item_name: string
        size_name?: string
        color_name?: string
        unit_cost: number
        qty: number
        subtotal: number
    }>
    banks?: Array<{
        bank_name: string
        account_number: string
        account_holder: string
    }>
    company?: {
        name: string
        bank_name?: string
        bank_account?: string
        bank_holder?: string
    } | null
    visibleOnScreen?: boolean
    mode?: "print" | "image"
}

export const PurchaseInvoicePrint: FunctionComponent<PurchaseInvoicePrintProps> = ({ data, items, company, banks, visibleOnScreen = false, mode = "print" }) => {

    const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0)
    const diskon = data.discount_amount || 0
    const halfPageRows = 6
    const fullPageRows = 20
    const isImageMode = mode === "image"
    const useFullPage = items.length > halfPageRows
    const rowsPerPage = useFullPage ? fullPageRows : halfPageRows
    const pages = [] as typeof items[]
    if (isImageMode) {
        pages.push(items)
    } else {
        for (let i = 0; i < items.length; i += rowsPerPage) {
            pages.push(items.slice(i, i + rowsPerPage))
        }
    }
    if (pages.length === 0) pages.push([])
    const totalPages = pages.length
    const pageHeightClass = isImageMode
        ? (items.length > halfPageRows ? "" : "min-h-[147mm]")
        : (useFullPage ? "print:h-[297mm] min-h-[297mm]" : "print:h-[147mm] min-h-[147mm]")
    const padRows = !isImageMode && !useFullPage

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat("id-ID", {
            style: "currency",
            currency: "IDR",
            minimumFractionDigits: 2,
        }).format(val);
    }

    const safeDocNo = (no: string | null, id: string) => no || `PO-${id.substring(0, 8).toUpperCase()}`

    return (
        <>
            {/* --- PAGE SETUP --- */}
            <style>
                {`
                    @page {
                        size: A4 portrait;
                        margin: 0;
                    }
                    @media print {
                        html, body {
                            height: 100%;
                            width: 100%;
                            background-color: white;
                            margin: 0;
                            padding: 0;
                        }
                    }
                    body {
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                    }
                `}
            </style>
            {pages.map((pageItems, pageIndex) => {
                const isLastPage = pageIndex === totalPages - 1
                const showFooter = isImageMode || isLastPage
                return (
                    <div
                        key={pageIndex}
                        className={`${visibleOnScreen ? "block" : "hidden"} print:block print:w-[210mm] ${pageHeightClass} bg-white text-black relative overflow-hidden font-sans leading-tight`}
                        style={!isImageMode && pageIndex > 0 ? { pageBreakBefore: "always" } : undefined}
                    >
                        {/* --- DECORATIVE ACCENTS (Modern/Minimal) --- */}
                        {/* Right Side Accent Bar */}
                        <div className="absolute top-0 right-0 h-full w-2 bg-[#EE2E24] z-0"></div>
                        {/* Top Right Geometric */}
                        <div className="absolute top-0 right-2 w-24 h-24 bg-gradient-to-bl from-gray-100 to-transparent z-0 opacity-50"></div>

                        <div className="relative z-10 px-8 py-6 h-full flex flex-col justify-between">
                            {/* --- HEADER --- */}
                            <div className="flex justify-between items-start mb-4">
                                {/* Left: Brand Identity */}
                                <div className="w-1/2">
                                    <div className="flex flex-col">
                                        <div className="text-3xl font-black tracking-tight leading-none text-black italic">
                                            <span className="text-[#EE2E24]">M</span>ENDJAHIT
                                            <span className="text-gray-400 font-light not-italic ml-1 text-lg">konveksi</span>
                                        </div>
                                        <div className="text-[7px] font-bold tracking-[0.2em] text-[#EE2E24] uppercase mt-1 pl-1">
                                            Dare to be Different
                                        </div>
                                    </div>
                                    <div className="mt-4">
                                        <div className="text-[10px] font-bold text-gray-900 border-l-2 border-[#EE2E24] pl-2">
                                            PURCHASE ORDER
                                        </div>
                                        <div className="text-[9px] text-gray-500 pl-2 mt-0.5 font-mono">
                                            #{safeDocNo(data.purchase_no, data.id)}
                                        </div>
                                    </div>
                                </div>

                                {/* Right: Vendor & Meta Info */}
                                <div className="w-[40%] text-right pt-1">
                                    <div className="flex flex-col gap-2">
                                        <div>
                                            <div className="text-[7px] uppercase tracking-wider text-gray-500 font-bold mb-0.5">Kepada Yth</div>
                                            <div className="text-[10px] font-bold text-gray-900 uppercase">{data.vendor_name}</div>
                                        </div>
                                        <div className="flex justify-end gap-6 mt-1">
                                            <div>
                                                <div className="text-[7px] uppercase tracking-wider text-gray-500 font-bold mb-0.5">Tanggal</div>
                                                <div className="text-[9px] font-medium text-gray-900">
                                                    {new Date(data.purchase_date).toLocaleDateString("id-ID", { day: 'numeric', month: 'short', year: 'numeric' })}
                                                </div>
                                            </div>
                                            <div>
                                                <div className="text-[7px] uppercase tracking-wider text-gray-500 font-bold mb-0.5">Termin</div>
                                                <div className="text-[9px] font-medium text-gray-900 bg-gray-100 px-2 py-0.5 rounded">
                                                    {data.terms}
                                                </div>
                                            </div>
                                        </div>
                                        {!isImageMode && totalPages > 1 && (
                                            <div className="text-[7px] uppercase tracking-wider text-gray-400 font-semibold">
                                                Hal {pageIndex + 1}/{totalPages}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* --- TABLE --- */}
                            <div className="flex-grow">
                                <table className="w-full text-[9px] table-fixed">
                                    <thead>
                                        <tr className="border-b border-black/10">
                                            <th className="pb-2 text-left w-8 text-gray-500 font-bold text-[7px] uppercase tracking-wider">No</th>
                                            <th className="pb-2 text-left w-auto text-gray-500 font-bold text-[7px] uppercase tracking-wider">Produk</th>
                                            <th className="pb-2 text-center w-12 text-gray-500 font-bold text-[7px] uppercase tracking-wider">Size</th>
                                            <th className="pb-2 text-center w-16 text-gray-500 font-bold text-[7px] uppercase tracking-wider">Color</th>
                                            <th className="pb-2 text-center w-10 text-gray-500 font-bold text-[7px] uppercase tracking-wider">Qty</th>
                                            <th className="pb-2 text-right w-24 text-gray-500 font-bold text-[7px] uppercase tracking-wider">Harga Beli</th>
                                            <th className="pb-2 text-right w-28 text-gray-500 font-bold text-[7px] uppercase tracking-wider">Subtotal</th>
                                        </tr>
                                    </thead>
                                    <tbody className="align-top">
                                        {padRows ? (
                                            Array.from({ length: rowsPerPage }).map((_, i) => {
                                                const item = pageItems[i]
                                                const rowIndex = pageIndex * rowsPerPage + i
                                                return (
                                                    <tr key={i} className="border-b border-gray-50 last:border-0 h-6">
                                                        <td className="py-2 text-left text-gray-400 font-light">{item ? rowIndex + 1 : ''}</td>
                                                        <td className="py-2 text-left font-bold text-gray-900 uppercase truncate pr-2">{item ? item.item_name : ''}</td>
                                                        <td className="py-2 text-center text-gray-600 font-medium uppercase">{item ? (item.size_name || '-') : ''}</td>
                                                        <td className="py-2 text-center text-gray-600 font-medium uppercase">{item ? (item.color_name || '-') : ''}</td>
                                                        <td className="py-2 text-center font-bold text-gray-900">{item ? item.qty : ''}</td>
                                                        <td className="py-2 text-right text-gray-600 font-mono tracking-tight">{item ? formatCurrency(item.unit_cost).replace('Rp', '') : ''}</td>
                                                        <td className="py-2 text-right font-bold text-gray-900 font-mono tracking-tight">{item ? formatCurrency(item.subtotal).replace('Rp', '') : ''}</td>
                                                    </tr>
                                                )
                                            })
                                        ) : (
                                            pageItems.map((item, i) => {
                                                const rowIndex = pageIndex * rowsPerPage + i
                                                return (
                                                    <tr key={item.id || i} className="border-b border-gray-50 last:border-0 h-6">
                                                        <td className="py-2 text-left text-gray-400 font-light">{rowIndex + 1}</td>
                                                        <td className="py-2 text-left font-bold text-gray-900 uppercase truncate pr-2">{item.item_name}</td>
                                                        <td className="py-2 text-center text-gray-600 font-medium uppercase">{item.size_name || '-'}</td>
                                                        <td className="py-2 text-center text-gray-600 font-medium uppercase">{item.color_name || '-'}</td>
                                                        <td className="py-2 text-center font-bold text-gray-900">{item.qty}</td>
                                                        <td className="py-2 text-right text-gray-600 font-mono tracking-tight">{formatCurrency(item.unit_cost).replace('Rp', '')}</td>
                                                        <td className="py-2 text-right font-bold text-gray-900 font-mono tracking-tight">{formatCurrency(item.subtotal).replace('Rp', '')}</td>
                                                    </tr>
                                                )
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* --- FOOTER & TOTALS --- */}
                            <div className={`mt-2 pt-2 border-t-2 border-dashed border-gray-100 flex justify-between items-start ${showFooter ? "" : "invisible"}`}>
                                {/* Left: Bank Information Card */}
                                <div className="w-[50%]">
                                    <div className="text-[7px] text-gray-500 uppercase tracking-widest mb-1 font-bold">Transfer Pembayaran</div>
                                    <div className="flex flex-col gap-2">
                                        {banks && banks.length > 0 ? (
                                            banks.map((bank, index) => (
                                                <div key={index} className="bg-gray-50 rounded p-2 border border-gray-100 flex gap-3 items-center w-full">
                                                    <div className="bg-white p-1 rounded border border-gray-100 shadow-sm w-10 flex justify-center">
                                                        <div className="text-[9px] font-black text-[#002060]">
                                                            {bank.bank_name.toUpperCase().replace('BANK ', '')}
                                                        </div>
                                                    </div>
                                                    <div className="flex-1">
                                                        <div className="text-[10px] font-bold text-[#EE2E24] font-mono leading-none">
                                                            {bank.account_number}
                                                        </div>
                                                        <div className="text-[8px] text-gray-900 font-medium truncate leading-none mt-0.5">
                                                            a/n {bank.account_holder}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="bg-gray-50 rounded p-2 border border-gray-100 flex gap-3 items-center w-full">
                                                <div className="bg-white p-1 rounded border border-gray-100 shadow-sm w-10 flex justify-center">
                                                    <div className="text-[9px] font-black text-[#002060]">
                                                        {(company?.bank_name || 'BANK').toUpperCase()}
                                                    </div>
                                                </div>
                                                <div className="flex-1">
                                                    <div className="text-[10px] font-bold text-[#EE2E24] font-mono leading-none">
                                                        {company?.bank_account || '-'}
                                                    </div>
                                                    <div className="text-[8px] text-gray-900 font-medium truncate leading-none mt-0.5">
                                                        a/n {company?.bank_holder || '-'}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Signature Section - Inline with bank info for compactness */}
                                    <div className="flex gap-8 mt-4 pl-2">
                                        <div className="text-center">
                                            <div className="text-[7px] text-gray-400 uppercase tracking-widest mb-6">Penerima</div>
                                            <div className="w-20 border-b border-gray-300"></div>
                                        </div>
                                        <div className="text-center">
                                            <div className="text-[7px] text-gray-400 uppercase tracking-widest mb-2">Hormat Kami</div>
                                            <div className="relative h-14 w-24 flex items-end justify-center">
                                                <img
                                                    src="/signature_combined.png"
                                                    alt="Signature"
                                                    className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-28 h-auto mix-blend-multiply"
                                                />
                                                <div className="w-20 border-b border-gray-300 relative z-10 mb-2 invisible"></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Right: Totals */}
                                <div className="w-[35%]">
                                    <div className="flex justify-between items-center mb-1 text-[9px] text-gray-500">
                                        <span>Total Item</span>
                                        <span className="font-medium">{items.reduce((s, i) => s + i.qty, 0)} Pcs</span>
                                    </div>
                                    <div className="flex justify-between items-center mb-1 text-[9px] text-gray-600">
                                        <span>Subtotal</span>
                                        <span className="font-mono">{formatCurrency(subtotal).replace('Rp', '')}</span>
                                    </div>
                                    <div className="flex justify-between items-center mb-1 text-[9px] text-gray-600">
                                        <span>Diskon</span>
                                        <span className="font-mono">({formatCurrency(diskon).replace('Rp', '')})</span>
                                    </div>
                                    {/* Separator */}
                                    <div className="border-b border-gray-200 my-1.5"></div>

                                    {/* Grand Total */}
                                    <div className="flex justify-between items-end">
                                        <div className="text-[8px] font-bold text-[#EE2E24] uppercase tracking-wider mb-0.5">Total Tagihan</div>
                                        <div className="text-xl font-black text-gray-900 font-mono tracking-tighter leading-none">
                                            <span className="text-sm text-gray-400 font-light mr-1">Rp</span>
                                            {new Intl.NumberFormat("id-ID", { minimumFractionDigits: 0 }).format(data.total_amount)}
                                        </div>
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>
                )
            })}
        </>
    )
}
