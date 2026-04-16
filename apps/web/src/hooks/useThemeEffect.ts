import type { ThemeMode } from '@/ts/Types'

import { useEffect } from 'react'
import { usePreferencesStore } from '@/lib/store'
import { THEMES } from '@/lib'

const resolveTheme = (mode: ThemeMode): 'dark' | 'light' => {
    if (mode === THEMES.SYSTEM) {
        return window.matchMedia('(prefers-color-scheme: dark)').matches
            ? THEMES.DARK
            : THEMES.LIGHT
    }
    return mode
}

const applyTheme = (mode: ThemeMode) => {
    const resolved = resolveTheme(mode)
    if (resolved === THEMES.DARK) {
        document.documentElement.classList.add('dark')
    } else {
        document.documentElement.classList.remove('dark')
    }
}

const useThemeEffect = (): void => {
    const theme = usePreferencesStore((s) => s.theme)

    useEffect(() => {
        applyTheme(theme)

        if (theme !== THEMES.SYSTEM) return

        const mq = window.matchMedia('(prefers-color-scheme: dark)')
        const handler = () => applyTheme(THEMES.SYSTEM)
        mq.addEventListener('change', handler)
        return () => mq.removeEventListener('change', handler)
    }, [theme])
}

export default useThemeEffect