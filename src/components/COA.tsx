import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { Select } from './ui/Select'
import { Switch } from './ui/Switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/Table'
import { Badge } from './ui/Badge'
import { Icons } from './ui/Icons'
import { getErrorMessage } from '../lib/errors'
import { useConfirm } from './ui/ConfirmDialogContext'

type Account = {
    id: string
    code: string
    name: string
    account_type: string
    is_active: boolean
    is_system_account: boolean
}

export default function COA() {
    const [accounts, setAccounts] = useState<Account[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const [editingId, setEditingId] = useState<string | null>(null)
    const [formData, setFormData] = useState<Partial<Account>>({
        code: '', name: '', account_type: 'ASSET', is_active: true, is_system_account: false
    })
    const { confirm } = useConfirm()

    useEffect(() => {
        fetchAccounts()
    }, [])

    async function fetchAccounts() {
        setLoading(true)
        const { data, error } = await supabase
            .from('accounts')
            .select('*')
            .order('code', { ascending: true })

        if (error) setError(getErrorMessage(error))
        else setAccounts(data || [])
        setLoading(false)
    }

    async function handleSubmit() {
        if (!formData.code || !formData.name) return
        setError(null)

        try {
            if (editingId) {
                const { error } = await supabase
                    .from('accounts')
                    .update(formData)
                    .eq('id', editingId)
                if (error) throw error
            } else {
                const { error } = await supabase
                    .from('accounts')
                    .insert([formData])
                if (error) throw error
            }

            resetForm()
            fetchAccounts()
        } catch (err: unknown) {
            setError(getErrorMessage(err))
        }
    }

    function resetForm() {
        setEditingId(null)
        setFormData({
            code: '', name: '', account_type: 'ASSET', is_active: true, is_system_account: false
        })
    }

    function handleEdit(acc: Account) {
        setEditingId(acc.id)
        setFormData({ ...acc, account_type: acc.account_type || 'ASSET' })
    }

    async function handleDelete(id: string) {
        const ok = await confirm({
            title: "Delete Account",
            description: "Delete account? This action cannot be undone.",
            confirmText: "Delete",
            cancelText: "Cancel",
            tone: "danger",
        })
        if (!ok) return
        const { error } = await supabase.from('accounts').delete().eq('id', id)
        if (error) {
            void confirm({
                title: "Cannot Delete",
                description: "Could not delete. Try deactivating.",
                confirmText: "OK",
                hideCancel: true,
            })
        }
        else fetchAccounts()
    }

    return (
        <div className="w-full space-y-8">
            <h2 className="hidden md:block text-3xl font-bold tracking-tight text-gray-900">Chart of Accounts (COA)</h2>
            {error && <div className="p-4 bg-red-50 text-red-700 border border-red-200 rounded-md flex items-center gap-2"><Icons.Warning className="w-5 h-5 flex-shrink-0" /> Error: {error}</div>}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8">
                <div className="md:col-span-1">
                    <Card className="shadow-md sticky top-6">
                        <CardHeader className="bg-gray-50 border-b border-gray-100">
                            <CardTitle>{editingId ? 'Edit Account' : 'New Account'}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-6">
                            <Select
                                label="Account Type"
                                value={formData.account_type || 'ASSET'}
                                onChange={e => {
                                    const newType = e.target.value;
                                    const prefixMap: Record<string, string> = {
                                        'ASSET': '1',
                                        'LIABILITY': '2',
                                        'EQUITY': '3',
                                        'REVENUE': '4',
                                        'COGS': '5',
                                        'EXPENSE': '6'
                                    };

                                    // Filter existing accounts with same prefix
                                    const prefix = prefixMap[newType] || '9';
                                    const existingCodes = accounts
                                        .filter(a => a.code.startsWith(prefix))
                                        .map(a => parseInt(a.code.replace(/\D/g, '')))
                                        .filter(n => !isNaN(n))
                                        .sort((a, b) => b - a);

                                    // Generate next code (e.g. 11000 -> 11001)
                                    // Default start if none exists: prefix + '1000' (e.g. 11000)
                                    const nextCode = existingCodes.length > 0
                                        ? (existingCodes[0] + 1).toString()
                                        : `${prefix}1000`;

                                    setFormData({
                                        ...formData,
                                        account_type: newType,
                                        code: nextCode
                                    });
                                }}
                                options={[
                                    { label: 'Asset', value: 'ASSET' },
                                    { label: 'Liability', value: 'LIABILITY' },
                                    { label: 'Equity', value: 'EQUITY' },
                                    { label: 'Revenue', value: 'REVENUE' },
                                    { label: 'COGS', value: 'COGS' },
                                    { label: 'Expense', value: 'EXPENSE' },
                                ]}
                                className="w-full"
                            />
                            <Input
                                label="Code (e.g. 1001)"
                                value={formData.code}
                                onChange={e => setFormData({ ...formData, code: e.target.value })}
                                placeholder="Code"
                                disabled={!!formData.is_system_account}
                            />
                            <Input label="Account Name" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="Name" />

                            <div className="flex items-center justify-between p-3 border rounded-lg bg-gray-50">
                                <span className="text-sm font-medium text-gray-700">Active Status</span>
                                <Switch
                                    checked={formData.is_active}
                                    onCheckedChange={checked => setFormData({ ...formData, is_active: checked })}
                                />
                            </div>

                            <div className="flex gap-2 pt-2">
                                <Button className="w-full bg-blue-600 hover:bg-blue-700" onClick={handleSubmit}>
                                    {editingId ? 'Update' : 'Create'}
                                </Button>
                                {editingId && <Button variant="outline" onClick={resetForm}>Cancel</Button>}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="md:col-span-2">
                    <Card className="shadow-md">
                        <CardHeader className="bg-gray-50 border-b border-gray-100">
                            <CardTitle>Account List</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Code</TableHead>
                                        <TableHead>Name</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {loading ? <TableRow><TableCell colSpan={5} className="text-center">Loading...</TableCell></TableRow> : accounts.map(a => (
                                        <TableRow key={a.id} className={!a.is_active ? 'bg-gray-100 opacity-60' : ''}>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono font-bold text-blue-800">{a.code}</span>
                                                    {a.is_system_account && <Badge variant="outline">System</Badge>}
                                                </div>
                                            </TableCell>
                                            <TableCell className="font-medium">{a.name}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline">{a.account_type || 'ASSET'}</Badge>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={a.is_active ? 'success' : 'secondary'}>
                                                    {a.is_active ? 'Active' : 'Inactive'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex justify-end gap-1">
                                                    <Button size="sm" variant="ghost" onClick={() => handleEdit(a)} className="h-9 w-9 p-0 text-slate-500 hover:text-indigo-600">
                                                        <Icons.Edit className="w-[22px] h-[22px]" />
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => handleDelete(a.id)}
                                                        disabled={a.is_system_account}
                                                        className={`h-9 w-9 p-0 ${a.is_system_account ? 'text-slate-300' : 'text-slate-400 hover:text-rose-600'}`}
                                                    >
                                                        <Icons.Trash className="w-[22px] h-[22px]" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
