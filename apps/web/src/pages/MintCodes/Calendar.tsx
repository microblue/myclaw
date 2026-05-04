import type { FC } from 'react'

import { useMemo, useState } from 'react'
import { CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react'

interface Props {
    // YYYY-MM-DD; empty string means "no date selected"
    value: string
    onChange: (value: string) => void
    minDate?: Date
}

const MONTHS = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December'
]

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

const toIso = (d: Date): string => {
    // Local-time YYYY-MM-DD (avoid TZ shift from toISOString).
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}

const fromIso = (iso: string): Date | null => {
    if (!iso) return null
    const [y, m, d] = iso.split('-').map(Number)
    if (!y || !m || !d) return null
    return new Date(y, m - 1, d)
}

const Calendar: FC<Props> = ({ value, onChange, minDate }) => {
    const today = useMemo(() => {
        const t = new Date()
        t.setHours(0, 0, 0, 0)
        return t
    }, [])
    const selected = fromIso(value)
    const [view, setView] = useState(() => {
        const base = selected || today
        return new Date(base.getFullYear(), base.getMonth(), 1)
    })

    const days = useMemo(() => {
        const firstWeekday = view.getDay()
        const daysInMonth = new Date(
            view.getFullYear(),
            view.getMonth() + 1,
            0
        ).getDate()
        const cells: ({ date: Date; inMonth: boolean } | null)[] = []
        for (let i = 0; i < firstWeekday; i += 1) cells.push(null)
        for (let d = 1; d <= daysInMonth; d += 1) {
            cells.push({
                date: new Date(view.getFullYear(), view.getMonth(), d),
                inMonth: true
            })
        }
        return cells
    }, [view])

    const shift = (months: number) =>
        setView(
            new Date(view.getFullYear(), view.getMonth() + months, 1)
        )

    const lowerBound = minDate || today

    return (
        <div className='bg-card rounded-lg border p-4'>
            <div className='mb-3 flex items-center justify-between'>
                <button
                    type='button'
                    onClick={() => shift(-1)}
                    className='hover:bg-muted rounded p-1'
                    aria-label='Previous month'
                >
                    <CaretLeftIcon className='h-4 w-4' />
                </button>
                <div className='text-sm font-medium'>
                    {MONTHS[view.getMonth()]} {view.getFullYear()}
                </div>
                <button
                    type='button'
                    onClick={() => shift(1)}
                    className='hover:bg-muted rounded p-1'
                    aria-label='Next month'
                >
                    <CaretRightIcon className='h-4 w-4' />
                </button>
            </div>

            <div className='grid grid-cols-7 gap-1 text-center text-xs'>
                {WEEKDAYS.map((w) => (
                    <div
                        key={w}
                        className='text-muted-foreground py-1 font-medium'
                    >
                        {w}
                    </div>
                ))}
                {days.map((cell, i) => {
                    if (!cell) {
                        return <div key={`pad-${i}`} />
                    }
                    const iso = toIso(cell.date)
                    const isSelected = value === iso
                    const isToday = toIso(today) === iso
                    const disabled = cell.date < lowerBound
                    return (
                        <button
                            key={iso}
                            type='button'
                            disabled={disabled}
                            onClick={() => onChange(iso)}
                            className={`flex aspect-square items-center justify-center rounded-md text-sm transition-colors ${
                                isSelected
                                    ? 'bg-primary text-primary-foreground'
                                    : disabled
                                      ? 'text-muted-foreground/40 cursor-not-allowed'
                                      : isToday
                                        ? 'border-primary border'
                                        : 'hover:bg-muted'
                            }`}
                        >
                            {cell.date.getDate()}
                        </button>
                    )
                })}
            </div>

            {value && (
                <div className='mt-3 flex items-center justify-between text-xs'>
                    <span className='text-muted-foreground'>
                        Selected: {value}
                    </span>
                    <button
                        type='button'
                        onClick={() => onChange('')}
                        className='text-muted-foreground hover:text-foreground underline-offset-2 hover:underline'
                    >
                        Clear
                    </button>
                </div>
            )}
        </div>
    )
}

export default Calendar