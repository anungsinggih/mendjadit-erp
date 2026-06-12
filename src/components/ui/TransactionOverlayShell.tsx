import React from 'react'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './Dialog'
import { Sheet } from './Sheet'

type OverlaySize = 'narrow' | 'wide' | 'xwide'

type TransactionOverlayShellProps = {
  isOpen: boolean
  title: string
  onClose: () => void
  size?: OverlaySize
  children: React.ReactNode
}

const dialogSizeMap: Record<OverlaySize, string> = {
  narrow: 'max-w-xl',
  wide: 'max-w-4xl',
  xwide: 'max-w-6xl',
}

export function TransactionOverlayShell({
  isOpen,
  title,
  onClose,
  size = 'wide',
  children,
}: TransactionOverlayShellProps) {
  const isMobile = useMediaQuery('(max-width: 768px)')

  if (!isOpen) return null

  if (isMobile) {
    return (
      <Sheet
        isOpen={isOpen}
        onClose={onClose}
        side="right"
        contentClassName="w-full max-w-full border-l-0"
      >
        <div className="flex h-full flex-col bg-white">
          <div className="border-b border-slate-200 pb-4 pr-12">
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pt-4">
            {children}
          </div>
        </div>
      </Sheet>
    )
  }

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      contentClassName={`${dialogSizeMap[size]} max-h-[92vh] overflow-hidden`}
    >
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <DialogContent className="max-h-[calc(92vh-88px)]">{children}</DialogContent>
    </Dialog>
  )
}
