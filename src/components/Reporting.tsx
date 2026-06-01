import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/Tabs'
import { Button } from './ui/Button'
import { DatePicker } from './ui/DatePicker'
import { Select } from './ui/Select'
import { Icons } from './ui/Icons'
import { PageHeader } from './ui/PageHeader'
import { Section } from './ui/Section'
import { Badge } from './ui/Badge'
import { getErrorMessage } from '../lib/errors'

type AccountBalance = {
    account_id: string
    code: string
    name: string
    account_type: string
    opening_balance: number
    debit_movement: number
    credit_movement: number
    closing_balance: number
}

type GLLine = {
    journal_date: string
    ref_type: string
    ref_no: string
    memo: string
    debit: number
    credit: number
}

type CashflowLine = {
    category: string
    description: string
    amount: number
}

type Account = { id: string, name: string, code: string, account_type: string }

export default function Reporting() {
    const navigate = useNavigate()
    const requestIdRef = useRef(0)
    const [startDate, setStartDate] = useState(() => {
        const d = new Date()
        return new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString('en-CA')
    })
    const [endDate, setEndDate] = useState(() => {
        const d = new Date()
        return new Date(d.getFullYear(), d.getMonth() + 1, 0).toLocaleDateString('en-CA')
    })
    const [loading, setLoading] = useState(false)
    const [data, setData] = useState<AccountBalance[]>([])
    const [error, setError] = useState<string | null>(null)
    const [isOwner, setIsOwner] = useState(false)

    // GL State
    const [glAccount, setGlAccount] = useState('')
    const [glData, setGlData] = useState<GLLine[]>([])
    const [accounts, setAccounts] = useState<Account[]>([])

    // Cashflow State
    const [cashflowData, setCashflowData] = useState<CashflowLine[]>([])

    // Active tab tracking
    const [activeTab, setActiveTab] = useState('TB')

    // Trigger fetch on tab or filter change
    useEffect(() => {
        fetchAccounts()
    }, [])

    useEffect(() => {
        let active = true
        const loadRole = async () => {
            try {
                const { data } = await supabase.auth.getUser()
                if (!data?.user) return
                const { data: profile } = await supabase
                    .from('user_profiles')
                    .select('role')
                    .eq('id', data.user.id)
                    .single()
                if (active) setIsOwner((profile?.role || '').toUpperCase() === 'OWNER')
            } catch {
                if (active) setIsOwner(false)
            }
        }
        loadRole()
        return () => { active = false }
    }, [])

    useEffect(() => {
        const requestId = ++requestIdRef.current
        let cancelled = false
        const isStale = () => cancelled || requestId !== requestIdRef.current

        if (startDate > endDate) {
            if (!isStale()) {
                setError('Start date must be on or before end date.')
                setLoading(false)
                if (activeTab === 'GL') setGlData([])
                else if (activeTab === 'CF') setCashflowData([])
                else setData([])
            }
            return
        }

        if (activeTab === 'GL' && !glAccount) {
            if (!isStale()) {
                setError(null)
                setLoading(false)
                setGlData([])
            }
            return
        }

        const fetchReportData = async () => {
            if (!isStale()) {
                setLoading(true)
                setError(null)
            }

            try {
                if (activeTab === 'GL') {
                    const { data, error } = await supabase.rpc('rpc_get_gl', {
                        p_account_id: glAccount,
                        p_start_date: startDate,
                        p_end_date: endDate
                    })
                    if (error) throw error
                    if (isStale()) return
                    setGlData(data || [])
                } else if (activeTab === 'CF') {
                    const { data, error } = await supabase.rpc('rpc_get_cashflow', {
                        p_start_date: startDate,
                        p_end_date: endDate
                    })
                    if (error) throw error
                    if (isStale()) return
                    setCashflowData(data || [])
                } else {
                    // TB, BS, PL rely on Balances
                    const { data, error } = await supabase.rpc('rpc_get_account_balances', {
                        p_start_date: startDate,
                        p_end_date: endDate
                    })
                    if (error) throw error
                    if (isStale()) return
                    setData(data || [])
                }
            } catch (err: unknown) {
                if (isStale()) return
                if (activeTab === 'GL') setGlData([])
                else if (activeTab === 'CF') setCashflowData([])
                else setData([])
                setError(getErrorMessage(err))
            } finally {
                if (!isStale()) {
                    setLoading(false)
                }
            }
        }

        fetchReportData()

        return () => {
            cancelled = true
        }
    }, [activeTab, startDate, endDate, glAccount])

    async function fetchAccounts() {
        const { data } = await supabase.from('accounts').select('id, name, code, account_type').order('code')
        setAccounts(data || [])
    }

    // UTILS
    const fmt = (n: number) => n?.toLocaleString('id-ID', { minimumFractionDigits: 2 })

    const getAccountType = (row: AccountBalance) => {
        if (row.account_type) return row.account_type
        if (row.code.startsWith('1')) return 'ASSET'
        if (row.code.startsWith('2')) return 'LIABILITY'
        if (row.code.startsWith('3')) return 'EQUITY'
        if (row.code.startsWith('4')) return 'REVENUE'
        if (row.code.startsWith('5')) return 'COGS'
        return 'EXPENSE'
    }

    // DB stores balances in net-debit basis (debit - credit).
    // LIABILITY, EQUITY, REVENUE have normal credit balance → must invert for display.
    const isNormalCredit = (row: AccountBalance) => {
        const t = getAccountType(row)
        return t === 'LIABILITY' || t === 'EQUITY' || t === 'REVENUE'
    }

    const getDisplayedClosingBalance = (row: AccountBalance, invert = false) =>
        invert ? -row.closing_balance : row.closing_balance

    // Returns the balance in its natural sign for display (positive = normal balance)
    const displayBalance = (val: number, row: AccountBalance) =>
        isNormalCredit(row) ? -val : val

    const getPeriodAmount = (row: AccountBalance) => {
        const accountType = getAccountType(row)
        if (accountType === 'REVENUE') return row.credit_movement - row.debit_movement
        if (accountType === 'COGS' || accountType === 'EXPENSE') return row.debit_movement - row.credit_movement
        return row.debit_movement - row.credit_movement
    }

    // Balance Sheet Logic
    const assets = data.filter(d => getAccountType(d) === 'ASSET')
    const liabs = data.filter(d => getAccountType(d) === 'LIABILITY')
    const equity = data.filter(d => getAccountType(d) === 'EQUITY')

    // P&L Logic
    const revenue = data.filter(d => getAccountType(d) === 'REVENUE')
    const cogs = data.filter(d => getAccountType(d) === 'COGS')
    const expense = data.filter(d => getAccountType(d) === 'EXPENSE')

    const sum = (list: AccountBalance[]) => list.reduce((acc, curr) => acc + curr.closing_balance, 0)
    const sumPeriod = (list: AccountBalance[]) => list.reduce((acc, curr) => acc + getPeriodAmount(curr), 0)
    const currentYearEarnings = -(sum(revenue) + sum(cogs) + sum(expense))
    const totalAsset = sum(assets)
    const totalLiab = -sum(liabs)
    const totalEquity = -sum(equity) + currentYearEarnings
    const periodRevenue = sumPeriod(revenue)
    const periodCogs = sumPeriod(cogs)
    const periodExpense = sumPeriod(expense)
    const grossProfit = periodRevenue - periodCogs
    const periodNetIncome = grossProfit - periodExpense

    // Helper to render Account Rows
    const AccountRow = ({ item, invert = false }: { item: AccountBalance, invert?: boolean }) => {
        const displayedBalance = getDisplayedClosingBalance(item, invert)

        return (
        <div className="flex justify-between items-center py-2 border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors px-2 rounded-sm group">
            <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{item.code}</span>
                <span className="text-sm text-slate-700 font-medium group-hover:text-slate-900 transition-colors">{item.name}</span>
            </div>
            <span className={`font-mono text-sm ${displayedBalance < 0 ? 'text-red-600' : 'text-slate-700'}`}>
                {fmt(displayedBalance)}
            </span>
        </div>
    )
    }

    const PrintFrame = ({ children }: { children: ReactNode }) => (
        <div className="print:w-[210mm] print:mx-auto print:bg-white print:text-black print:font-sans print:leading-tight print:px-8 print:py-6 print:relative print:!mt-0">
            <div className="hidden print:block absolute top-0 right-0 h-full w-2 bg-[#EE2E24] z-0"></div>
            <div className="hidden print:block absolute top-0 right-2 w-24 h-24 bg-gradient-to-bl from-gray-100 to-transparent z-0 opacity-50"></div>
            <div className="print:relative print:z-10">
                {children}
            </div>
        </div>
    )

    // Print Header Component
    const PrintHeader = ({ title }: { title: string }) => (
        <div className="hidden print:block mb-6 border-b-2 border-slate-200 pb-4">
            <div className="flex justify-between items-start">
                <div className="w-1/2">
                    <div className="flex flex-col">
                        <div className="text-3xl font-black tracking-tight leading-none text-black italic">
                            <span className="text-[#EE2E24]">Z</span>IYADA
                            <span className="text-gray-400 font-light not-italic ml-1 text-lg">SPORT</span>
                        </div>
                        <div className="text-[7px] font-bold tracking-[0.2em] text-[#EE2E24] uppercase mt-1 pl-1">
                            Dare to be Different
                        </div>
                    </div>
                    <div className="mt-4">
                        <div className="text-[10px] font-bold text-gray-900 border-l-2 border-[#EE2E24] pl-2 uppercase">
                            Financial Report
                        </div>
                        <div className="text-[9px] text-gray-500 pl-2 mt-0.5 font-mono">
                            {title}
                        </div>
                    </div>
                </div>
                <div className="w-[40%] text-right pt-1">
                    <div className="text-[7px] uppercase tracking-wider text-gray-500 font-bold mb-0.5">Periode</div>
                    <div className="text-[10px] font-bold text-gray-900">
                        {startDate} - {endDate}
                    </div>
                    <div className="text-[8px] text-gray-500 mt-1">
                        Printed on: {new Date().toLocaleDateString()}
                    </div>
                </div>
            </div>
        </div>
    )

    return (
        <div className="w-full space-y-6 pb-20 print:pb-0 print:space-y-0">
            <div className="print:hidden">
                <PageHeader
                    title="Financial Reports"
                    description="Comprehensive financial statements and transaction history."
                    breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Finance Reports" }]}
                    actions={
                        <div className="flex gap-2">
                            {isOwner && (
                                <Button
                                    variant="success"
                                    icon={<Icons.Wallet className="w-4 h-4" />}
                                    onClick={() => navigate('/opening-balance')}
                                >
                                    Opening Balance
                                </Button>
                            )}
                            <Button
                                variant="primary"
                                icon={<Icons.Calendar className="w-4 h-4" />}
                                onClick={() => navigate('/period-lock')}
                            >
                                Period Management
                            </Button>
                            <Button variant="outline" icon={<Icons.Printer className="w-4 h-4" />} onClick={() => window.print()}>Print</Button>
                        </div>
                    }
                />
            </div>

            <Tabs defaultValue="TB" onValueChange={(val) => setActiveTab(val)} className="space-y-6 print:space-y-0">
                <div className="print:hidden flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-white border border-slate-200 p-2 rounded-xl shadow-sm">
                    <TabsList className="bg-slate-100/50 p-1 rounded-lg inline-flex gap-1 overflow-x-auto max-w-full">
                        <TabsTrigger value="TB" className="data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm px-3 py-1.5 rounded-md transition-all flex items-center gap-2 text-sm whitespace-nowrap"><Icons.FileText className="w-4 h-4" /> Trial Balance</TabsTrigger>
                        <TabsTrigger value="BS" className="data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm px-3 py-1.5 rounded-md transition-all flex items-center gap-2 text-sm whitespace-nowrap"><Icons.Chart className="w-4 h-4" /> Balance Sheet</TabsTrigger>
                        <TabsTrigger value="PL" className="data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm px-3 py-1.5 rounded-md transition-all flex items-center gap-2 text-sm whitespace-nowrap"><Icons.TrendingUp className="w-4 h-4" /> Profit & Loss</TabsTrigger>
                        <TabsTrigger value="CF" className="data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm px-3 py-1.5 rounded-md transition-all flex items-center gap-2 text-sm whitespace-nowrap"><Icons.DollarSign className="w-4 h-4" /> Cash Flow</TabsTrigger>
                        <TabsTrigger value="GL" className="data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm px-3 py-1.5 rounded-md transition-all flex items-center gap-2 text-sm whitespace-nowrap"><Icons.History className="w-4 h-4" /> General Ledger</TabsTrigger>
                    </TabsList>

                    <div className="flex items-center gap-2 w-full xl:w-auto px-2 pb-2 xl:pb-0">
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                            <span className="text-xs font-semibold text-slate-500 uppercase whitespace-nowrap">Period:</span>
                            <DatePicker
                                value={startDate}
                                onChange={(value) => setStartDate(value)}
                                containerClassName="!mb-0 w-full sm:w-auto"
                                className="h-9 text-sm py-1"
                            />
                            <span className="text-slate-400">-</span>
                            <DatePicker
                                value={endDate}
                                onChange={(value) => setEndDate(value)}
                                containerClassName="!mb-0 w-full sm:w-auto"
                                className="h-9 text-sm py-1"
                            />
                        </div>
                    </div>
                </div>

                {error && (
                    <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2 print:hidden">
                        <Icons.AlertCircle className="w-5 h-5 flex-shrink-0" />
                        <span className="font-medium">{error}</span>
                    </div>
                )}

                {loading && (
                    <div className="w-full flex justify-center py-12 print:hidden">
                        <div className="flex flex-col items-center gap-3">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                            <p className="text-slate-500 text-sm font-medium">Crunching the numbers...</p>
                        </div>
                    </div>
                )}

                {!loading && (
                    <div className="animate-in fade-in duration-300">
                        <TabsContent value="TB" className="print:block print:pt-0">
                            <PrintFrame>
                                <PrintHeader title="Trial Balance" />
                                <Section title="Trial Balance" description="Closing balances for all accounts." className="border-t-4 border-t-indigo-500 print:border-none print:shadow-none print:p-0">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm text-left whitespace-nowrap">
                                            <thead className="bg-slate-50 text-slate-600 uppercase text-xs font-semibold tracking-wider border-b border-slate-200">
                                                <tr>
                                                    <th className="px-6 py-3 print:px-2 print:py-1">Code</th>
                                                    <th className="px-6 py-3 print:px-2 print:py-1">Account Name</th>
                                                    <th className="px-6 py-3 text-right print:px-2 print:py-1">Opening</th>
                                                    <th className="px-6 py-3 text-right text-emerald-600 print:px-2 print:py-1">Debit</th>
                                                    <th className="px-6 py-3 text-right text-rose-600 print:px-2 print:py-1">Credit</th>
                                                    <th className="px-6 py-3 text-right text-slate-900 print:px-2 print:py-1">Closing</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {data.map(d => (
                                                    <tr key={d.account_id} className="hover:bg-indigo-50/30 transition-colors print:hover:bg-transparent">
                                                        <td className="px-6 py-3 font-mono text-xs text-slate-500 print:px-2 print:py-1">{d.code}</td>
                                                        <td className="px-6 py-3 font-medium text-slate-900 print:px-2 print:py-1">{d.name}</td>
                                                        <td className="px-6 py-3 text-right text-slate-500 font-mono print:px-2 print:py-1">{fmt(displayBalance(d.opening_balance, d))}</td>
                                                        <td className="px-6 py-3 text-right text-emerald-600 font-mono print:px-2 print:py-1">{fmt(d.debit_movement)}</td>
                                                        <td className="px-6 py-3 text-right text-rose-600 font-mono print:px-2 print:py-1">{fmt(d.credit_movement)}</td>
                                                        <td className="px-6 py-3 text-right font-bold text-slate-900 font-mono print:px-2 print:py-1">{fmt(displayBalance(d.closing_balance, d))}</td>
                                                    </tr>
                                                ))}
                                                {data.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-slate-400">No data available for this period.</td></tr>}
                                            </tbody>
                                        </table>
                                    </div>
                                </Section>
                            </PrintFrame>
                        </TabsContent>

                        <TabsContent value="BS" className="print:block print:pt-0">
                            <PrintFrame>
                                <PrintHeader title="Balance Sheet" />
                                <div className="max-w-6xl mx-auto">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print:grid-cols-2 print:gap-4">
                                    {/* ASSETS */}
                                    <Section title="Assets" description="What the company owns." className="border-t-4 border-t-emerald-500 h-full print:border-none print:shadow-none print:p-0">
                                        <div className="flex flex-col h-[600px] print:h-auto">
                                            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                                                {assets.map(d => <AccountRow key={d.account_id} item={d} />)}
                                                {assets.length === 0 && <p className="text-center text-slate-400 py-4 italic">No asset accounts found.</p>}
                                            </div>
                                            <div className="pt-4 border-t-2 border-slate-100 mt-4 bg-slate-50/50 p-4 rounded-lg flex justify-between items-center relative overflow-hidden group print:bg-transparent print:p-2 print:pt-4 print:mt-auto">
                                                <div className="absolute inset-0 bg-emerald-500/5 group-hover:bg-emerald-500/10 transition-colors print:hidden"></div>
                                                <span className="font-bold text-slate-700 z-10 uppercase tracking-wide text-xs">Total Assets</span>
                                                <span className="font-bold text-xl text-emerald-700 z-10 font-mono">{fmt(totalAsset)}</span>
                                            </div>
                                        </div>
                                    </Section>

                                    {/* LIABILITIES & EQUITY */}
                                    <Section title="Liabilities & Equity" description="What the company owes." className="border-t-4 border-t-purple-500 h-full print:border-none print:shadow-none print:p-0">
                                        <div className="flex flex-col h-[600px] print:h-auto">
                                            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-6">
                                                {/* Liabilities */}
                                                <div>
                                                    <h4 className="flex items-center gap-2 font-semibold text-xs uppercase text-slate-500 mb-3 tracking-wider print:mb-1">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-rose-400 print:hidden"></div> Liabilities
                                                    </h4>
                                                    <div className="mb-2">
                                                        {liabs.map(d => <AccountRow key={d.account_id} item={d} invert />)}
                                                        {liabs.length === 0 && <p className="text-sm text-slate-400 italic px-2">No liability accounts.</p>}
                                                    </div>
                                                </div>

                                                {/* Equity */}
                                                <div>
                                                    <h4 className="flex items-center gap-2 font-semibold text-xs uppercase text-slate-500 mb-3 tracking-wider print:mb-1">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 print:hidden"></div> Equity
                                                    </h4>
                                                    <div>
                                                        {equity.map(d => <AccountRow key={d.account_id} item={d} invert />)}
                                                        <div className="flex justify-between items-center py-2 border-b border-slate-50 px-2 rounded-sm bg-indigo-50/30 print:bg-transparent">
                                                            <div className="flex items-center gap-3">
                                                                <span className="font-mono text-xs text-indigo-400 bg-indigo-100 px-1.5 py-0.5 rounded print:bg-transparent print:text-slate-600">RET</span>
                                                                <span className="text-sm text-indigo-900 font-medium print:text-slate-800">Current Year Earnings</span>
                                                            </div>
                                                            <span className={`font-mono text-sm font-bold ${currentYearEarnings < 0 ? 'text-red-600' : 'text-indigo-700'}`}>
                                                                {fmt(currentYearEarnings)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Summary */}
                                            <div className="pt-4 border-t-2 border-slate-100 mt-4 bg-slate-50/50 p-4 rounded-lg flex justify-between items-center relative overflow-hidden group print:bg-transparent print:p-2 print:pt-4 print:mt-auto">
                                                <div className="absolute inset-0 bg-purple-500/5 group-hover:bg-purple-500/10 transition-colors print:hidden"></div>
                                                <span className="font-bold text-slate-700 z-10 uppercase tracking-wide text-xs">Total Liab & Equity</span>
                                                <span className="font-bold text-xl text-purple-700 z-10 font-mono">{fmt(totalLiab + totalEquity)}</span>
                                            </div>
                                        </div>
                                    </Section>
                                </div>

                                {/* Balance Check - Moved Outside & Centered */}
                                <div className={`mt-8 p-3 rounded-full border-2 flex items-center justify-center gap-3 w-fit mx-auto shadow-sm px-8 ${Math.abs(totalAsset - (totalLiab + totalEquity)) < 1
                                    ? 'bg-emerald-50 border-emerald-100 text-emerald-800'
                                    : 'bg-red-50 border-red-200 text-red-800'
                                    } print:bg-transparent print:border-slate-300 print:text-slate-800 print:mt-4 print:shadow-none print:w-full print:rounded-lg`}>
                                    {Math.abs(totalAsset - (totalLiab + totalEquity)) < 1 ? (
                                        <>
                                            <Icons.CheckCircle className="w-5 h-5 text-emerald-600 print:text-slate-600" />
                                            <span className="font-bold text-sm uppercase tracking-wide">Balance Sheet is Balanced</span>
                                        </>
                                    ) : (
                                        <>
                                            <Icons.AlertCircle className="w-5 h-5" />
                                            <span className="font-bold text-sm uppercase tracking-wide">Unbalanced: Diff {fmt(totalAsset - (totalLiab + totalEquity))}</span>
                                        </>
                                    )}
                                </div>
                            </div>
                            </PrintFrame>
                        </TabsContent>

                        <TabsContent value="PL" className="print:block print:pt-0">
                            <PrintFrame>
                                <PrintHeader title="Profit & Loss" />
                                <Section title="Income Statement" description="Profit and Loss statement for the period." className="border-t-4 border-t-blue-500 max-w-4xl mx-auto print:border-none print:shadow-none print:p-0 print:max-w-none">
                                    <div className="space-y-8 p-4 print:p-0 print:space-y-4">
                                    <div>
                                        <h4 className="text-lg font-bold text-slate-800 mb-4 pb-2 border-b border-slate-200 flex justify-between items-center print:mb-2 print:text-base">
                                            <span>Revenue</span>
                                            <span className="text-sm font-normal text-slate-500 uppercase tracking-wider">Income</span>
                                        </h4>
                                        <div className="space-y-1">
                                            {revenue.map(d => (
                                                <div key={d.account_id} className="flex justify-between py-2 border-b border-slate-50 last:border-0 hover:bg-slate-50 px-2 rounded transition-colors print:py-1 print:border-slate-200 print:hover:bg-transparent">
                                                    <span className="text-slate-700">{d.name}</span>
                                                    <span className="font-mono font-medium text-slate-900">{fmt(getPeriodAmount(d))}</span>
                                                </div>
                                            ))}
                                            <div className="flex justify-between py-3 mt-2 bg-blue-50/50 px-3 rounded font-bold text-blue-900 print:bg-transparent print:text-slate-900 print:py-1 print:border-t-2 print:border-slate-300 print:mt-1">
                                                <span>Total Revenue</span>
                                                <span className="font-mono">{fmt(periodRevenue)}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <h4 className="text-lg font-bold text-slate-800 mb-4 pb-2 border-b border-slate-200 flex justify-between items-center print:mb-2 print:text-base">
                                            <span>Cost of Goods Sold</span>
                                            <span className="text-sm font-normal text-slate-500 uppercase tracking-wider">COGS</span>
                                        </h4>
                                        <div className="space-y-1">
                                            {cogs.map(d => (
                                                <div key={d.account_id} className="flex justify-between py-2 border-b border-slate-50 last:border-0 hover:bg-slate-50 px-2 rounded transition-colors print:py-1 print:border-slate-200 print:hover:bg-transparent">
                                                    <span className="text-slate-700">{d.name}</span>
                                                    <span className="font-mono font-medium text-slate-900">{fmt(getPeriodAmount(d))}</span>
                                                </div>
                                            ))}
                                            <div className="flex justify-between py-3 mt-2 bg-amber-50/50 px-3 rounded font-bold text-amber-900 print:bg-transparent print:text-slate-900 print:py-1 print:border-t-2 print:border-slate-300 print:mt-1">
                                                <span>Total COGS</span>
                                                <span className="font-mono">{fmt(periodCogs)}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <div className="flex justify-between items-center p-4 bg-slate-100 rounded-lg border border-slate-200 shadow-sm print:bg-transparent print:border-none print:p-0 print:py-2">
                                            <span className="font-bold text-slate-700 uppercase tracking-wide">Gross Profit</span>
                                            <span className="font-bold text-2xl font-mono text-slate-900 print:text-xl">{fmt(grossProfit)}</span>
                                        </div>
                                    </div>

                                    <div>
                                        <h4 className="text-lg font-bold text-slate-800 mb-4 pb-2 border-b border-slate-200 flex justify-between items-center print:mb-2 print:text-base">
                                            <span>Operating Expenses</span>
                                            <span className="text-sm font-normal text-slate-500 uppercase tracking-wider">OPEX</span>
                                        </h4>
                                        <div className="space-y-1">
                                            {expense.map(d => (
                                                <div key={d.account_id} className="flex justify-between py-2 border-b border-slate-50 last:border-0 hover:bg-slate-50 px-2 rounded transition-colors print:py-1 print:border-slate-200 print:hover:bg-transparent">
                                                    <span className="text-slate-700">{d.name}</span>
                                                    <span className="font-mono font-medium text-slate-900">{fmt(getPeriodAmount(d))}</span>
                                                </div>
                                            ))}
                                            <div className="flex justify-between py-3 mt-2 bg-rose-50/50 px-3 rounded font-bold text-rose-900 print:bg-transparent print:text-slate-900 print:py-1 print:border-t-2 print:border-slate-300 print:mt-1">
                                                <span>Total Expenses</span>
                                                <span className="font-mono">{fmt(periodExpense)}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className={`flex justify-between items-center p-6 rounded-xl border-2 shadow-sm transform transition-all hover:scale-[1.01] ${periodNetIncome >= 0
                                        ? 'bg-emerald-50 border-emerald-100'
                                        : 'bg-rose-50 border-rose-100'
                                        } print:bg-transparent print:border-slate-900 print:shadow-none print:p-4 print:mt-4`}>
                                        <div className="flex flex-col">
                                            <span className={`text-sm font-bold uppercase tracking-wider ${periodNetIncome >= 0 ? 'text-emerald-600' : 'text-rose-600'} print:text-slate-900`}>Net Income</span>
                                            <span className="text-xs text-slate-500">Total comprehensive income for the period</span>
                                        </div>
                                        <span className={`text-3xl font-black font-mono tracking-tight ${periodNetIncome >= 0 ? 'text-emerald-700' : 'text-rose-700'} print:text-slate-900`}>
                                            {fmt(periodNetIncome)}
                                        </span>
                                    </div>
                                    </div>
                                </Section>
                            </PrintFrame>
                        </TabsContent>

                        <TabsContent value="CF" className="print:block print:pt-0">
                            <PrintFrame>
                                <PrintHeader title="Cash Flow" />
                                <Section title="Cash Flow Statement" description="Inflow and outflow of cash." className="border-t-4 border-t-cyan-500 max-w-4xl mx-auto print:border-none print:shadow-none print:p-0 print:max-w-none">
                                {cashflowData.length === 0 ? (
                                    <div className="py-20 text-center text-slate-400 bg-slate-50 rounded-lg border-2 border-dashed border-slate-200 print:bg-transparent">
                                        <Icons.DollarSign className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                                        <p className="text-lg font-medium">No cash flow data available.</p>
                                        <p className="text-sm">Try selecting a different date range.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-1 divide-y divide-slate-100">
                                        {cashflowData.map((line, idx) => {
                                            const isTotal = line.category === 'Closing'
                                            const isNegative = line.amount < 0
                                            return (
                                                <div key={idx} className={`flex justify-between py-3 px-3 hover:bg-slate-50 rounded transition-colors ${isTotal ? 'bg-slate-100 font-bold border-t-2 border-slate-300 mt-4' : ''
                                                    } print:px-0 print:py-1 print:hover:bg-transparent print:bg-transparent`}>
                                                    <div className="flex gap-4">
                                                        <span className="text-slate-500 text-sm w-32 font-medium uppercase tracking-wider print:w-24">{line.category}</span>
                                                        <span className={isTotal ? 'text-slate-900' : 'text-slate-700'}>{line.description}</span>
                                                    </div>
                                                    <span className={`font-mono font-medium ${isTotal
                                                        ? 'text-slate-900 text-lg'
                                                        : isNegative ? 'text-rose-600' : 'text-emerald-600'
                                                        } print:text-slate-900`}>
                                                        {fmt(line.amount)}
                                                    </span>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                                </Section>
                            </PrintFrame>
                        </TabsContent>

                        <TabsContent value="GL" className="print:block print:pt-0">
                            <PrintFrame>
                                <PrintHeader title="General Ledger" />
                                <Section title="General Ledger" description="Detailed transaction history." className="border-t-4 border-t-orange-500 print:border-none print:shadow-none print:p-0">
                                <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row gap-4 items-end mb-4 rounded-lg print:hidden">
                                    <div className="flex-1 w-full">
                                        <Select
                                            label="Select Account"
                                            value={glAccount}
                                            onChange={e => setGlAccount(e.target.value)}
                                            options={[
                                                { label: "-- Select an Account --", value: "" },
                                                ...accounts.map(a => ({
                                                    label: `${a.code} - ${a.name} (${a.account_type || 'ASSET'})`,
                                                    value: a.id,
                                                    searchText: `${a.code} ${a.name} ${a.account_type || 'ASSET'}`,
                                                    content: (
                                                        <div className="flex items-center justify-between w-full gap-3">
                                                            <span className="text-sm font-medium text-slate-700">{a.code} - {a.name}</span>
                                                            <Badge variant="outline" className="text-[10px] uppercase tracking-wide px-2 py-0.5">
                                                                {a.account_type || 'ASSET'}
                                                            </Badge>
                                                        </div>
                                                    )
                                                }))
                                            ]}
                                            className="w-full !mb-0"
                                        />
                                    </div>
                                </div>

                                {glData.length > 0 ? (
                                    <div className="overflow-x-auto print:overflow-visible">
                                        <table className="w-full text-sm text-left">
                                            <thead className="bg-slate-100 text-slate-600 uppercase text-xs font-bold border-b border-slate-200 print:bg-transparent">
                                                <tr>
                                                    <th className="px-6 py-3 rounded-tl-lg print:px-1 print:py-1">Date</th>
                                                    <th className="px-6 py-3 print:px-1 print:py-1">Reference</th>
                                                    <th className="px-6 py-3 print:px-1 print:py-1">Description</th>
                                                    <th className="px-6 py-3 text-right print:px-1 print:py-1">Debit</th>
                                                    <th className="px-6 py-3 text-right rounded-tr-lg print:px-1 print:py-1">Credit</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {glData.map((row, i) => (
                                                    <tr key={i} className="hover:bg-orange-50/30 transition-colors print:hover:bg-transparent">
                                                        <td className="px-6 py-3 text-slate-900 font-medium whitespace-nowrap print:px-1 print:py-1">{row.journal_date || row.ref_type}</td>
                                                        <td className="px-6 py-3 font-mono text-xs text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer print:px-1 print:py-1 print:text-slate-900 print:no-underline">{row.ref_no}</td>
                                                        <td className="px-6 py-3 text-slate-600 max-w-xs truncate print:px-1 print:py-1 print:max-w-none print:whitespace-normal" title={row.memo}>{row.memo}</td>
                                                        <td className="px-6 py-3 text-right font-mono text-emerald-600 print:px-1 print:py-1 print:text-slate-900">{row.debit > 0 ? fmt(row.debit) : '-'}</td>
                                                        <td className="px-6 py-3 text-right font-mono text-rose-600 print:px-1 print:py-1 print:text-slate-900">{row.credit > 0 ? fmt(row.credit) : '-'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <div className="text-center py-12 text-slate-400 italic">
                                        {glAccount ? "No transactions found for this period." : "Select an account to view transactions."}
                                    </div>
                                )}
                                </Section>
                            </PrintFrame>
                        </TabsContent>
                    </div>
                )}
            </Tabs>
        </div>
    )
}
