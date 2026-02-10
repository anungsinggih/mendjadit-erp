import { Fragment, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { Select } from './ui/Select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/Table'
import { Badge } from './ui/Badge'
import { Icons } from './ui/Icons'
import { PageHeader } from './ui/PageHeader'
import { Alert } from './ui/Alert'
import { Section } from './ui/Section'

type Account = { id: string; code: string; name: string; account_type: string }

type Line = {
    account_id: string
    debit: number
    credit: number
}

type HistoryEntry = {
    date: string
    debit: number
    credit: number
    count: number
}

type HistoryDetail = {
    account_id: string
    code: string | null
    name: string | null
    debit: number
    credit: number
}

export default function OpeningBalance() {
    const navigate = useNavigate()
    const [history, setHistory] = useState<HistoryEntry[]>([])
    const [historyDetails, setHistoryDetails] = useState<Record<string, HistoryDetail[]>>({})
    const [expandedDate, setExpandedDate] = useState<string | null>(null)
    const [hasOpeningBalance, setHasOpeningBalance] = useState(false)
    const [accounts, setAccounts] = useState<Account[]>([])
    const [asOfDate, setAsOfDate] = useState('')
    const [lines, setLines] = useState<Line[]>([{ account_id: '', debit: 0, credit: 0 }])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [confirmOpening, setConfirmOpening] = useState(false)
    const [showForm, setShowForm] = useState(true)
    const [isEditing, setIsEditing] = useState(false)

    useEffect(() => {
        fetchAccounts()
        fetchHistory()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    async function fetchAccounts() {
        const { data, error } = await supabase
            .from('accounts')
            .select('id, code, name, account_type')
            .eq('is_active', true)
            .order('code')
        if (error) setError(error.message)
        else setAccounts(data || [])
    }

    async function fetchHistory() {
        const { data, error } = await supabase
            .from('opening_balances')
            .select('as_of_date, debit, credit, account_id, accounts(code, name)')
        if (error) {
            console.error('Error fetching history:', error)
            return
        }

        // Aggregate by date
        const agg: Record<string, { date: string; debit: number; credit: number; count: number }> = {}
        const details: Record<string, HistoryDetail[]> = {}
        data?.forEach(row => {
            if (!agg[row.as_of_date]) {
                agg[row.as_of_date] = { date: row.as_of_date, debit: 0, credit: 0, count: 0 }
            }
            agg[row.as_of_date].debit += row.debit
            agg[row.as_of_date].credit += row.credit
            agg[row.as_of_date].count += 1
            if (!details[row.as_of_date]) details[row.as_of_date] = []
            const acct = Array.isArray(row.accounts) ? row.accounts[0] : row.accounts
            details[row.as_of_date].push({
                account_id: row.account_id,
                code: acct?.code ?? null,
                name: acct?.name ?? null,
                debit: row.debit,
                credit: row.credit
            })
        })

        const sortedHistory = Object.values(agg).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        setHistory(sortedHistory)
        setHistoryDetails(details)
        setHasOpeningBalance(sortedHistory.length > 0)

        if (!isEditing) {
            setShowForm(sortedHistory.length === 0)
        }
    }

    async function handleLoad(date: string) {
        setError(null)
        setSuccess(null)
        setLoading(true)
        setAsOfDate(date)
        setConfirmOpening(false)
        setIsEditing(true)
        setShowForm(true)
        try {
            const { data: lockedData, error: lockedError } = await supabase.rpc('is_date_in_closed_period', { d: date })
            if (lockedError) {
                throw lockedError
            }
            const locked = lockedData?.[0]?.is_date_in_closed_period
            if (locked) {
                setError(`Tanggal ${new Date(date).toLocaleDateString('id-ID')} sudah ditutup`)
                setLoading(false)
                return
            }
            const { data, error } = await supabase
                .from('opening_balances')
                .select('account_id, debit, credit')
                .eq('as_of_date', date)

            if (error) throw error

            if (data && data.length > 0) {
                setLines(data.map(d => ({
                    account_id: d.account_id,
                    debit: d.debit,
                    credit: d.credit
                })))
                setSuccess(`Loaded data for ${date}`)
            } else {
                setLines([{ account_id: '', debit: 0, credit: 0 }])
            }
        } catch (err: unknown) {
            if (err instanceof Error) setError(err.message)
            else setError('Unknown error')
        } finally {
            setLoading(false)
        }
    }

    function addLine() {
        setLines([...lines, { account_id: '', debit: 0, credit: 0 }])
    }

    function removeLine(index: number) {
        setLines(lines.filter((_, i) => i !== index))
    }

    function updateLine(index: number, field: keyof Line, value: string | number) {
        const newLines = [...lines]
        newLines[index] = { ...newLines[index], [field]: value }
        setLines(newLines)
    }

    const totalDebit = lines.reduce((sum, l) => sum + (l.debit || 0), 0)
    const totalCredit = lines.reduce((sum, l) => sum + (l.credit || 0), 0)
    const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01

    async function handleSave() {
        setError(null)
        setSuccess(null)

        if (!asOfDate) { setError("Date is required"); return }
        if (!confirmOpening) { setError("Konfirmasi bahwa ini khusus Opening Balance"); return }
        if (!isBalanced) { setError("Debits must equal Credits (T019)"); return }
        if (lines.some(l => !l.account_id)) { setError("All lines must have an account"); return }

        setLoading(true)

        try {
            const payload = lines.map(line => ({
                account_id: line.account_id,
                debit: Number(line.debit) || 0,
                credit: Number(line.credit) || 0
            }))

            const { error } = await supabase.rpc('rpc_set_opening_balance', {
                p_as_of_date: asOfDate,
                p_lines: payload
            })

            if (error) throw error
            setSuccess("Opening Balance saved successfully!")
            setIsEditing(false)
            setShowForm(false)
            setAsOfDate('')
            setLines([{ account_id: '', debit: 0, credit: 0 }])
            fetchHistory() // Refresh history
        } catch (err: unknown) {
            if (err instanceof Error) setError(err.message)
            else setError('Unknown error')
        } finally {
            setLoading(false)
        }
    }

    // Format currency helper
    const formatCurrency = (val: number) =>
        new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(val)

    return (
        <div className="w-full max-w-6xl mx-auto space-y-6 px-3 sm:px-4 lg:px-6 pb-20">
            <PageHeader
                title="Opening Balance Setup"
                description="Opening Balance hanya untuk saldo awal. Untuk jurnal operasional harian gunakan Jurnal Umum."
                breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Accounting" }]}
            />

            <Alert
                variant="warning"
                title="Penting"
                description="Opening Balance hanya dipakai sekali untuk saldo awal periode. Untuk transaksi harian (gaji, biaya, dll) gunakan Jurnal Umum."
            />
            {hasOpeningBalance && !isEditing && (
                <Alert
                    variant="info"
                    title="Opening Balance sudah ada"
                    description="Form disembunyikan agar tidak salah input. Gunakan Jurnal Umum untuk transaksi harian. Jika perlu koreksi, gunakan tombol Edit pada riwayat."
                />
            )}

            <div className="flex flex-wrap gap-2">
                <Button
                    variant="outline"
                    onClick={() => navigate('/journals/manual')}
                    icon={<Icons.Edit className="w-4 h-4" />}
                >
                    Ke Jurnal Umum
                </Button>
            </div>

            {error && <Alert variant="error" title="Oops" description={error} />}
            {success && <Alert variant="success" title="Sukses" description={success} />}

            {showForm && (
                <Section
                    title="Journal Entry"
                    description="Set or update opening balances for a specific date."
                    action={
                        history.length > 0 ? (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    setShowForm(false)
                                    setIsEditing(false)
                                    setAsOfDate('')
                                    setLines([{ account_id: '', debit: 0, credit: 0 }])
                                }}
                                icon={<Icons.Close className="w-4 h-4" />}
                            >
                                Hide Form
                            </Button>
                        ) : null
                    }
                >
                    <div className="flex flex-col gap-6">
                        <div className="flex items-end gap-4 max-w-lg">
                            <div className="flex-1">
                                <Input
                                    label="As of Date"
                                    type="date"
                                    value={asOfDate}
                                    onChange={e => {
                                        setAsOfDate(e.target.value)
                                    }}
                                    containerClassName="!mb-0"
                                />
                            </div>
                            <Button
                                variant="outline"
                                onClick={() => handleLoad(asOfDate)}
                                disabled={!asOfDate}
                                icon={<Icons.Refresh className="w-4 h-4" />}
                            >
                                Load
                            </Button>
                        </div>

                        <div className="rounded-md border border-gray-200 overflow-hidden">
                            <Table>
                                <TableHeader className="bg-gray-50">
                                    <TableRow>
                                        <TableHead className="w-[40%]">Account</TableHead>
                                        <TableHead className="w-[20%]">Debit</TableHead>
                                        <TableHead className="w-[20%]">Credit</TableHead>
                                        <TableHead className="w-[10%] text-right">Action</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {lines.map((line, i) => (
                                        <TableRow key={i}>
                                            <TableCell className="p-2">
                                                <Select
                                                    value={line.account_id || undefined}
                                                    onChange={e => updateLine(i, 'account_id', e.target.value)}
                                                    placeholder="-- Select Account --"
                                                    options={accounts.map(a => ({
                                                        label: `${a.code} - ${a.name} (${a.account_type || 'ASSET'})`,
                                                        value: a.id,
                                                        searchText: `${a.code} ${a.name} ${a.account_type || 'ASSET'}`,
                                                        content: (
                                                            <div className="flex items-center justify-between w-full gap-3">
                                                                <span className="text-sm font-medium text-slate-700">{a.code} - {a.name}</span>
                                                                <Badge variant="outline" className="text-[10px] uppercase tracking-wide px-2 py-0.5">{a.account_type || 'ASSET'}</Badge>
                                                            </div>
                                                        )
                                                    }))}
                                                    className="!mb-0"
                                                />
                                            </TableCell>
                                            <TableCell className="p-2">
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    value={line.debit === 0 ? "" : line.debit}
                                                    onChange={e => {
                                                        const val = e.target.value
                                                        updateLine(i, 'debit', val === "" ? 0 : parseFloat(val))
                                                    }}
                                                    containerClassName="!mb-0"
                                                />
                                            </TableCell>
                                            <TableCell className="p-2">
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    value={line.credit === 0 ? "" : line.credit}
                                                    onChange={e => {
                                                        const val = e.target.value
                                                        updateLine(i, 'credit', val === "" ? 0 : parseFloat(val))
                                                    }}
                                                    containerClassName="!mb-0"
                                                />
                                            </TableCell>
                                            <TableCell className="p-2 text-right">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => removeLine(i)}
                                                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                                    icon={<Icons.Trash className="w-4 h-4" />}
                                                />
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>

                        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-2">
                            <Button variant="outline" onClick={addLine} icon={<Icons.Plus className="w-4 h-4" />}>
                                Add Line
                            </Button>

                            <div className="flex flex-col sm:flex-row items-center gap-6 w-full sm:w-auto">
                                <div className="flex gap-6 text-sm bg-gray-50 px-4 py-2 rounded-lg border border-gray-100">
                                    <div className="flex flex-col items-end">
                                        <span className="text-gray-500 text-xs uppercase tracking-wider">Total Debit</span>
                                        <span className="font-mono font-bold text-gray-900">{formatCurrency(totalDebit)}</span>
                                    </div>
                                    <div className="h-full w-px bg-gray-200"></div>
                                    <div className="flex flex-col items-end">
                                        <span className="text-gray-500 text-xs uppercase tracking-wider">Total Credit</span>
                                        <span className="font-mono font-bold text-gray-900">{formatCurrency(totalCredit)}</span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <Badge variant={isBalanced ? 'success' : 'destructive'} className="h-9 px-3">
                                        {isBalanced ? 'Balanced' : 'Unbalanced'}
                                    </Badge>

                                    <Button
                                        className="bg-blue-600 hover:bg-blue-700 min-w-[140px]"
                                        onClick={handleSave}
                                        disabled={loading || !isBalanced || !confirmOpening}
                                        isLoading={loading}
                                        icon={<Icons.Save className="w-4 h-4" />}
                                    >
                                        Save Balance
                                    </Button>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 text-sm text-gray-600">
                            <input
                                id="confirm-opening"
                                type="checkbox"
                                checked={confirmOpening}
                                onChange={(e) => setConfirmOpening(e.target.checked)}
                            />
                            <label htmlFor="confirm-opening">
                                Saya paham ini khusus Opening Balance (bukan jurnal operasional).
                            </label>
                        </div>
                    </div>
                </Section>
            )}

            <Section
                title="History"
                description="Previous opening balance entries."
            >
                <div className="rounded-md border border-gray-200 overflow-hidden">
                    <Table>
                        <TableHeader className="bg-gray-50">
                            <TableRow>
                                <TableHead>As of Date</TableHead>
                                <TableHead>Total Debit</TableHead>
                                <TableHead>Total Credit</TableHead>
                                <TableHead>Entries</TableHead>
                                <TableHead className="text-right">Action</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {history.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                                        No opening balance entries found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                history.map(h => (
                                    <Fragment key={h.date}>
                                        <TableRow className="hover:bg-gray-50/50">
                                            <TableCell className="font-medium">{new Date(h.date).toLocaleDateString('id-ID', { dateStyle: 'long' })}</TableCell>
                                            <TableCell>{formatCurrency(h.debit)}</TableCell>
                                            <TableCell>{formatCurrency(h.credit)}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="text-xs bg-white">
                                                    {h.count} Lines
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-2">
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => handleLoad(h.date)}
                                                        icon={<Icons.Edit className="w-4 h-4" />}
                                                        title="Load this data"
                                                    >
                                                        Edit
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => setExpandedDate(expandedDate === h.date ? null : h.date)}
                                                    >
                                                        {expandedDate === h.date ? 'Hide' : 'Detail'}
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                        {expandedDate === h.date && historyDetails[h.date] && (
                                            <TableRow>
                                                <TableCell colSpan={5} className="bg-gray-50 p-4 border-t border-b border-gray-100 shadow-inner">
                                                    <div className="text-sm font-semibold mb-3 text-gray-700 flex items-center gap-2">
                                                        <Icons.Menu className="w-4 h-4" />
                                                        Detail per Akun
                                                    </div>
                                                    <div className="rounded border border-gray-200 bg-white overflow-hidden">
                                                        <Table>
                                                            <TableHeader className="bg-gray-50/50">
                                                                <TableRow>
                                                                    <TableHead className="text-xs uppercase tracking-wider">Akun</TableHead>
                                                                    <TableHead className="text-xs uppercase tracking-wider text-right">Debit</TableHead>
                                                                    <TableHead className="text-xs uppercase tracking-wider text-right">Credit</TableHead>
                                                                </TableRow>
                                                            </TableHeader>
                                                            <TableBody>
                                                                {historyDetails[h.date].map((detail, idx) => (
                                                                    <TableRow key={`${detail.account_id}-${idx}`}>
                                                                        <TableCell className="text-sm font-medium text-gray-700">
                                                                            {detail.code ? <span className="font-mono text-gray-500 mr-2">{detail.code}</span> : null}
                                                                            {detail.name || detail.account_id}
                                                                        </TableCell>
                                                                        <TableCell className="text-right font-mono text-sm">{formatCurrency(detail.debit)}</TableCell>
                                                                        <TableCell className="text-right font-mono text-sm">{formatCurrency(detail.credit)}</TableCell>
                                                                    </TableRow>
                                                                ))}
                                                            </TableBody>
                                                        </Table>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </Fragment>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </Section>
        </div>
    )
}
