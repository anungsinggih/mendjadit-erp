import { useEffect, useState } from 'react'

export function useDebounce<T>(value: T, delay = 500) {
    const [debouncedValue, setDebouncedValue] = useState(value)

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedValue(value), delay)
        return () => clearTimeout(timer)
    }, [value, delay])

    return debouncedValue
}

/**
 * Search filter hook — SaaS-style pattern:
 * - inputValue: bind to <input> directly (always responsive, no lag)
 * - queryValue: debounced 500ms + min 2 chars before triggering a server query
 *               empty string when input is cleared (always triggers clear)
 *
 * Usage:
 *   const { inputValue, queryValue, setInputValue, clear } = useSearchFilter()
 *   <input value={inputValue} onChange={e => setInputValue(e.target.value)} />
 *   useQuery({ queryKey: ['data', queryValue], ... })
 */
export function useSearchFilter(initialValue = '', minChars = 2, delay = 500) {
    const [inputValue, setInputValue] = useState(initialValue)
    const debouncedValue = useDebounce(inputValue, delay)

    // Only send to server if empty (clear) or meets minimum char threshold
    const queryValue = debouncedValue.length === 0 || debouncedValue.length >= minChars
        ? debouncedValue
        : ''

    const clear = () => setInputValue('')

    return { inputValue, queryValue, setInputValue, clear }
}

