import { useCallback, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

type Primitive = string | number | boolean | null | undefined

type ModalValues = Record<string, Primitive>

type ModalPayload = {
  modal: string
  values?: ModalValues
}

type CloseOptions = {
  replace?: boolean
  clearKeys?: string[]
}

const DEFAULT_MODAL_KEYS = ['modal', 'id', 'parentId']

function applyValues(searchParams: URLSearchParams, values: ModalValues) {
  Object.entries(values).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      searchParams.delete(key)
      return
    }
    searchParams.set(key, String(value))
  })
}

export function useRouteModal() {
  const location = useLocation()
  const navigate = useNavigate()

  const searchParams = useMemo(
    () => new URLSearchParams(location.search),
    [location.search],
  )

  const modal = searchParams.get('modal')
  const id = searchParams.get('id')
  const parentId = searchParams.get('parentId')

  const setModalState = useCallback((payload: ModalPayload, replace = false) => {
    const nextParams = new URLSearchParams(location.search)
    nextParams.set('modal', payload.modal)
    applyValues(nextParams, payload.values || {})
    navigate(
      {
        pathname: location.pathname,
        search: nextParams.toString() ? `?${nextParams.toString()}` : '',
      },
      { replace },
    )
  }, [location.pathname, location.search, navigate])

  const openModal = useCallback((payload: ModalPayload) => {
    setModalState(payload, false)
  }, [setModalState])

  const replaceModal = useCallback((payload: ModalPayload) => {
    setModalState(payload, true)
  }, [setModalState])

  const closeModal = useCallback((options: CloseOptions = {}) => {
    const nextParams = new URLSearchParams(location.search)
    const clearKeys = options.clearKeys || DEFAULT_MODAL_KEYS
    clearKeys.forEach((key) => nextParams.delete(key))
    navigate(
      {
        pathname: location.pathname,
        search: nextParams.toString() ? `?${nextParams.toString()}` : '',
      },
      { replace: options.replace ?? false },
    )
  }, [location.pathname, location.search, navigate])

  return {
    isOpen: Boolean(modal),
    modal,
    id,
    parentId,
    params: searchParams,
    openModal,
    replaceModal,
    closeModal,
  }
}

export type RouteModalController = ReturnType<typeof useRouteModal>
