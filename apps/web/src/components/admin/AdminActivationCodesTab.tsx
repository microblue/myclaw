import type { FC } from 'react'

import { Fragment, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib'
import {
    Button,
    Card,
    CardContent,
    Input,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger
} from '@/components/ui'
import { EmptyState, ErrorState } from '@/components'
import { KeyIcon } from '@phosphor-icons/react'
import AdminStatusBadge from '@/components/admin/AdminStatusBadge'
import AdminMintCodesModal from '@/components/admin/AdminMintCodesModal'
import { useToast } from '@/hooks'

const ACTIVATION_CODES_QUERY_KEY = ['adminActivationCodes']

const AdminActivationCodesTab: FC = () => {
    const [status, setStatus] = useState('all')
    const [partner, setPartner] = useState('')
    const [batch, setBatch] = useState('')
    const [mintOpen, setMintOpen] = useState(false)
    const toast = useToast()

    const { data, isLoading, isError, refetch } = useQuery({
        queryKey: [...ACTIVATION_CODES_QUERY_KEY, status, partner, batch],
        queryFn: () =>
            api.listAdminActivationCodes(1, 50, {
                status: status === 'all' ? undefined : status,
                partner: partner.trim() || undefined,
                batch: batch.trim() || undefined
            })
    })

    const handleVoid = async (id: string) => {
        try {
            await api.voidActivationCode(id)
            toast.success('Code voided.')
            refetch()
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Void failed')
        }
    }

    return (
        <Fragment>
            <div className='mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
                <h3 className='text-xl font-semibold'>Activation codes</h3>
                <Button onClick={() => setMintOpen(true)}>Mint batch</Button>
            </div>

            <div className='mb-4 grid gap-2 sm:grid-cols-3'>
                <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className='h-10' placeholder='All statuses' />
                    <SelectContent>
                        <SelectItem value='all'>All statuses</SelectItem>
                        <SelectItem value='unused'>Unused</SelectItem>
                        <SelectItem value='redeemed'>Redeemed</SelectItem>
                        <SelectItem value='voided'>Voided</SelectItem>
                    </SelectContent>
                </Select>
                <Input
                    placeholder='Partner'
                    value={partner}
                    onChange={(e) => setPartner(e.target.value)}
                />
                <Input
                    placeholder='Batch ID'
                    value={batch}
                    onChange={(e) => setBatch(e.target.value)}
                />
            </div>

            {isError ? (
                <ErrorState
                    title='Failed to load codes'
                    description='Try again in a moment.'
                    onRetry={() => refetch()}
                />
            ) : isLoading ? (
                <p className='text-muted-foreground py-8 text-sm'>Loading…</p>
            ) : !data?.items.length ? (
                <EmptyState
                    icon={<KeyIcon className='text-primary h-10 w-10' />}
                    title='No activation codes'
                    description='Mint a batch to hand to a channel partner.'
                />
            ) : (
                <div className='space-y-1.5'>
                    {data.items.map((row) => (
                        <Card key={row.id}>
                            <CardContent className='py-3'>
                                <div className='flex flex-wrap items-center justify-between gap-3'>
                                    <div className='min-w-0'>
                                        <div className='flex flex-wrap items-center gap-2'>
                                            <span className='font-mono text-sm'>
                                                {row.code}
                                            </span>
                                            <AdminStatusBadge
                                                status={row.status}
                                            />
                                        </div>
                                        <p className='text-muted-foreground text-xs'>
                                            {row.tierLabel || row.planId} ·{' '}
                                            {row.provider}
                                            {row.region
                                                ? ` · ${row.region}`
                                                : ''}
                                            {row.validityMonths != null
                                                ? ` · ${row.validityMonths}mo`
                                                : ' · perpetual'}
                                            {row.partnerName
                                                ? ` · ${row.partnerName}`
                                                : ''}
                                        </p>
                                        {row.redeemedByEmail && (
                                            <p className='text-muted-foreground text-xs'>
                                                Redeemed by{' '}
                                                {row.redeemedByEmail}
                                                {row.redeemedClawName
                                                    ? ` → ${row.redeemedClawName}`
                                                    : ''}
                                            </p>
                                        )}
                                    </div>
                                    {row.status === 'unused' && (
                                        <Button
                                            variant='outline'
                                            size='sm'
                                            onClick={() => handleVoid(row.id)}
                                        >
                                            Void
                                        </Button>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            <AdminMintCodesModal
                open={mintOpen}
                onClose={() => setMintOpen(false)}
                onSuccess={() => refetch()}
            />
        </Fragment>
    )
}

export default AdminActivationCodesTab