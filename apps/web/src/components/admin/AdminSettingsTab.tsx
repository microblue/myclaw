import type { FC } from 'react'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib'
import { Button, Input, Label } from '@/components/ui'
import { useToast } from '@/hooks'

// A lightweight editor for the `system_settings` KV table. Values
// tagged isSecret arrive from the API pre-masked; to update them the
// admin pastes a new value, which replaces the whole row. Changes
// take effect on the next claw provisioning (the control plane
// short-term-caches these, ~30s).

type SettingRow = {
    key: string
    value: string | null
    isSecret: boolean
    updatedAt: string
}

const PRETTY_LABELS: Record<string, string> = {
    default_openrouter_api_key: 'Default OpenRouter API key',
    default_openrouter_model: 'Default model (provider/model, e.g. anthropic/claude-sonnet-4)'
}

const AdminSettingsTab: FC = () => {
    const toast = useToast()
    const qc = useQueryClient()
    const { data, isLoading } = useQuery({
        queryKey: ['adminSettings'],
        queryFn: () => api.getAdminSettings()
    })
    const settings: SettingRow[] = data?.settings || []

    return (
        <div className='space-y-4'>
            <div>
                <h2 className='text-lg font-semibold'>System settings</h2>
                <p className='text-muted-foreground text-sm'>
                    Platform-wide defaults baked into every newly provisioned claw. Rotating a value here takes effect on the next instance you create — existing claws keep the value they were originally provisioned with.
                </p>
            </div>

            {isLoading && (
                <div className='text-muted-foreground text-sm'>Loading…</div>
            )}

            {!isLoading && settings.length === 0 && (
                <div className='text-muted-foreground text-sm'>
                    No settings yet.
                </div>
            )}

            <div className='space-y-4'>
                {settings.map((s) => (
                    <SettingRowEditor
                        key={s.key}
                        row={s}
                        onSaved={() => {
                            qc.invalidateQueries({ queryKey: ['adminSettings'] })
                            toast.success('Saved')
                        }}
                        onError={(msg) => toast.error(msg)}
                    />
                ))}
            </div>
        </div>
    )
}

const SettingRowEditor: FC<{
    row: SettingRow
    onSaved: () => void
    onError: (msg: string) => void
}> = ({ row, onSaved, onError }) => {
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState('')
    const mutation = useMutation({
        mutationFn: (value: string | null) =>
            api.updateAdminSetting(row.key, value),
        onSuccess: () => {
            setEditing(false)
            setDraft('')
            onSaved()
        },
        onError: (err: unknown) => {
            onError(err instanceof Error ? err.message : 'Update failed')
        }
    })

    const label = PRETTY_LABELS[row.key] || row.key
    const currentDisplay = row.value || (row.isSecret ? '(not set)' : '—')

    return (
        <div className='bg-card rounded-lg border p-4'>
            <Label className='text-sm font-medium'>{label}</Label>
            <p className='text-muted-foreground font-mono text-xs mt-0.5'>
                {row.key}
            </p>

            {!editing && (
                <div className='mt-3 flex items-center justify-between gap-3'>
                    <code className='bg-muted rounded px-2 py-1 font-mono text-xs'>
                        {currentDisplay}
                    </code>
                    <Button
                        size='sm'
                        variant='outline'
                        onClick={() => {
                            setEditing(true)
                            setDraft(row.isSecret ? '' : row.value || '')
                        }}
                    >
                        {row.isSecret ? 'Rotate' : 'Edit'}
                    </Button>
                </div>
            )}

            {editing && (
                <div className='mt-3 space-y-2'>
                    <Input
                        type={row.isSecret ? 'password' : 'text'}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder={
                            row.isSecret
                                ? 'Paste new value (leave empty to clear)'
                                : ''
                        }
                        autoFocus
                    />
                    <div className='flex justify-end gap-2'>
                        <Button
                            size='sm'
                            variant='ghost'
                            onClick={() => {
                                setEditing(false)
                                setDraft('')
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            size='sm'
                            onClick={() => mutation.mutate(draft || null)}
                            disabled={mutation.isPending}
                        >
                            {mutation.isPending ? 'Saving…' : 'Save'}
                        </Button>
                    </div>
                </div>
            )}

            <p className='text-muted-foreground mt-3 text-xs'>
                Last updated {new Date(row.updatedAt).toLocaleString()}
            </p>
        </div>
    )
}

export default AdminSettingsTab