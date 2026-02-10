import { createContext, useContext, type ReactNode } from 'react'

export type ConfirmTone = 'default' | 'danger'

export type ConfirmOptions = {
  title: string
  description?: ReactNode
  confirmText?: string
  cancelText?: string
  tone?: ConfirmTone
  hideCancel?: boolean
}

export type ConfirmContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

export const ConfirmContext = createContext<ConfirmContextValue | null>(null)

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) {
    throw new Error('useConfirm must be used within a ConfirmProvider')
  }
  return ctx
}
