import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { Select } from './ui/Select'
import { Switch } from './ui/Switch'
import { Textarea } from './ui/Textarea'
import type { Customer as SharedCustomer } from '../types/shared'

export type Customer = SharedCustomer

interface CustomerFormProps {
    initialData?: Customer | null
    onSuccess: () => void
    onCancel: () => void
}

export default function CustomerForm({ initialData, onSuccess, onCancel }: CustomerFormProps) {
    const [formData, setFormData] = useState<Partial<Customer>>({
        name: '', phone: '', address: '', customer_type: 'UMUM', is_active: true
    })
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (initialData) {
            setFormData(initialData)
        } else {
            setFormData({ name: '', phone: '', address: '', customer_type: 'UMUM', is_active: true })
        }
    }, [initialData])

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError(null)
        setLoading(true)

        try {
            if (initialData?.id) {
                const { error } = await supabase
                    .from('customers')
                    .update(formData)
                    .eq('id', initialData.id)
                if (error) throw error
            } else {
                const { error } = await supabase
                    .from('customers')
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
            {error && <div className="p-2 bg-red-50 text-red-700 text-sm rounded border border-red-200">{error}</div>}

            <Input label="Name" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required placeholder="Company or Person Name" />
            <Input label="Phone" value={formData.phone ?? ''} onChange={e => setFormData({ ...formData, phone: e.target.value })} placeholder="Optional" />
            <Textarea label="Address" value={formData.address ?? ''} onChange={e => setFormData({ ...formData, address: e.target.value })} placeholder="Full Address" />

            <Select
                label="Customer Type"
                value={formData.customer_type}
                onChange={e => setFormData({ ...formData, customer_type: e.target.value as 'UMUM' | 'KHUSUS' | 'CUSTOM' })}
                options={[
                    { label: 'Umum', value: 'UMUM' },
                    { label: 'Khusus', value: 'KHUSUS' },
                    { label: 'Custom', value: 'CUSTOM' }
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
                    {initialData ? 'Update Customer' : 'Create Customer'}
                </Button>
                <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>Cancel</Button>
            </div>
        </form>
    )
}
