import { Navigate, useLocation, useParams } from 'react-router-dom'

type RouteOverlayRedirectProps = {
  to: string
  modal: string
  valueParams?: Record<string, string>
}

export default function RouteOverlayRedirect({ to, modal, valueParams = {} }: RouteOverlayRedirectProps) {
  const location = useLocation()
  const params = useParams()
  const nextParams = new URLSearchParams(location.search)

  nextParams.set('modal', modal)

  Object.entries(valueParams).forEach(([queryKey, routeParamKey]) => {
    const value = params[routeParamKey]
    if (!value) return
    nextParams.set(queryKey, value)
  })

  return (
    <Navigate
      replace
      to={{
        pathname: to,
        search: nextParams.toString() ? `?${nextParams.toString()}` : '',
      }}
    />
  )
}
