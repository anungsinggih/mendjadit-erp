import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from './ui/Card'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { Select } from './ui/Select'
import { Textarea } from './ui/Textarea'
import { Icons } from './ui/Icons'
import { useConfirm } from './ui/ConfirmDialogContext'

export default function DevResetData() {
    const [confirmText, setConfirmText] = useState('')
    const [resetMode, setResetMode] = useState<'TRANSACTIONS_ONLY' | 'FULL'>('TRANSACTIONS_ONLY')
    const [notes, setNotes] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const { confirm } = useConfirm()

    // Environment check (only show in dev)
    const isDev = import.meta.env.DEV || import.meta.env.MODE === 'development'

    async function handleReset() {
        if (confirmText !== 'RESET') {
            setError('You must type "RESET" exactly to proceed')
            return
        }

        const ok = await confirm({
            title: 'Confirm Reset',
            description: (
                <div className="space-y-2 text-sm text-gray-600">
                    <p>
                        This will <span className="font-semibold text-rose-600">DELETE</span>{' '}
                        {resetMode === 'FULL' ? 'ALL DATA (except COA seed)' : 'ALL TRANSACTIONS'}.
                    </p>
                    <p className="font-semibold text-rose-600">This action CANNOT be undone.</p>
                    <p>Are you absolutely sure?</p>
                </div>
            ),
            confirmText: 'Reset',
            cancelText: 'Cancel',
            tone: 'danger'
        })
        if (!ok) return

        setLoading(true)
        setError(null)
        setSuccess(null)

        try {
            const { data, error: rpcError } = await supabase.rpc('rpc_reset_testing_data', {
                p_confirmation_text: confirmText,
                p_reset_mode: resetMode,
                p_notes: notes || null
            })

            if (rpcError) throw rpcError

            setSuccess(`Reset completed successfully!\n\nMode: ${data.mode}\nRecords affected: ${data.affected_records}\nTime: ${new Date(data.reset_at).toLocaleString()}`)
            setConfirmText('')
            setNotes('')
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Failed to reset data'
            setError(msg)
        } finally {
            setLoading(false)
        }
    }

    // Don't render in production
    if (!isDev) {
        return null
    }

    return (
        <div className="w-full">
            <Card className="border-red-500 shadow-lg max-w-2xl mx-auto">
                <CardHeader className="bg-red-50 border-b border-red-200">
                    <CardTitle className="text-red-800 flex items-center gap-2">
                        <Icons.Warning className="w-5 h-5" /> Reset Testing Data (DEV ONLY)
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6 pt-6">
                    <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
                        <p className="text-sm font-semibold text-yellow-800 mb-2 flex items-center gap-2"><Icons.Info className="w-4 h-4" /> Safety Requirements:</p>
                        <ul className="text-xs text-yellow-700 space-y-1 ml-6 list-disc">
                            <li>Only available in development environment</li>
                            <li>Only OWNER role can execute</li>
                            <li>Requires typing "RESET" confirmation</li>
                            <li>Operation is logged in audit trail</li>
                        </ul>
                    </div>

                    {error && (
                        <div className="p-4 bg-red-100 border border-red-300 text-red-800 rounded-md text-sm">
                            <strong>Error:</strong> {error}
                        </div>
                    )}

                    {success && (
                        <div className="p-4 bg-green-100 border border-green-300 text-green-800 rounded-md text-sm whitespace-pre-line flex items-start gap-2">
                            <Icons.Check className="w-5 h-5 flex-shrink-0 mt-0.5" />
                            <div>{success}</div>
                        </div>
                    )}

                    <div className="space-y-4">
                        <Select
                            label="Reset Mode"
                            value={resetMode}
                            onChange={(e) => setResetMode(e.target.value as 'TRANSACTIONS_ONLY' | 'FULL')}
                            options={[
                                {
                                    label: 'Transactions Only (Recommended) - Keeps master data',
                                    value: 'TRANSACTIONS_ONLY'
                                },
                                {
                                    label: 'Full Reset - Deletes everything except COA seed',
                                    value: 'FULL'
                                }
                            ]}
                        />

                        {resetMode === 'TRANSACTIONS_ONLY' && (
                            <div className="text-xs text-gray-600 bg-blue-50 p-3 rounded border border-blue-200">
                                <strong>Transactions Only Mode:</strong>
                                <ul className="mt-2 space-y-1 ml-4 list-disc">
                                    <li>Deletes: Sales, Purchases, Returns, Receipts, Payments</li>
                                    <li>Deletes: Journals, AR/AP, Period data</li>
                                    <li>Resets: Inventory stock to zero</li>
                                    <li>Preserves: Items, Customers, Vendors, COA</li>
                                </ul>
                            </div>
                        )}

                        {resetMode === 'FULL' && (
                            <div className="text-xs text-red-600 bg-red-50 p-3 rounded border border-red-300">
                                <strong className="flex items-center gap-1"><Icons.Warning className="w-3 h-3" /> Full Reset Mode (Extreme):</strong>
                                <ul className="mt-2 space-y-1 ml-4 list-disc">
                                    <li>Deletes: ALL transactions (as above)</li>
                                    <li>Deletes: Items, Customers, Vendors</li>
                                    <li>Deletes: Custom COA accounts</li>
                                    <li>Preserves: Only COA seed (1100, 1200, 1300, 2100, 4100, 5100)</li>
                                </ul>
                            </div>
                        )}

                        <Textarea
                            label="Notes (Optional)"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Why are you resetting? (e.g., 'Testing sales return flow', 'Starting new test scenario')"
                            rows={2}
                        />

                        <div className="border-t border-gray-200 pt-4">
                            <Input
                                label='Type "RESET" to confirm (case-sensitive)'
                                value={confirmText}
                                onChange={(e) => setConfirmText(e.target.value)}
                                placeholder="RESET"
                                className="font-mono text-center"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                This is a destructive operation and cannot be undone.
                            </p>
                        </div>
                    </div>
                </CardContent>
                <CardFooter className="bg-gray-50 border-t border-gray-200">
                    <Button
                        onClick={handleReset}
                        disabled={loading || confirmText !== 'RESET'}
                        className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3"
                        icon={<Icons.Trash className="w-5 h-5" />}
                    >
                        {loading ? 'Resetting...' : `Execute ${resetMode === 'FULL' ? 'FULL' : 'Transaction'} Reset`}
                    </Button>
                </CardFooter>
            </Card>

            <div className="mt-6 max-w-2xl mx-auto">
                <Card className="border-gray-300">
                    <CardHeader className="bg-gray-50 border-b border-gray-200">
                        <CardTitle className="text-sm text-gray-700 flex items-center gap-2"><Icons.Info className="w-4 h-4" /> When to Use Each Mode</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4">
                        <div className="space-y-3 text-xs text-gray-600">
                            <div>
                                <strong className="text-blue-600">TRANSACTIONS_ONLY:</strong>
                                <p>Use when you want to test transaction flows without re-creating master data (Items, Customers, Vendors). Good for repeated testing of sales/purchase cycles.</p>
                            </div>
                            <div>
                                <strong className="text-red-600">FULL:</strong>
                                <p>Use when you want a fresh start, close to initial state. You'll need to re-create all master data from scratch. Good for testing complete setup flows.</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
