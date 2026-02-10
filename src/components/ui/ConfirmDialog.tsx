import React, { useCallback, useMemo, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './Dialog'
import { Button } from './Button'
import { ConfirmContext, type ConfirmOptions } from './ConfirmDialogContext'

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolveRef = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve
      setOptions(opts)
    })
  }, [])

  const handleClose = useCallback(() => {
    resolveRef.current?.(false)
    resolveRef.current = null
    setOptions(null)
  }, [])

  const handleConfirm = useCallback(() => {
    resolveRef.current?.(true)
    resolveRef.current = null
    setOptions(null)
  }, [])

  const value = useMemo(() => ({ confirm }), [confirm])

  const tone = options?.tone ?? 'default'
  const confirmClass =
    tone === 'danger'
      ? 'bg-rose-600 hover:bg-rose-700 text-white'
      : 'bg-blue-600 hover:bg-blue-700 text-white'

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Dialog isOpen={Boolean(options)} onClose={handleClose}>
        {options && (
          <>
            <DialogHeader>
              <DialogTitle>{options.title}</DialogTitle>
            </DialogHeader>
            <DialogContent>
              {options.description && (
                <div className="text-sm text-gray-600 leading-relaxed">{options.description}</div>
              )}
            </DialogContent>
            <DialogFooter className="flex items-center justify-end gap-2">
              {!options.hideCancel && (
                <Button variant="outline" onClick={handleClose}>
                  {options.cancelText ?? 'Cancel'}
                </Button>
              )}
              <Button className={confirmClass} onClick={handleConfirm}>
                {options.confirmText ?? 'Confirm'}
              </Button>
            </DialogFooter>
          </>
        )}
      </Dialog>
    </ConfirmContext.Provider>
  )
}
