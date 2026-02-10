import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/Card'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { Select } from './ui/Select'

type Item = { id: string; name: string; sku: string }

type Props = {
    initialItemId?: string
    isEmbedded?: boolean
    onSuccess?: () => void
}

export default function OpeningStock({ initialItemId, isEmbedded, onSuccess }: Props) {
    const navigate = useNavigate()
    const location = useLocation()
    const stateItemId = location.state?.itemId
    const effectiveInitialId = initialItemId || stateItemId || ''

    const [items, setItems] = useState<Item[]>([])
    const [itemId, setItemId] = useState(effectiveInitialId)
    const [qty, setQty] = useState(0)
    const [asOfDate, setAsOfDate] = useState(() => new Date().toISOString().split('T')[0])
    const [reason, setReason] = useState('Opening Stock')
    const [openingExists, setOpeningExists] = useState(false)
    const [checkingOpening, setCheckingOpening] = useState(false)

    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    useEffect(() => {
        fetchItems()
    }, [])

    useEffect(() => {
        if (effectiveInitialId) setItemId(effectiveInitialId)
    }, [effectiveInitialId])

    useEffect(() => {
        if (!itemId) {
            setOpeningExists(false)
            return
        }

        const checkOpening = async () => {
            setCheckingOpening(true)
            const { count, error } = await supabase
                .from('inventory_adjustments')
                .select('id', { count: 'exact', head: true })
                .eq('item_id', itemId)
                .or('reason.ilike.Opening%,reason.ilike.%Import Initial Stock%')

            if (!error) {
                setOpeningExists((count || 0) > 0)
            }
            setCheckingOpening(false)
        }

        checkOpening()
    }, [itemId])

    async function fetchItems() {
        const { data } = await supabase.from('items').select('id, name, sku').order('name')
        setItems(data || [])
    }

    async function handleSubmit() {
        if (openingExists) { setError("Opening stock untuk item ini sudah pernah dibuat"); return }
        if (!itemId) { setError("Select Item"); return }
        if (!asOfDate) { setError("Tanggal opening harus diisi"); return }
        if (qty <= 0) { setError("Qty must be > 0"); return }

        setLoading(true)
        setError(null)
        setSuccess(null)

        try {
            const { error } = await supabase.rpc('rpc_set_opening_stock', {
                p_item_id: itemId,
                p_qty: qty,
                p_as_of_date: asOfDate,
                p_reason: reason
            })

            if (error) throw error
            setSuccess("Opening Stock Set!")
            setQty(0)
            setReason('Opening Stock')
            setReason('Opening Stock')
            if (onSuccess) setTimeout(onSuccess, 1000)
            else setTimeout(() => navigate(-1), 1000)
            if (!initialItemId) setItemId('')
        } catch (err: unknown) {
            if (err instanceof Error) setError(err.message)
            else setError('Unknown error')
        } finally {
            setLoading(false)
        }
    }

    const content = (
        <div className="space-y-5 pt-2">
            {error && <div className="p-3 bg-red-100 text-red-700 rounded-md text-sm">{error}</div>}
            {openingExists && (
                <div className="p-3 bg-yellow-50 text-yellow-800 rounded-md text-sm border border-yellow-200">
                    Opening stock untuk item ini sudah pernah dibuat. Tidak bisa input lagi.
                </div>
            )}
            {success && <div className="p-3 bg-green-100 text-green-700 rounded-md text-sm">{success}</div>}

            {!initialItemId && (
                <Select
                    label="Item"
                    value={itemId}
                    onChange={e => setItemId(e.target.value)}
                    options={[
                        { label: "-- Select Item --", value: "" },
                        ...items.map(i => ({ label: `${i.sku} - ${i.name}`, value: i.id }))
                    ]}
                />
            )}

            <div className="grid grid-cols-2 gap-4">
                <Input
                    label="Opening Qty"
                    type="number"
                    inputMode="numeric"
                    step="1"
                    placeholder="0"
                    value={qty === 0 ? "" : qty}
                    onFocus={(e) => e.target.select()}
                    onChange={e => {
                        const val = e.target.value;
                        setQty(val === "" ? 0 : parseFloat(val));
                    }}
                />
                <Input
                    label="As of Date"
                    type="date"
                    value={asOfDate}
                    onChange={e => setAsOfDate(e.target.value)}
                />
            </div>

            <Input
                label="Catatan (opsional)"
                value={reason}
                onChange={e => setReason(e.target.value)}
            />

            <Button onClick={handleSubmit} disabled={loading || checkingOpening || openingExists} className="w-full">
                {checkingOpening ? 'Checking...' : 'Set Opening Stock'}
            </Button>
        </div>
    )

    if (isEmbedded) return content

    return (
        <div className="w-full max-w-6xl mx-auto space-y-6 px-3 sm:px-4 lg:px-6 pb-20">
            <Card className="shadow-lg border-gray-200">
                <CardHeader className="bg-blue-50 border-b border-blue-100 pb-4">
                    <CardTitle className="text-xl text-blue-800">Setup Opening Stock</CardTitle>
                    <CardDescription className="text-blue-600/80">
                        Input saldo awal stok barang. Pastikan tanggal dan jumlah sesuai dengan kondisi fisik saat cut-off.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {content}
                </CardContent>
            </Card>
        </div>
    )
}
