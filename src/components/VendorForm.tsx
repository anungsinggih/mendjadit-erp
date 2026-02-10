import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { Switch } from './ui/Switch'
import { Textarea } from './ui/Textarea'
import { ButtonSelect } from './ui/ButtonSelect'
import type { Vendor as SharedVendor } from '../types/shared'

export type Vendor = SharedVendor

interface VendorFormProps {
    initialData?: Vendor | null
    onSuccess: () => void
    onCancel: () => void
}

export default function VendorForm({ initialData, onSuccess, onCancel }: VendorFormProps) {
    const [formData, setFormData] = useState<Partial<Vendor>>({
        name: '', phone: '', address: '', is_active: true, vendor_type: 'SUPPLIER'
    })
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (initialData) {
            setFormData({ ...initialData, vendor_type: initialData.vendor_type || 'SUPPLIER' })
        } else {
            setFormData({ name: '', phone: '', address: '', is_active: true, vendor_type: 'SUPPLIER' })
        }
    }, [initialData])

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError(null)
        setLoading(true)

        try {
            if (initialData?.id) {
                const { error } = await supabase
                    .from('vendors')
                    .update(formData)
                    .eq('id', initialData.id)
                if (error) throw error
            } else {
                const { error } = await supabase
                    .from('vendors')
                    .insert([formData])
                if (error) throw error
            }

            onSuccess()
        } catch (err: unknown) {
            if (err instanceof Error) setError(err.message)
            else setError('An unknown error occurred')
        } finally {
            setLoading(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="p-4 bg-red-50 text-red-700 border border-red-200 rounded-md">{error}</div>}

            <Input label="Name" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required placeholder="Vendor Name" />
            <Input label="Phone" value={formData.phone ?? ''} onChange={e => setFormData({ ...formData, phone: e.target.value })} placeholder="Optional" />
            <Textarea label="Address" value={formData.address ?? ''} onChange={e => setFormData({ ...formData, address: e.target.value })} placeholder="Full Address" />
            <ButtonSelect
                label="Type"
                value={formData.vendor_type || 'SUPPLIER'}
                onChange={(val: string) => setFormData({ ...formData, vendor_type: val as Vendor['vendor_type'] })}
                options={[
                    { label: 'Supplier', value: 'SUPPLIER' },
                    { label: 'Konveksi', value: 'KONVEKSI' },
                    { label: 'Internal', value: 'INTERNAL' },
                ]}
            />

            <div className="flex items-center justify-between p-3 border rounded-lg bg-gray-50">
                <span className="text-sm font-medium text-gray-700">Active Status &nbsp;</span>
                <Switch
                    checked={formData.is_active}
                    onCheckedChange={checked => setFormData({ ...formData, is_active: checked })}
                />
            </div>

            <div className="flex gap-2 pt-2">
                <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={loading}>
                    {initialData ? 'Update Vendor' : 'Create Vendor'}
                </Button>
                <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>Cancel</Button>
            </div>
        </form>
    )
}
