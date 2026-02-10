import React, { useState, useRef, useEffect, useMemo } from 'react'
import { DayPicker } from 'react-day-picker'
import { format } from 'date-fns'
import 'react-day-picker/dist/style.css'
import { Icons } from './Icons'

interface DatePickerProps {
    value?: string // YYYY-MM-DD format
    onChange?: (value: string) => void
    label?: string
    containerClassName?: string
    className?: string
    disabled?: boolean
}

export const DatePicker: React.FC<DatePickerProps> = ({
    value,
    onChange,
    label,
    containerClassName = '',
    className = '',
    disabled = false
}) => {
    const [isOpen, setIsOpen] = useState(false)

    // Derive selected date from value prop instead of syncing with useEffect
    const selected = useMemo(() => {
        return value ? new Date(value) : undefined
    }, [value])

    const [alignRight, setAlignRight] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)
    const buttonRef = useRef<HTMLButtonElement>(null)

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false)
            }
        }

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside)
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [isOpen])

    useEffect(() => {
        if (isOpen && buttonRef.current) {
            const buttonRect = buttonRef.current.getBoundingClientRect()
            const calendarWidth = 320 // approximate width of calendar
            const spaceOnRight = window.innerWidth - buttonRect.right

            // If not enough space on right, align to right edge
            setAlignRight(spaceOnRight < calendarWidth)
        }
    }, [isOpen])

    const handleSelect = (date: Date | undefined) => {
        if (date && onChange) {
            onChange(format(date, 'yyyy-MM-dd'))
        }
        setIsOpen(false)
    }

    const displayValue = selected ? format(selected, 'dd MMM yyyy') : 'Select date'

    return (
        <div className={`flex flex-col gap-1.5 mb-3 w-full ${containerClassName}`} ref={containerRef}>
            {label && <label className="text-sm font-medium text-[var(--text-main)]">{label}</label>}
            <div className="relative">
                <button
                    ref={buttonRef}
                    type="button"
                    onClick={() => !disabled && setIsOpen(!isOpen)}
                    disabled={disabled}
                    className={`flex h-10 w-full items-center justify-between rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-[var(--primary)] transition-all duration-200 disabled:opacity-50 disabled:bg-gray-50 shadow-sm hover:border-gray-300 ${className}`}
                >
                    <span className={selected ? 'text-gray-900' : 'text-gray-400'}>
                        {displayValue}
                    </span>
                    <Icons.Calendar className="w-4 h-4 text-gray-400" />
                </button>

                {isOpen && (
                    <div
                        className={`absolute top-full mt-2 z-50 bg-white rounded-lg shadow-xl border border-gray-200 p-3 ${alignRight ? 'right-0' : 'left-0'
                            }`}
                        style={{
                            minWidth: '280px'
                        }}
                    >
                        <DayPicker
                            mode="single"
                            selected={selected}
                            onSelect={handleSelect}
                            defaultMonth={selected}
                            className="rdp-custom"
                        />
                    </div>
                )}
            </div>

            <style>{`
                .rdp-custom {
                    --rdp-cell-size: 36px;
                    --rdp-accent-color: #4F46E5;
                    --rdp-background-color: #EEF2FF;
                    font-size: 14px;
                }
                
                .rdp-custom .rdp-head_cell {
                    color: #6B7280;
                    font-weight: 600;
                    font-size: 12px;
                    text-transform: uppercase;
                }
                
                .rdp-custom .rdp-day_selected {
                    background-color: var(--rdp-accent-color);
                    color: white;
                    font-weight: 600;
                }
                
                .rdp-custom .rdp-day_today {
                    font-weight: 600;
                    color: var(--rdp-accent-color);
                }
                
                .rdp-custom .rdp-day:hover:not(.rdp-day_selected) {
                    background-color: #F3F4F6;
                }
                
                .rdp-custom .rdp-button:hover:not([disabled]):not(.rdp-day_selected) {
                    background-color: #F3F4F6;
                }
                
                .rdp-custom .rdp-nav_button {
                    width: 32px;
                    height: 32px;
                }
                
                .rdp-custom .rdp-nav_button:hover {
                    background-color: #F3F4F6;
                }
            `}</style>
        </div>
    )
}
