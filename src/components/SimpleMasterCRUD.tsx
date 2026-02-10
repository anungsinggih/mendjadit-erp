import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { Button } from './ui/Button'
import { useConfirm } from './ui/ConfirmDialogContext'
import { Input } from './ui/Input'
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/Table'
import { Icons } from './ui/Icons'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/Dialog'
import { Checkbox } from './ui/Checkbox'
import { getSizeSortOrder } from '../lib/constants'
import { getErrorMessage } from '../lib/errors'

type MasterItem = {
    id: string
    name: string
    code?: string
    is_active: boolean
}

type SimpleCRUDProps = {
    table: string
    title: string
    hasCode?: boolean
}

export function SimpleMasterCRUD({ table, title, hasCode }: SimpleCRUDProps) {
    const [items, setItems] = useState<MasterItem[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [formData, setFormData] = useState<Partial<MasterItem>>({ name: '', code: '', is_active: true })
    const [searchTerm, setSearchTerm] = useState('')
    const [isModalOpen, setIsModalOpen] = useState(false)
    const { confirm } = useConfirm()

    const filteredItems = items.filter(item =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.code && item.code.toLowerCase().includes(searchTerm.toLowerCase()))
    )

    const fetchItems = useCallback(async () => {
        setLoading(true)
        const { data, error } = await supabase.from(table).select('*').order('name', { ascending: true })
        if (error) setError(getErrorMessage(error))
        else {
            let normalized = data || []
            if (table === 'sizes') {
                normalized = [...normalized].sort((a, b) => getSizeSortOrder(a.name || '') - getSizeSortOrder(b.name || ''))
            }
            setItems(normalized)
        }
        setLoading(false)
    }, [table])

    useEffect(() => {
        fetchItems()
    }, [fetchItems])

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError(null)
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const payload: Record<string, any> = { name: formData.name, is_active: formData.is_active }
            if (hasCode) payload.code = formData.code

            if (editingId) {
                const { error } = await supabase.from(table).update(payload).eq('id', editingId)
                if (error) throw error
            } else {
                const { error } = await supabase.from(table).insert([payload])
                if (error) throw error
            }
            handleSuccess()
        } catch (err: unknown) {
            setError(getErrorMessage(err, 'An unknown error occurred'))
        }
    }

    function handleSuccess() {
        resetForm()
        setIsModalOpen(false)
        fetchItems()
    }

    async function handleDelete(id: string) {
        const ok = await confirm({
            title: "Delete Item",
            description: "Delete this item? This action cannot be undone.",
            confirmText: "Delete",
            cancelText: "Cancel",
            tone: "danger",
        })
        if (!ok) return
        const { error } = await supabase.from(table).delete().eq('id', id)
        if (error) {
            void confirm({
                title: "Cannot Delete",
                description: "Could not delete (likely referenced). Try deactivating.",
                confirmText: "OK",
                hideCancel: true,
            })
        }
        else fetchItems()
    }

    function resetForm() {
        setEditingId(null)
        setFormData({ name: '', code: '', is_active: true })
    }

    function handleAdd() {
        resetForm()
        setIsModalOpen(true)
    }

    function handleEdit(item: MasterItem) {
        setEditingId(item.id)
        setFormData(item)
        setIsModalOpen(true)
    }

    return (
        <Card className="h-full">
            <CardHeader className="py-3">
                <CardTitle className="text-lg flex justify-between items-center gap-4">
                    <span>{title}</span>
                    <div className="flex items-center gap-2">
                        {loading && <span className="text-xs font-normal text-gray-500 animate-pulse">Syncing...</span>}
                        <Button size="sm" onClick={handleAdd} icon={<Icons.Plus className="w-3 h-3" />}>Add</Button>
                    </div>
                </CardTitle>
                <div className="pt-2">
                    <Input
                        placeholder="Search..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="h-8 text-xs mb-0"
                        containerClassName="!mb-0"
                    />
                </div>
            </CardHeader>
            <CardContent>
                {error && <div className="text-red-500 text-sm mb-2">{error}</div>}

                <div className="overflow-auto max-h-[400px]">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                {hasCode && <TableHead className="whitespace-nowrap">Code</TableHead>}
                                <TableHead className="whitespace-nowrap">Name</TableHead>
                                <TableHead className="w-16 whitespace-nowrap">Act</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredItems.map(item => (
                                <TableRow key={item.id}>
                                    {hasCode && <TableCell className="py-1">{item.code}</TableCell>}
                                    <TableCell className="py-1">{item.name}</TableCell>
                                    <TableCell className="py-1">
                                        <div className="flex justify-end gap-1">
                                            <Button size="sm" variant="ghost" onClick={() => handleEdit(item)} className="h-9 w-9 p-0 text-slate-500 hover:text-indigo-600">
                                                <Icons.Edit className="w-[22px] h-[22px]" />
                                            </Button>
                                            <Button size="sm" variant="ghost" onClick={() => handleDelete(item.id)} className="h-9 w-9 p-0 text-slate-400 hover:text-rose-600">
                                                <Icons.Trash className="w-[22px] h-[22px]" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>

                <Dialog isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}>
                    <DialogHeader>
                        <DialogTitle>{editingId ? `Edit ${title}` : `New ${title}`}</DialogTitle>
                    </DialogHeader>
                    <DialogContent>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {hasCode && <Input label="Code" value={formData.code} onChange={e => setFormData({ ...formData, code: e.target.value })} />}
                            <Input label="Name" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
                            {/* sort order no longer persisted; UI sorts using constants */}

                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    label="Active"
                                    checked={formData.is_active}
                                    onChange={e => setFormData({ ...formData, is_active: e.target.checked })}
                                />
                            </div>

                            <div className="flex gap-2 pt-2">
                                <Button type="submit" size="sm" className="w-full">{editingId ? 'Update' : 'Create'}</Button>
                                <Button type="button" size="sm" variant="secondary" onClick={() => setIsModalOpen(false)} className="w-full">Cancel</Button>
                            </div>
                        </form>
                    </DialogContent>
                </Dialog>
            </CardContent>
        </Card>
    )
}
