import React from 'react'
import { Button } from './Button'
import { Icons } from './Icons'

type ErrorBoundaryProps = {
    children: React.ReactNode
}

type ErrorBoundaryState = {
    hasError: boolean
    error?: Error
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = { hasError: false }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error }
    }

    componentDidCatch(error: Error) {
        console.error('ErrorBoundary caught error:', error)
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: undefined })
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="w-full p-8">
                    <div className="max-w-xl mx-auto bg-white border border-rose-200 rounded-xl p-6 shadow-sm">
                        <div className="flex items-start gap-3">
                            <div className="p-2 rounded-lg bg-rose-50 text-rose-600">
                                <Icons.Warning className="w-5 h-5" />
                            </div>
                            <div className="flex-1">
                                <h2 className="text-lg font-semibold text-slate-900">Terjadi kesalahan</h2>
                                <p className="text-sm text-slate-600 mt-1">
                                    Halaman ini gagal dimuat. Coba ulangi atau refresh halaman.
                                </p>
                                <div className="mt-4 flex gap-2">
                                    <Button variant="outline" onClick={this.handleRetry}>
                                        Coba Lagi
                                    </Button>
                                    <Button
                                        variant="primary"
                                        onClick={() => window.location.reload()}
                                        icon={<Icons.Refresh className="w-4 h-4" />}
                                    >
                                        Refresh
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )
        }

        return this.props.children
    }
}
