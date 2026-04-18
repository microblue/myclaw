import type { FC, ReactNode } from 'react'
import type { ProviderSummary } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import {
    Label,
    Skeleton
} from '@/components/ui'

interface ProviderSelectorProps {
    providers: ProviderSummary[]
    selectedProvider: string | null
    isLoading: boolean
    onProviderChange: (providerId: string) => void
}

// Provider logos/icons mapping
const providerIcons: Record<string, string> = {
    hetzner: '🇩🇪',
    lightsail: '☁️',
    digitalocean: '🌊',
    vultr: '🔷',
    linode: '🟢',
    ec2: '🟠'
}

const ProviderSelector: FC<ProviderSelectorProps> = ({
    providers,
    selectedProvider,
    isLoading,
    onProviderChange
}): ReactNode => {
    return (
        <div className='space-y-2'>
            <Label>
                {t('createClaw.provider')}
                <span className='text-red-600 dark:text-red-400'> *</span>
            </Label>
            {isLoading ? (
                <div className='grid grid-cols-2 gap-2'>
                    {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className='h-16 rounded-lg' />
                    ))}
                </div>
            ) : (
                <div className='grid grid-cols-2 gap-2'>
                    {providers.map((provider) => {
                        const isSelected = selectedProvider === provider.id
                        const icon = providerIcons[provider.id] || '☁️'

                        return (
                            <label
                                key={provider.id}
                                className={`flex cursor-pointer flex-col rounded-lg px-3 py-3 transition ${
                                    isSelected
                                        ? 'border border-[#6366f1]/50 bg-[#6366f1]/20'
                                        : 'bg-muted hover:bg-muted/80 border border-transparent'
                                }`}
                            >
                                <input
                                    type='radio'
                                    name='provider'
                                    value={provider.id}
                                    checked={isSelected}
                                    onChange={(e) => onProviderChange(e.target.value)}
                                    className='sr-only'
                                />
                                <div className='flex items-center gap-2'>
                                    <span className='text-xl'>{icon}</span>
                                    <span className='font-medium'>{provider.name}</span>
                                </div>
                                <p className='text-muted-foreground mt-1 text-xs'>
                                    {provider.description}
                                </p>
                            </label>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

export default ProviderSelector