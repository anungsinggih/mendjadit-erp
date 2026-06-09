import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { PageHeader } from './ui/PageHeader'
import { Section } from './ui/Section'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { Icons } from './ui/Icons'
import { Textarea } from './ui/Textarea'
import { Checkbox } from './ui/Checkbox'
import DevResetData from './DevResetData'

type CompanyProfile = {
    id: string
    name: string
    address: string
    phone: string
    email: string
    bank_name: string
    bank_account: string
    bank_holder: string
    logo_url: string
}

type CompanyBank = {
    id?: string
    code: string
    bank_name: string
    account_number: string
    account_holder: string
    is_active: boolean
    is_default: boolean
}

type UserProfile = {
    id: string
    full_name: string | null
    role: string
}

type InviteRow = {
    email: string
    invited_role: string
    invited_at: string
    notes?: string | null
}

export default function CompanySettings() {
    const [activeTab, setActiveTab] = useState<'user' | 'company' | 'banks' | 'system'>('user')

    // System Availability (Local & Tunnel only)
    const isSystemAvailable = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')

    // User Profile State
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
    const [userLoading, setUserLoading] = useState(true)

    // Role gate
    const isOwner = userProfile?.role === 'OWNER'
    const [userSaving, setUserSaving] = useState(false)
    const [userMessage, setUserMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

    // Company Profile State
    const [profile, setProfile] = useState<CompanyProfile | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

    // Banks State
    const [banks, setBanks] = useState<CompanyBank[]>([])
    const [banksSaving, setBanksSaving] = useState(false)
    const [bankError, setBankError] = useState<string | null>(null)
    const [initialBankIds, setInitialBankIds] = useState<string[]>([])

    // Invite State (Owner only)
    const [invites, setInvites] = useState<InviteRow[]>([])
    const [inviteEmail, setInviteEmail] = useState('')
    const [inviteRole, setInviteRole] = useState<'ADMIN' | 'OWNER'>('ADMIN')
    const [inviteNotes, setInviteNotes] = useState('')
    const [inviteLoading, setInviteLoading] = useState(false)
    const [inviteMessage, setInviteMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

    useEffect(() => {
        fetchCurrentUser()
        fetchProfile()
        fetchBanks()
    }, [])

    useEffect(() => {
        if (userProfile?.role === 'OWNER') {
            fetchInvites()
        }
    }, [userProfile?.role])

    // --- User Profile Logic ---
    async function fetchCurrentUser() {
        setUserLoading(true)
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (session) {
                const { data, error } = await supabase
                    .from('user_profiles')
                    .select('id, full_name, role')
                    .eq('id', session.user.id)
                    .single()

                if (error) throw error
                setUserProfile(data)
            }
        } catch (error) {
            console.error('Error fetching user profile:', error)
        } finally {
            setUserLoading(false)
        }
    }

    async function handleSaveUser(e: React.FormEvent) {
        e.preventDefault()
        if (!userProfile) return

        setUserSaving(true)
        setUserMessage(null)
        try {
            const { error } = await supabase
                .from('user_profiles')
                .update({ full_name: userProfile.full_name })
                .eq('id', userProfile.id)

            if (error) throw error
            setUserMessage({ type: 'success', text: 'Username updated successfully' })
            // trigger a reload or event if needed to update sidebar, but for now local state is enough
            // Ideally App.tsx should listen to changes or re-fetch on navigation, 
            // but we can just let the user see the change here.

            // Dispatch custom event to notify App.tsx (optional optimization)
            window.dispatchEvent(new Event('user-profile-updated'))

        } catch (error: unknown) {
            console.error('Error updating user profile:', error)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const msg = (error as any)?.message || (error instanceof Error ? error.message : 'Unknown error')
            setUserMessage({ type: 'error', text: msg })
        } finally {
            setUserSaving(false)
        }
    }

    async function fetchInvites() {
        try {
            const { data, error } = await supabase
                .from('signup_whitelist')
                .select('email, invited_role, invited_at, notes')
                .order('invited_at', { ascending: false })
            if (error) throw error
            setInvites(data || [])
        } catch (error) {
            console.error('Error fetching invites:', error)
        }
    }

    async function handleInviteUser(e: React.FormEvent) {
        e.preventDefault()
        setInviteMessage(null)
        if (!inviteEmail.trim()) {
            setInviteMessage({ type: 'error', text: 'Email wajib diisi.' })
            return
        }
        setInviteLoading(true)
        try {
            const { error } = await supabase.rpc('invite_user', {
                p_email: inviteEmail.trim().toLowerCase(),
                p_role: inviteRole,
                p_notes: inviteNotes.trim() || null
            })
            if (error) throw error
            setInviteMessage({ type: 'success', text: 'Undangan berhasil dibuat.' })
            setInviteEmail('')
            setInviteNotes('')
            await fetchInvites()
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : 'Gagal membuat undangan.'
            setInviteMessage({ type: 'error', text: msg })
        } finally {
            setInviteLoading(false)
        }
    }

    async function handleRevokeInvite(email: string) {
        setInviteMessage(null)
        setInviteLoading(true)
        try {
            const { error } = await supabase.rpc('revoke_invitation', { p_email: email })
            if (error) throw error
            setInviteMessage({ type: 'success', text: 'Undangan dibatalkan.' })
            await fetchInvites()
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : 'Gagal membatalkan undangan.'
            setInviteMessage({ type: 'error', text: msg })
        } finally {
            setInviteLoading(false)
        }
    }

    // --- Company Profile Logic ---
    async function fetchProfile() {
        try {
            const { data } = await supabase
                .from('company_profile')
                .select('*')
                .single()

            if (data) {
                setProfile(data)
            } else {
                setProfile({
                    id: '',
                    name: '',
                    address: '',
                    phone: '',
                    email: '',
                    bank_name: '',
                    bank_account: '',
                    bank_holder: '',
                    logo_url: ''
                })
            }
        } catch (error: unknown) {
            const pgError = error as { code?: string }
            if (pgError?.code === 'PGRST116') {
                // Initialize empty
                setProfile({
                    id: '',
                    name: '',
                    address: '',
                    phone: '',
                    email: '',
                    bank_name: '',
                    bank_account: '',
                    bank_holder: '',
                    logo_url: ''
                })
            }
        } finally {
            setLoading(false)
        }
    }

    async function handleSaveCompany(e: React.FormEvent) {
        e.preventDefault()
        if (!profile) return

        setSaving(true)
        setMessage(null)

        try {
            const payload = {
                name: profile.name,
                address: profile.address,
                phone: profile.phone,
                email: profile.email,
                bank_name: profile.bank_name,
                bank_account: profile.bank_account,
                bank_holder: profile.bank_holder,
            }

            let result;
            if (profile.id) {
                result = await supabase.from('company_profile').update(payload).eq('id', profile.id)
            } else {
                result = await supabase.from('company_profile').insert([payload]).select().single()
            }

            if (result.error) throw result.error

            if (!profile.id && result.data) {
                setProfile(result.data)
            }

            setMessage({ type: 'success', text: 'Company settings saved successfully' })
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : 'Unknown error'
            setMessage({ type: 'error', text: 'Failed to save settings: ' + msg })
        } finally {
            setSaving(false)
        }
    }

    // --- Banks Logic ---
    async function fetchBanks() {
        const { data, error } = await supabase
            .from('company_banks')
            .select('*')
            .order('is_default', { ascending: false })
            .order('bank_name', { ascending: true })
        if (!error) {
            setBanks(data || [])
            setInitialBankIds((data || []).map((b) => b.id as string))
        }
    }

    const setDefaultBank = (index: number) => {
        setBanks((prev) => prev.map((b, i) => ({ ...b, is_default: i === index })))
    }

    const addBank = () => {
        setBanks((prev) => [
            ...prev,
            {
                code: '',
                bank_name: '',
                account_number: '',
                account_holder: '',
                is_active: true,
                is_default: prev.length === 0
            }
        ])
    }

    const removeBank = (index: number) => {
        setBanks((prev) => prev.filter((_, i) => i !== index))
    }

    async function handleSaveBanks() {
        setBanksSaving(true)
        setBankError(null)
        try {
            if (banks.length === 0) {
                setBankError('Tambahkan minimal 1 bank.')
                return
            }
            let normalizedBanks = banks
            if (!normalizedBanks.some((b) => b.is_default)) {
                normalizedBanks = normalizedBanks.map((b, i) => ({ ...b, is_default: i === 0 }))
                setBanks(normalizedBanks)
            }
            for (const bank of normalizedBanks) {
                if (!bank.code.trim() || !bank.bank_name.trim() || !bank.account_number.trim() || !bank.account_holder.trim()) {
                    throw new Error('Kode, Nama Bank, No Rekening, dan Nama Pemilik wajib diisi.')
                }
            }

            const currentIds = normalizedBanks.filter((b) => b.id).map((b) => b.id as string)
            const toDelete = initialBankIds.filter((id) => !currentIds.includes(id))
            if (toDelete.length) {
                const { error: delError } = await supabase.from('company_banks').delete().in('id', toDelete)
                if (delError) throw delError
            }

            for (const bank of normalizedBanks) {
                const payload = {
                    code: bank.code.trim().toUpperCase(),
                    bank_name: bank.bank_name.trim(),
                    account_number: bank.account_number.trim(),
                    account_holder: bank.account_holder.trim(),
                    is_active: bank.is_active,
                    is_default: bank.is_default
                }
                if (bank.id) {
                    const { error } = await supabase.from('company_banks').update(payload).eq('id', bank.id)
                    if (error) throw error
                } else {
                    const { data: inserted, error } = await supabase.from('company_banks').insert([payload]).select('id')
                    if (error) throw error
                    const insertedId = inserted?.[0]?.id
                    if (insertedId) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        (bank as any).id = insertedId
                    }
                }
            }
            setMessage({ type: 'success', text: 'Bank accounts saved successfully' })
            fetchBanks()
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : 'Unknown error'
            setBankError(msg)
        } finally {
            setBanksSaving(false)
        }
    }


    if (loading && userLoading) return <div className="p-8 text-center"><div className="animate-spin inline-block w-8 h-8 border-4 border-gray-300 border-t-blue-600 rounded-full mb-4"></div><p>Loading settings...</p></div>

    return (
        <div className="max-w-4xl mx-auto pb-12">
            <PageHeader
                title="Settings"
                description="Manage your profile, company details, and system preferences."
                breadcrumbs={[{ label: 'Dashboard', href: '/' }, { label: 'Settings' }]}
            />

            {/* Tabs */}
            <div className="flex flex-wrap gap-1 p-1 bg-slate-100/50 rounded-xl mb-8 overflow-x-auto no-scrollbar border border-slate-200/50">
                <button
                    onClick={() => setActiveTab('user')}
                    className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${activeTab === 'user' ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/50'}`}
                >
                    <Icons.Users className="w-4 h-4" /> User Profile
                </button>
                {isOwner && (
                <button
                    onClick={() => setActiveTab('company')}
                    className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${activeTab === 'company' ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/50'}`}
                >
                    <Icons.Settings className="w-4 h-4" /> Company Profile
                </button>
                )}
                {isOwner && (
                <button
                    onClick={() => setActiveTab('banks')}
                    className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${activeTab === 'banks' ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/50'}`}
                >
                    <Icons.DollarSign className="w-4 h-4" /> Bank Accounts
                </button>
                )}
                {isSystemAvailable && (
                    <button
                        onClick={() => setActiveTab('system')}
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${activeTab === 'system' ? 'bg-white text-rose-600 shadow-sm ring-1 ring-black/5' : 'text-slate-500 hover:text-rose-700 hover:bg-rose-50'}`}
                    >
                        <Icons.Settings className="w-4 h-4" /> System
                    </button>
                )}
            </div>

            {/* Content Area */}
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">

                {/* USER PROFILE TAB */}
                {activeTab === 'user' && (
                    <Section title="User Profile" description="Update your personal information and display name.">
                        {userMessage && (
                            <div className={`mb-6 p-4 rounded-lg flex items-start gap-3 text-sm ${userMessage.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/50' : 'bg-rose-50 text-rose-700 border border-rose-200/50'}`}>
                                {userMessage.type === 'success' ? <Icons.Check className="w-5 h-5 mt-0.5 shrink-0" /> : <Icons.Warning className="w-5 h-5 mt-0.5 shrink-0" />}
                                <div>{userMessage.text}</div>
                            </div>
                        )}
                        <form onSubmit={handleSaveUser} className="space-y-6">
                            <div className="space-y-3">
                                <Input
                                    label="Display Name"
                                    value={userProfile?.full_name || ''}
                                    onChange={(e) => setUserProfile(prev => prev ? { ...prev, full_name: e.target.value } : null)}
                                    placeholder="Enter your name"
                                />
                                <p className="text-xs text-slate-500">This name will be displayed in the sidebar and navigation.</p>
                            </div>
                            <div className="pt-2 flex justify-end">
                                <Button type="submit" disabled={userSaving}>
                                    {userSaving ? 'Saving...' : 'Save Changes'}
                                </Button>
                            </div>
                        </form>
                    </Section>
                )}

                {/* COMPANY PROFILE TAB */}
                {isOwner && activeTab === 'company' && (
                    <form onSubmit={handleSaveCompany}>
                        <Section title="Company Profile" description="These details will appear on your printed invoices.">
                            <div className="space-y-6">
                                {message && (
                                    <div className={`p-4 rounded-lg flex items-center gap-3 border ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200/50' : 'bg-rose-50 text-rose-700 border-rose-200/50'}`}>
                                        {message.type === 'success' ? <Icons.Check className="w-5 h-5" /> : <Icons.Warning className="w-5 h-5" />}
                                        {message.text}
                                    </div>
                                )}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <Input
                                        label="Company Name"
                                        value={profile?.name || ''}
                                        onChange={e => setProfile(prev => prev ? { ...prev, name: e.target.value } : null)}
                                        required
                                    />
                                    <Input
                                        label="Email"
                                        type="email"
                                        value={profile?.email || ''}
                                        onChange={e => setProfile(prev => prev ? { ...prev, email: e.target.value } : null)}
                                    />
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <Input
                                        label="Phone"
                                        value={profile?.phone || ''}
                                        onChange={e => setProfile(prev => prev ? { ...prev, phone: e.target.value } : null)}
                                    />
                                    <div className="col-span-1 md:col-span-2">
                                        <Textarea
                                            label="Address"
                                            value={profile?.address || ''}
                                            onChange={e => setProfile(prev => prev ? { ...prev, address: e.target.value } : null)}
                                            rows={3}
                                        />
                                    </div>
                                </div>
                                <div className="flex justify-end pt-4 border-t border-slate-100">
                                    <Button type="submit" disabled={saving}>
                                        {saving ? 'Saving...' : 'Save Changes'}
                                    </Button>
                                </div>
                            </div>
                        </Section>
                    </form>
                )}

                {/* BANKS TAB */}
                {isOwner && activeTab === 'banks' && (
                    <Section title="Bank Accounts" description="Manage bank accounts used for invoice payments.">
                        <div className="space-y-6">
                            {message && activeTab === 'banks' && (
                                <div className="p-4 bg-emerald-50 text-emerald-700 border border-emerald-200/50 rounded-lg flex items-center gap-3">
                                    <Icons.Check className="w-5 h-5" />
                                    {message.text}
                                </div>
                            )}
                            {bankError && (
                                <div className="bg-rose-50 text-rose-700 p-4 rounded-lg border border-rose-200/50 flex items-center gap-3">
                                    <Icons.Warning className="w-5 h-5 shrink-0" />
                                    {bankError}
                                </div>
                            )}
                            <div className="space-y-4">
                                {banks.map((bank, idx) => (
                                    <div key={bank.id || idx} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end border border-slate-200 rounded-xl p-4 relative group bg-white shadow-sm hover:shadow-md transition-all hover:border-indigo-300/50">
                                        <div className="md:col-span-2">
                                            <Input
                                                label="Code"
                                                placeholder="BCA"
                                                value={bank.code}
                                                onChange={(e) => {
                                                    const val = e.target.value
                                                    setBanks((prev) => prev.map((b, i) => i === idx ? { ...b, code: val } : b))
                                                }}
                                            />
                                        </div>
                                        <div className="md:col-span-3">
                                            <Input
                                                label="Bank Name"
                                                placeholder="Bank BCA"
                                                value={bank.bank_name}
                                                onChange={(e) => {
                                                    const val = e.target.value
                                                    setBanks((prev) => prev.map((b, i) => i === idx ? { ...b, bank_name: val } : b))
                                                }}
                                            />
                                        </div>
                                        <div className="md:col-span-3">
                                            <Input
                                                label="Account Number"
                                                placeholder="123-456-7890"
                                                value={bank.account_number}
                                                onChange={(e) => {
                                                    const val = e.target.value
                                                    setBanks((prev) => prev.map((b, i) => i === idx ? { ...b, account_number: val } : b))
                                                }}
                                            />
                                        </div>
                                        <div className="md:col-span-3">
                                            <Input
                                                label="Account Holder"
                                                placeholder="PT Example"
                                                value={bank.account_holder}
                                                onChange={(e) => {
                                                    const val = e.target.value
                                                    setBanks((prev) => prev.map((b, i) => i === idx ? { ...b, account_holder: val } : b))
                                                }}
                                            />
                                        </div>
                                        <div className="md:col-span-12 flex items-center justify-between pt-2 border-t border-slate-50 mt-2">
                                            <div className="flex gap-4">
                                                <Checkbox
                                                    label="Active"
                                                    checked={bank.is_active}
                                                    onChange={(e) => {
                                                        const checked = e.currentTarget.checked
                                                        setBanks((prev) => prev.map((b, i) => i === idx ? { ...b, is_active: checked } : b))
                                                    }}
                                                />
                                                <Checkbox
                                                    label="Default"
                                                    checked={bank.is_default}
                                                    onChange={() => setDefaultBank(idx)}
                                                />
                                            </div>
                                            <Button type="button" variant="danger" size="sm" onClick={() => removeBank(idx)} icon={<Icons.Trash className="w-4 h-4" />}>
                                                Remove
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="flex justify-between items-center pt-6 border-t border-slate-100">
                                <Button type="button" variant="outline" onClick={addBank} icon={<Icons.Plus className="w-4 h-4" />}>
                                    Add Bank
                                </Button>
                                <Button type="button" onClick={handleSaveBanks} disabled={banksSaving}>
                                    {banksSaving ? 'Saving...' : 'Save Banks'}
                                </Button>
                            </div>
                        </div>
                    </Section>
                )}

                {/* SYSTEM TAB (DEV ONLY) */}
                {isOwner && activeTab === 'system' && isSystemAvailable && (
                    <div className="space-y-6">
                        {userProfile?.role === 'OWNER' && (
                            <Section title="Invite Users (Whitelist)" description="Invite-only signup. Admin must be whitelisted before sign up.">
                                <div className="space-y-6">
                                    {inviteMessage && (
                                        <div className={`p-4 rounded-lg text-sm flex items-center gap-3 border ${inviteMessage.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200/50' : 'bg-rose-50 text-rose-700 border-rose-200/50'}`}>
                                            {inviteMessage.type === 'success' ? <Icons.Check className="w-5 h-5" /> : <Icons.Warning className="w-5 h-5" />}
                                            {inviteMessage.text}
                                        </div>
                                    )}
                                    <form onSubmit={handleInviteUser} className="grid grid-cols-1 md:grid-cols-12 gap-4">
                                        <div className="md:col-span-5">
                                            <Input
                                                label="Email"
                                                type="email"
                                                value={inviteEmail}
                                                onChange={(e) => setInviteEmail(e.target.value)}
                                                placeholder="admin@company.com"
                                                required
                                            />
                                        </div>
                                        <div className="md:col-span-3">
                                            <label className="text-sm font-medium text-slate-700 block mb-1.5">Role</label>
                                            <div className="flex rounded-md shadow-sm">
                                                <button
                                                    type="button"
                                                    onClick={() => setInviteRole('ADMIN')}
                                                    className={`flex-1 px-4 py-2 text-sm font-medium border border-r-0 rounded-l-lg transition-colors ${inviteRole === 'ADMIN' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                                                >
                                                    ADMIN
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setInviteRole('OWNER')}
                                                    className={`flex-1 px-4 py-2 text-sm font-medium border rounded-r-lg transition-colors ${inviteRole === 'OWNER' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                                                >
                                                    OWNER
                                                </button>
                                            </div>
                                        </div>
                                        <div className="md:col-span-4">
                                            <Textarea
                                                label="Notes"
                                                value={inviteNotes}
                                                onChange={(e) => setInviteNotes(e.target.value)}
                                                rows={1}
                                                className="min-h-[42px] py-2"
                                            />
                                        </div>
                                        <div className="md:col-span-12 flex justify-end">
                                            <Button type="submit" disabled={inviteLoading}>
                                                {inviteLoading ? 'Saving...' : 'Add to Whitelist'}
                                            </Button>
                                        </div>
                                    </form>

                                    <div className="border-t border-slate-100 pt-6">
                                        <div className="text-sm font-semibold text-slate-900 mb-4 uppercase tracking-wider text-xs">Invited Emails</div>
                                        {invites.length === 0 ? (
                                            <p className="text-sm text-slate-500 italic">No existing invitations found.</p>
                                        ) : (
                                            <div className="space-y-3">
                                                {invites.map((inv) => (
                                                    <div key={inv.email} className="flex items-center justify-between p-4 border border-slate-200 rounded-xl bg-slate-50/50">
                                                        <div>
                                                            <div className="text-sm font-medium text-slate-900">{inv.email}</div>
                                                            <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                                                                <span className="px-2 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-semibold uppercase">{inv.invited_role}</span>
                                                                <span>•</span>
                                                                <span>{new Date(inv.invited_at).toLocaleString('id-ID')}</span>
                                                            </div>
                                                        </div>
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => handleRevokeInvite(inv.email)}
                                                            disabled={inviteLoading}
                                                        >
                                                            Revoke
                                                        </Button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </Section>
                        )}
                        <DevResetData />
                    </div>
                )}
            </div>
        </div>
    )
}
