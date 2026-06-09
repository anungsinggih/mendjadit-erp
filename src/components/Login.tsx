import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from './ui/Card'
import { Input } from './ui/Input'
import { Button } from './ui/Button'
import { Icons } from './ui/Icons'
import { getErrorMessage } from '../lib/errors'

export default function Login() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    async function handleLogin(e: React.FormEvent) {
        e.preventDefault()
        setLoading(true)
        setError(null)

        // Try Sign In
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) setError(getErrorMessage(error))
        setLoading(false)
    }

    return (
        <div className="flex justify-center items-center h-screen bg-gray-50">
            <div className="w-full max-w-md px-4">
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-bold text-gray-900 tracking-tight">Mendjahit</h1>
                    <p className="text-gray-500 mt-2">Enterprise Resource Planning</p>
                </div>

                <Card className="shadow-xl border-t-4 border-t-blue-600">
                    <CardHeader className="pb-4">
                        <CardTitle className="text-xl text-center">Welcome Back</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {error && (
                            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6 flex items-center gap-2 text-sm">
                                <Icons.Warning className="w-5 h-5 flex-shrink-0" /> {error}
                            </div>
                        )}

                        <form onSubmit={handleLogin} className="space-y-4">
                            <Input
                                label="Email"
                                type="email"
                                required
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                placeholder="name@company.com"
                            />
                            <Input
                                label="Password"
                                type="password"
                                required
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                placeholder="••••••••"
                            />

                            <Button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white h-11 text-base shadow-sm"
                            >
                                {loading ? 'Processing...' : 'Sign In'}
                            </Button>
                        </form>
                    </CardContent>
                    <CardFooter className="flex flex-col gap-4 bg-gray-50/50 border-t border-gray-100 p-6">
                        <div className="text-center text-sm text-gray-400">
                            Invite-only access. Contact your administrator.
                        </div>
                    </CardFooter>
                </Card>

                <div className="text-center mt-8 text-xs text-gray-400">
                    &copy; {new Date().getFullYear()} Mendjahit. All rights reserved.
                </div>
            </div>
        </div>
    )
}
