import React, { useEffect } from 'react'
import { Icons } from './Icons'

interface DialogProps {
    isOpen: boolean
    onClose: () => void
    children: React.ReactNode
    contentClassName?: string
}

export function Dialog({ isOpen, onClose, children, contentClassName = '' }: DialogProps) {
    useEffect(() => {
        if (isOpen) document.body.style.overflow = 'hidden'
        else document.body.style.overflow = 'unset'
        return () => { document.body.style.overflow = 'unset' }
    }, [isOpen])

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center p-4 sm:p-6 overflow-y-auto">
            {/* Overlay */}
            <div
                className="fixed inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300"
                onClick={onClose}
            />
            {/* Content */}
            <div className={`relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-[var(--border-light)] animate-in zoom-in-95 fade-in slide-in-from-bottom-2 duration-300 ring-1 ring-black/5 my-4 ${contentClassName}`}>
                <button
                    onClick={onClose}
                    className="absolute right-4 top-4 p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors z-50"
                >
                    <Icons.Close className="w-5 h-5" />
                </button>
                {children}
            </div>
        </div>
    )
}

export function DialogHeader({ children, className = '' }: { children: React.ReactNode, className?: string }) {
    return <div className={`px-6 py-4 border-b border-slate-200/60 ${className}`}>{children}</div>
}

export function DialogTitle({ children, className = '' }: { children: React.ReactNode, className?: string }) {
    return <h3 className={`text-base font-semibold text-gray-900 leading-6 pr-8 ${className}`}>{children}</h3>
}

export function DialogContent({ children, className = '' }: { children: React.ReactNode, className?: string }) {
    return <div className={`p-5 max-h-[70vh] overflow-y-auto overflow-x-hidden ${className}`}>{children}</div>
}

export function DialogFooter({ children, className = '' }: { children: React.ReactNode, className?: string }) {
    return <div className={`px-6 py-4 bg-gray-50 border-t border-gray-100 flexitems-center justify-end space-x-3 rounded-b-2xl ${className}`}>{children}</div>
}
