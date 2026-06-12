
import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { Select } from './ui/Select'
import { Checkbox } from './ui/Checkbox'
import { Icons } from './ui/Icons'
import { QuickMasterDialog } from './QuickMasterDialog'
import { getErrorMessage } from '../lib/errors'

import { ITEM_TYPES } from "../lib/constants";
import type { Item } from "../types/shared";

type BomItem = {
  id: string;
  raw_material_id: string;
  raw_material_name: string;
  qty_per_fg: number;
};

type MasterData = {
    id: string
    code?: string
    name: string
}

interface ItemFormProps {
    existingItem?: Item | null
    onSuccess: () => void
    onCancel: () => void
}

function normalizeFiniteNumber(value: number | null | undefined, fallback = 0) {
    const nextValue = Number(value)
    return Number.isFinite(nextValue) ? nextValue : fallback
}

function normalizeText(value: string | null | undefined) {
    return value?.trim() || ''
}

export default function ItemForm({ existingItem, onSuccess, onCancel }: ItemFormProps) {
    const [uoms, setUoms] = useState<MasterData[]>([])
    const [sizes, setSizes] = useState<MasterData[]>([])
    const [colors, setColors] = useState<MasterData[]>([])
    const [brands, setBrands] = useState<MasterData[]>([])
    const [categories, setCategories] = useState<MasterData[]>([])
    const [rawMaterials, setRawMaterials] = useState<MasterData[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [bomItems, setBomItems] = useState<BomItem[]>([])
    const [bomLoading, setBomLoading] = useState(false)
    const [bomError, setBomError] = useState<string | null>(null)

    const [formData, setFormData] = useState<Partial<Item>>({
        sku: '', name: '', type: ITEM_TYPES.FINISHED_GOOD,
        price_default: 0, price_khusus: 0, default_price_buy: 0,
        min_stock: 5, is_active: true
    })

    // Quick Add State
    const [quickDialog, setQuickDialog] = useState<{ type: 'uoms' | 'sizes' | 'colors' | 'brands' | 'categories', title: string } | null>(null)

    useEffect(() => {
        fetchMasterData()
    }, [])

    useEffect(() => {
        if (existingItem) {
            setFormData(existingItem)
        } else if (uoms.length > 0) {
            // Set defaults for new item
            setFormData(prev => ({
                ...prev,
                uom_id: prev.uom_id || uoms.find(u => u.code === 'PCS')?.id || uoms[0].id,
                size_id: prev.size_id || sizes.find(s => s.code === 'ALL')?.id || sizes[0]?.id,
                color_id: prev.color_id || colors.find(c => c.code === 'NA')?.id || colors[0]?.id
            }))
        }
    }, [existingItem, uoms, sizes, colors])

    useEffect(() => {
        if (formData.type === ITEM_TYPES.FINISHED_GOOD && formData.default_price_buy !== 0) {
            setFormData(prev => ({ ...prev, default_price_buy: 0 }))
        }
        if (formData.type === ITEM_TYPES.RAW_MATERIAL && (formData.price_default !== 0 || formData.price_khusus !== 0)) {
            setFormData(prev => ({ ...prev, price_default: 0, price_khusus: 0 }))
        }
    }, [formData.type, formData.default_price_buy, formData.price_default, formData.price_khusus])

    useEffect(() => {
        if (existingItem?.id && formData.type === ITEM_TYPES.FINISHED_GOOD) {
            fetchBomData(existingItem.id)
        } else {
            setBomItems([])
        }
    }, [existingItem?.id, formData.type])

    async function fetchMasterData() {
        const [uomRes, sizeRes, colorRes, brandRes, categoryRes] = await Promise.all([
            supabase.from('uoms').select('id, code, name').eq('is_active', true),
            supabase.from('sizes').select('id, code, name').eq('is_active', true).order('name'),
            supabase.from('colors').select('id, code, name').eq('is_active', true).order('name'),
            supabase.from('brands').select('id, name').eq('is_active', true).order('name'),
            supabase.from('categories').select('id, name').eq('is_active', true).order('name')
        ])

        if (uomRes.data) setUoms(uomRes.data)
        if (sizeRes.data) setSizes(sizeRes.data)
        if (colorRes.data) setColors(colorRes.data)
        if (brandRes.data) setBrands(brandRes.data)
        if (categoryRes.data) setCategories(categoryRes.data)

        // Load raw materials for BOM
        const { data: rawMaterialsData } = await supabase
            .from('items')
            .select('id, name')
            .eq('type', ITEM_TYPES.RAW_MATERIAL)
            .eq('is_active', true)
            .order('name')

        if (rawMaterialsData) setRawMaterials(rawMaterialsData)
    }

    async function fetchBomData(finishedGoodId: string) {
        setBomLoading(true)
        setBomError(null)
        try {
            const { data, error } = await supabase
                .from('item_boms')
                .select('id, raw_material_id, qty_per_fg, raw_material:items!item_boms_raw_material_id_fkey(name)')
                .eq('finished_good_id', finishedGoodId)

            if (error) throw error

            setBomItems(data.map(bom => {
                const rawMaterial = Array.isArray(bom.raw_material)
                    ? bom.raw_material[0] as { name?: string } | undefined
                    : bom.raw_material as { name?: string } | null

                return {
                    id: bom.id,
                    raw_material_id: bom.raw_material_id,
                    raw_material_name: rawMaterial?.name || '',
                    qty_per_fg: bom.qty_per_fg
                }
            }))
        } catch (err) {
            setBomError(getErrorMessage(err, 'Failed to load BOM data'))
        } finally {
            setBomLoading(false)
        }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError(null)
        setLoading(true)

        try {
            const normalizedSku = normalizeText(formData.sku)
            const normalizedName = normalizeText(formData.name)
            const normalizedPriceDefault = normalizeFiniteNumber(formData.price_default)
            const normalizedPriceKhusus = normalizeFiniteNumber(formData.price_khusus)
            const normalizedDefaultPriceBuy = normalizeFiniteNumber(formData.default_price_buy)
            const normalizedMinStock = normalizeFiniteNumber(formData.min_stock, 0)

            if (!normalizedSku) throw new Error('SKU wajib diisi.')
            if (!normalizedName) throw new Error('Name wajib diisi.')

            if (normalizedPriceDefault < 0 || normalizedPriceKhusus < 0 || normalizedDefaultPriceBuy < 0 || normalizedMinStock < 0) {
                throw new Error("Prices must be >= 0")
            }

            // Validation Logic
            if ((formData.type === ITEM_TYPES.FINISHED_GOOD || formData.type === ITEM_TYPES.TRADED)) {
                if (normalizedPriceDefault <= 0) throw new Error("Harga Umum wajib diisi (> 0) untuk tipe ini.");
                if (normalizedPriceKhusus <= 0) throw new Error("Harga Khusus wajib diisi (> 0) untuk tipe ini.");
            }

            if ((formData.type === ITEM_TYPES.TRADED || formData.type === ITEM_TYPES.RAW_MATERIAL)) {
                if (normalizedDefaultPriceBuy <= 0) throw new Error("Buy Price (Cost) wajib diisi (> 0) untuk tipe ini.");
            }

            const selectedUom = uoms.find(u => u.id === formData.uom_id)
            const payload = {
                sku: normalizedSku,
                name: normalizedName,
                type: formData.type,
                uom_id: formData.uom_id,
                size_id: formData.size_id,
                color_id: formData.color_id,
                brand_id: formData.brand_id || null,
                category_id: formData.category_id || null,
                price_default: normalizedPriceDefault,
                price_khusus: normalizedPriceKhusus,
                default_price_buy: formData.type === ITEM_TYPES.FINISHED_GOOD ? 0 : normalizedDefaultPriceBuy,
                min_stock: normalizedMinStock,
                is_active: formData.is_active ?? true,
                uom: normalizeText(selectedUom?.code) || 'PCS'
            }

            let itemId = existingItem?.id
            if (existingItem?.id) {
                const { error } = await supabase.from('items').update(payload).eq('id', existingItem.id)
                if (error) throw error
            } else {
                const { data, error } = await supabase.from('items').insert([payload]).select('id').single()
                if (error) throw error
                itemId = data.id
            }

            // Save BOM if this is a finished good
            if (formData.type === ITEM_TYPES.FINISHED_GOOD && itemId) {
                await saveBom(itemId)
            }

            onSuccess()
        } catch (err: unknown) {
            setError(getErrorMessage(err, 'Unknown error'))
        } finally {
            setLoading(false)
        }
    }

    function handleAddBomItem() {
        setBomItems(prev => [
            ...prev,
            { id: '', raw_material_id: '', raw_material_name: '', qty_per_fg: 1 }
        ])
    }

    function handleRemoveBomItem(index: number) {
        setBomItems(prev => prev.filter((_, idx) => idx !== index))
    }

    function handleBomItemChange(index: number, field: 'raw_material_id' | 'qty_per_fg', value: string) {
        setBomItems(prev => prev.map((item, idx) => {
            if (idx !== index) return item
            if (field === 'raw_material_id') {
                const selectedMaterial = rawMaterials.find(rm => rm.id === value)
                return {
                    ...item,
                    raw_material_id: value,
                    raw_material_name: selectedMaterial?.name || '',
                }
            }
            return {
                ...item,
                qty_per_fg: Number(value) || 0,
            }
        }))
    }

    async function saveBom(finishedGoodId: string) {
        setBomError(null)

        const validBomItems = bomItems.filter(item => item.raw_material_id && item.qty_per_fg > 0)

        const { error: deleteError } = await supabase
            .from('item_boms')
            .delete()
            .eq('finished_good_id', finishedGoodId)

        if (deleteError) {
            setBomError(getErrorMessage(deleteError, 'Failed to clear BOM data'))
            throw deleteError
        }

        if (validBomItems.length === 0) return

        const { error: insertError } = await supabase
            .from('item_boms')
            .insert(validBomItems.map(item => ({
                finished_good_id: finishedGoodId,
                raw_material_id: item.raw_material_id,
                qty_per_fg: item.qty_per_fg,
            })))

        if (insertError) {
            setBomError(getErrorMessage(insertError, 'Failed to save BOM data'))
            throw insertError
        }
    }

    function handleQuickSuccess(newId: string) {
        fetchMasterData().then(() => {
            if (quickDialog?.type === 'uoms') setFormData(prev => ({ ...prev, uom_id: newId }))
            if (quickDialog?.type === 'sizes') setFormData(prev => ({ ...prev, size_id: newId }))
            if (quickDialog?.type === 'colors') setFormData(prev => ({ ...prev, color_id: newId }))
            if (quickDialog?.type === 'brands') setFormData(prev => ({ ...prev, brand_id: newId }))
            if (quickDialog?.type === 'categories') setFormData(prev => ({ ...prev, category_id: newId }))
        })
    }

    // Helper for Select with Add Button
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SelectWithAdd = ({ label, value, onChange, options, onAdd, disabled }: any) => (
        <div className="flex flex-col mb-3">
            <div className="flex justify-between items-center mb-1.5">
                <label className="text-sm font-medium text-[var(--text-main)]">{label}</label>
                {onAdd ? (
                    <button
                        type="button"
                        onClick={onAdd}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-0.5"
                    >
                        <Icons.Plus className="w-3 h-3" /> New
                    </button>
                ) : null}
            </div>
            <select
                className="flex h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)]"
                value={value || ''}
                onChange={onChange}
                disabled={disabled}
            >
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {options.map((opt: any) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
            </select>
        </div>
    )

    return (
        <>
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && <div className="text-red-600 text-sm bg-red-50 p-2 rounded">{error}</div>}

                <div className="grid grid-cols-2 gap-2">
                    <Input label="SKU" value={formData.sku} onChange={e => setFormData({ ...formData, sku: e.target.value })} required />
                    <Select
                        label="Type"
                        value={formData.type}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        onChange={e => setFormData({ ...formData, type: e.target.value as any })}
                        options={[
                            { label: 'Finished', value: ITEM_TYPES.FINISHED_GOOD },
                            { label: 'Raw Material', value: ITEM_TYPES.RAW_MATERIAL },
                            { label: 'Traded', value: ITEM_TYPES.TRADED }
                        ]}
                    />
                </div>
                <Input label="Name" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required />

                <div className="grid grid-cols-2 gap-2">
                    <SelectWithAdd
                        label="Brand (Optional)"
                        value={formData.brand_id}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        onChange={(e: any) => setFormData({ ...formData, brand_id: e.target.value || undefined })}
                        options={[{ label: '-- None --', value: '' }, ...brands.map(b => ({ label: b.name, value: b.id }))]}
                        onAdd={() => setQuickDialog({ type: 'brands', title: 'Brand' })}
                    />
                    <SelectWithAdd
                        label="Category (Optional)"
                        value={formData.category_id}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        onChange={(e: any) => setFormData({ ...formData, category_id: e.target.value || undefined })}
                        options={[{ label: '-- None --', value: '' }, ...categories.map(c => ({ label: c.name, value: c.id }))]}
                        onAdd={() => setQuickDialog({ type: 'categories', title: 'Category' })}
                    />
                </div>

                <div className="grid grid-cols-3 gap-2">
                    <SelectWithAdd
                        label="UoM"
                        value={formData.uom_id}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        onChange={(e: any) => setFormData({ ...formData, uom_id: e.target.value })}
                        options={uoms.map(u => ({ label: u.code || u.name, value: u.id }))}
                        onAdd={() => setQuickDialog({ type: 'uoms', title: 'UoM' })}
                    />
                    <SelectWithAdd
                        label="Size"
                        value={formData.size_id}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        onChange={(e: any) => setFormData({ ...formData, size_id: e.target.value })}
                        options={sizes.map(s => ({ label: s.code || s.name, value: s.id }))}
                        onAdd={() => setQuickDialog({ type: 'sizes', title: 'Size' })}
                    />
                    <SelectWithAdd
                        label="Color"
                        value={formData.color_id}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        onChange={(e: any) => setFormData({ ...formData, color_id: e.target.value })}
                        options={colors.map(c => ({ label: c.code || c.name, value: c.id }))}
                        onAdd={() => setQuickDialog({ type: 'colors', title: 'Color' })}
                    />
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                    <Input
                        label={`Harga Umum${(formData.type === ITEM_TYPES.FINISHED_GOOD || formData.type === ITEM_TYPES.TRADED) ? ' *' : ''}`}
                        type="number"
                        step="0.01"
                        value={formData.price_default === 0 ? "" : formData.price_default}
                        onChange={e => {
                            const val = e.target.value
                            setFormData({ ...formData, price_default: val === "" ? 0 : parseFloat(val) })
                        }}
                        disabled={formData.type === ITEM_TYPES.RAW_MATERIAL}
                    />
                    <Input
                        label={`Harga Khusus${(formData.type === ITEM_TYPES.FINISHED_GOOD || formData.type === ITEM_TYPES.TRADED) ? ' *' : ''}`}
                        type="number"
                        step="0.01"
                        value={formData.price_khusus === 0 ? "" : formData.price_khusus}
                        onChange={e => {
                            const val = e.target.value
                            setFormData({ ...formData, price_khusus: val === "" ? 0 : parseFloat(val) })
                        }}
                        disabled={formData.type === ITEM_TYPES.RAW_MATERIAL}
                    />
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <Input
                        label={`Buy Price (Cost)${(formData.type === ITEM_TYPES.TRADED || formData.type === ITEM_TYPES.RAW_MATERIAL) ? ' *' : ''}`}
                        type="number"
                        step="0.01"
                        value={formData.default_price_buy === 0 ? "" : formData.default_price_buy}
                        onChange={e => {
                            const val = e.target.value
                            setFormData({ ...formData, default_price_buy: val === "" ? 0 : parseFloat(val) })
                        }}
                        disabled={formData.type === ITEM_TYPES.FINISHED_GOOD}
                    />
                    <Input
                        label="Min Stock"
                        type="number"
                        value={formData.min_stock === 0 ? "" : formData.min_stock}
                        onChange={e => {
                            const val = e.target.value
                            setFormData({ ...formData, min_stock: val === "" ? 0 : parseFloat(val) })
                        }}
                    />
                </div>
                {formData.type === ITEM_TYPES.FINISHED_GOOD && (
                    <>
                        <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-2 py-1 mb-4">
                            Untuk FINISHED_GOOD, HPP otomatis 0 (HPP dihitung periodik saat closing).
                        </div>

                        <div className="border-t pt-4 mt-4">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-medium">Bill of Materials (BOM)</h3>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={handleAddBomItem}
                                    disabled={bomLoading}
                                    icon={<Icons.Plus className="w-4 h-4" />}
                                >
                                    Add Material
                                </Button>
                            </div>

                            {bomError && <div className="text-red-600 text-sm bg-red-50 p-2 rounded mb-4">{bomError}</div>}

                            {bomLoading ? (
                                <div className="text-center py-4 text-gray-500">Loading BOM...</div>
                            ) : (
                                <div className="space-y-3">
                                    {bomItems.map((bomItem, index) => (
                                        <div key={index} className="flex gap-2 items-end">
                                            <div className="flex-1">
                                                <SelectWithAdd
                                                    label="Raw Material"
                                                    value={bomItem.raw_material_id}
                                                    onChange={(e: any) => handleBomItemChange(index, 'raw_material_id', e.target.value)}
                                                    options={[
                                                        { label: '-- Select Material --', value: '' },
                                                        ...rawMaterials.map(rm => ({ label: rm.name, value: rm.id }))
                                                    ]}
                                                    disabled={bomLoading}
                                                />
                                            </div>
                                            <div className="w-32">
                                                <Input
                                                    label="Qty per FG"
                                                    type="number"
                                                    min="0.01"
                                                    step="0.01"
                                                    value={bomItem.qty_per_fg}
                                                    onChange={(e) => handleBomItemChange(index, 'qty_per_fg', e.target.value)}
                                                    disabled={bomLoading}
                                                />
                                            </div>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => handleRemoveBomItem(index)}
                                                disabled={bomLoading}
                                            >
                                                <Icons.Trash className="w-4 h-4 text-red-500" />
                                            </Button>
                                        </div>
                                    ))}

                                    {bomItems.length === 0 && (
                                        <div className="text-center py-4 text-gray-500">
                                            No materials added to BOM
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </>
                )}

                <Checkbox label="Active" checked={formData.is_active} onChange={e => setFormData({ ...formData, is_active: e.target.checked })} />

                <div className="flex space-x-2 pt-2">
                    <Button type="submit" disabled={loading} className="w-full sm:w-auto min-h-[44px]">
                        {existingItem ? 'Update' : 'Add'} Item
                    </Button>
                    <Button type="button" variant="secondary" onClick={onCancel} className="w-full sm:w-auto">Cancel</Button>
                </div>
            </form>

            {quickDialog && (
                <QuickMasterDialog
                    isOpen={!!quickDialog}
                    table={quickDialog.type}
                    title={quickDialog.title}
                    onClose={() => setQuickDialog(null)}
                    onSuccess={handleQuickSuccess}
                    hasCode={quickDialog.type === 'uoms' || quickDialog.type === 'sizes' || quickDialog.type === 'colors'}
                />
            )}
        </>
    )
}
