import type { FC } from 'react'

import { Fragment, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api, ROUTES } from '@/lib'
import {
    Button,
    Input,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger
} from '@/components/ui'
import { EmptyState, ErrorState } from '@/components'
import {
    KeyIcon,
    DownloadSimpleIcon,
    XCircleIcon
} from '@phosphor-icons/react'
import AdminStatusBadge from '@/components/admin/AdminStatusBadge'
import { useToast } from '@/hooks'

const ACTIVATION_CODES_QUERY_KEY = ['adminActivationCodes']
const ACTIVATION_CODE_BATCHES_QUERY_KEY = ['adminActivationCodeBatches']

const formatDate = (iso: string | null | undefined): string => {
    if (!iso) return '—'
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    })
}

const formatDateTime = (iso: string | null | undefined): string => {
    if (!iso) return '—'
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    })
}

const validityLabel = (months: number | null): string =>
    months == null
        ? 'Perpetual'
        : `${months} month${months === 1 ? '' : 's'}`

const AdminActivationCodesTab: FC = () => {
    const [status, setStatus] = useState('all')
    const [partner, setPartner] = useState('')
    const [batch, setBatch] = useState('')
    const navigate = useNavigate()
    const toast = useToast()

    const codesQuery = useQuery({
        queryKey: [...ACTIVATION_CODES_QUERY_KEY, status, partner, batch],
        queryFn: () =>
            api.listAdminActivationCodes(1, 200, {
                status: status === 'all' ? undefined : status,
                partner: partner.trim() || undefined,
                batch: batch.trim() || undefined
            })
    })

    const batchesQuery = useQuery({
        queryKey: ACTIVATION_CODE_BATCHES_QUERY_KEY,
        queryFn: () => api.listAdminActivationCodeBatches()
    })

    const refetchAll = () => {
        codesQuery.refetch()
        batchesQuery.refetch()
    }

    const handleVoid = async (id: string) => {
        try {
            await api.voidActivationCode(id)
            toast.success('Code voided.')
            refetchAll()
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Void failed')
        }
    }

    const handleVoidBatch = async (batchId: string, unused: number) => {
        if (unused === 0) return
        if (
            !window.confirm(
                `Void all ${unused} unused code${unused === 1 ? '' : 's'} in this batch? Already-redeemed codes are untouched. This cannot be undone.`
            )
        )
            return
        try {
            const res = await api.voidActivationCodeBatch(batchId)
            toast.success(
                `Voided ${res.voided} code${res.voided === 1 ? '' : 's'}.`
            )
            refetchAll()
        } catch (err) {
            toast.error(
                err instanceof Error ? err.message : 'Bulk void failed'
            )
        }
    }

    const handleDownload = async (batchId: string) => {
        try {
            await api.downloadActivationCodeBatchCsv(batchId)
        } catch (err) {
            toast.error(
                err instanceof Error ? err.message : 'Download failed'
            )
        }
    }

    const handleViewBatch = (batchId: string) => {
        setBatch(batchId)
        setStatus('all')
    }

    const codes = codesQuery.data?.items || []
    const batches = batchesQuery.data?.items || []

    return (
        <Fragment>
            <div className='mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
                <h3 className='text-xl font-semibold'>Activation codes</h3>
                <Button onClick={() => navigate(ROUTES.MINT_CODES)}>
                    Mint batch
                </Button>
            </div>

            <BatchesSection
                batches={batches}
                isLoading={batchesQuery.isLoading}
                isError={batchesQuery.isError}
                onDownload={handleDownload}
                onVoidBatch={handleVoidBatch}
                onViewBatch={handleViewBatch}
            />

            <div className='mb-3 mt-8 flex items-end justify-between gap-3'>
                <div>
                    <h4 className='text-base font-semibold'>All codes</h4>
                    <p className='text-muted-foreground text-xs'>
                        {batch
                            ? `Filtered to batch ${batch.slice(0, 14)}…`
                            : `${codes.length} most recent`}
                    </p>
                </div>
                {batch && (
                    <button
                        type='button'
                        onClick={() => setBatch('')}
                        className='text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline'
                    >
                        Clear batch filter
                    </button>
                )}
            </div>

            <div className='mb-4 grid gap-2 sm:grid-cols-3'>
                <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger
                        className='h-10'
                        placeholder='All statuses'
                    />
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

            {codesQuery.isError ? (
                <ErrorState
                    title='Failed to load codes'
                    description='Try again in a moment.'
                    onRetry={() => codesQuery.refetch()}
                />
            ) : codesQuery.isLoading ? (
                <p className='text-muted-foreground py-8 text-sm'>
                    Loading…
                </p>
            ) : codes.length === 0 ? (
                <EmptyState
                    icon={<KeyIcon className='text-primary h-10 w-10' />}
                    title='No activation codes'
                    description='Mint a batch to hand to a channel partner.'
                />
            ) : (
                <CodesTable codes={codes} onVoid={handleVoid} />
            )}
        </Fragment>
    )
}

interface BatchRow {
    batchId: string
    partnerName: string | null
    planId: string
    provider: string
    region: string
    tierLabel: string | null
    validityMonths: number | null
    expiresAt: string | null
    createdAt: string
    total: number
    unused: number
    redeemed: number
    voided: number
}

const BatchesSection: FC<{
    batches: BatchRow[]
    isLoading: boolean
    isError: boolean
    onDownload: (batchId: string) => void
    onVoidBatch: (batchId: string, unused: number) => void
    onViewBatch: (batchId: string) => void
}> = ({
    batches,
    isLoading,
    isError,
    onDownload,
    onVoidBatch,
    onViewBatch
}) => {
    if (isLoading) {
        return (
            <p className='text-muted-foreground py-2 text-xs'>
                Loading batches…
            </p>
        )
    }
    if (isError) {
        return (
            <p className='text-destructive py-2 text-xs'>
                Failed to load batches.
            </p>
        )
    }
    if (batches.length === 0) return null

    return (
        <div className='mb-2'>
            <h4 className='text-base font-semibold'>Batches</h4>
            <p className='text-muted-foreground mb-3 text-xs'>
                One row per minted batch. Use the actions to re-download
                the CSV or void everything that's still unused.
            </p>
            <div className='border-border overflow-x-auto rounded-lg border'>
                <table className='w-full text-sm'>
                    <thead className='bg-foreground/5 text-muted-foreground text-xs uppercase tracking-wide'>
                        <tr>
                            <Th>Partner</Th>
                            <Th>Spec</Th>
                            <Th>Region</Th>
                            <Th>Validity</Th>
                            <Th>Codes</Th>
                            <Th>Created</Th>
                            <Th>Code expiry</Th>
                            <Th align='right'>Actions</Th>
                        </tr>
                    </thead>
                    <tbody>
                        {batches.map((b) => (
                            <tr
                                key={b.batchId}
                                className='border-border border-t'
                            >
                                <Td>
                                    <div className='font-medium'>
                                        {b.partnerName || '—'}
                                    </div>
                                    <button
                                        type='button'
                                        onClick={() =>
                                            onViewBatch(b.batchId)
                                        }
                                        className='text-muted-foreground hover:text-foreground font-mono text-xs underline-offset-2 hover:underline'
                                        title='Filter the codes table to this batch'
                                    >
                                        {b.batchId.slice(0, 14)}…
                                    </button>
                                </Td>
                                <Td>
                                    <div>{b.tierLabel || b.planId}</div>
                                    <div className='text-muted-foreground text-xs'>
                                        {b.provider} · {b.planId}
                                    </div>
                                </Td>
                                <Td>{b.region}</Td>
                                <Td>{validityLabel(b.validityMonths)}</Td>
                                <Td>
                                    <div className='flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs'>
                                        <span>
                                            <strong>{b.total}</strong> total
                                        </span>
                                        {b.unused > 0 && (
                                            <span className='text-foreground/70'>
                                                {b.unused} unused
                                            </span>
                                        )}
                                        {b.redeemed > 0 && (
                                            <span className='text-emerald-600 dark:text-emerald-400'>
                                                {b.redeemed} redeemed
                                            </span>
                                        )}
                                        {b.voided > 0 && (
                                            <span className='text-muted-foreground'>
                                                {b.voided} voided
                                            </span>
                                        )}
                                    </div>
                                </Td>
                                <Td>{formatDate(b.createdAt)}</Td>
                                <Td>
                                    {b.expiresAt
                                        ? formatDate(b.expiresAt)
                                        : 'No expiry'}
                                </Td>
                                <Td align='right'>
                                    <div className='flex justify-end gap-1'>
                                        <button
                                            type='button'
                                            onClick={() =>
                                                onDownload(b.batchId)
                                            }
                                            className='text-muted-foreground hover:bg-foreground/5 hover:text-foreground rounded-md p-1.5 transition-colors'
                                            title='Download CSV'
                                            aria-label='Download CSV'
                                        >
                                            <DownloadSimpleIcon className='h-4 w-4' />
                                        </button>
                                        <button
                                            type='button'
                                            onClick={() =>
                                                onVoidBatch(
                                                    b.batchId,
                                                    b.unused
                                                )
                                            }
                                            disabled={b.unused === 0}
                                            className='text-muted-foreground hover:bg-foreground/5 hover:text-destructive rounded-md p-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-40'
                                            title={
                                                b.unused === 0
                                                    ? 'No unused codes to void'
                                                    : `Void ${b.unused} unused code${b.unused === 1 ? '' : 's'}`
                                            }
                                            aria-label='Void all unused codes in this batch'
                                        >
                                            <XCircleIcon className='h-4 w-4' />
                                        </button>
                                    </div>
                                </Td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

interface CodeRow {
    id: string
    code: string
    status: string
    planId: string
    provider: string
    region: string
    tierLabel: string | null
    partnerName: string | null
    batchId: string | null
    validityMonths: number | null
    expiresAt: string | null
    createdAt: string
    redeemedAt: string | null
    redeemedByEmail: string | null
    redeemedClawName: string | null
}

const CodesTable: FC<{
    codes: CodeRow[]
    onVoid: (id: string) => void
}> = ({ codes, onVoid }) => (
    <div className='border-border overflow-x-auto rounded-lg border'>
        <table className='w-full text-sm'>
            <thead className='bg-foreground/5 text-muted-foreground text-xs uppercase tracking-wide'>
                <tr>
                    <Th>Code</Th>
                    <Th>Status</Th>
                    <Th>Spec</Th>
                    <Th>Validity</Th>
                    <Th>Created</Th>
                    <Th>Code expiry</Th>
                    <Th>Redeemed</Th>
                    <Th align='right'>Actions</Th>
                </tr>
            </thead>
            <tbody>
                {codes.map((c) => (
                    <tr key={c.id} className='border-border border-t'>
                        <Td>
                            <span className='font-mono text-xs'>
                                {c.code}
                            </span>
                            {c.partnerName && (
                                <div className='text-muted-foreground text-xs'>
                                    {c.partnerName}
                                </div>
                            )}
                        </Td>
                        <Td>
                            <AdminStatusBadge status={c.status} />
                        </Td>
                        <Td>
                            <div>{c.tierLabel || c.planId}</div>
                            <div className='text-muted-foreground text-xs'>
                                {c.provider} · {c.region}
                            </div>
                        </Td>
                        <Td>{validityLabel(c.validityMonths)}</Td>
                        <Td className='whitespace-nowrap'>
                            {formatDate(c.createdAt)}
                        </Td>
                        <Td className='whitespace-nowrap'>
                            {c.expiresAt
                                ? formatDate(c.expiresAt)
                                : 'No expiry'}
                        </Td>
                        <Td>
                            {c.redeemedAt ? (
                                <div>
                                    <div className='whitespace-nowrap text-xs'>
                                        {formatDateTime(c.redeemedAt)}
                                    </div>
                                    {c.redeemedByEmail && (
                                        <div className='text-muted-foreground text-xs'>
                                            {c.redeemedByEmail}
                                            {c.redeemedClawName
                                                ? ` → ${c.redeemedClawName}`
                                                : ''}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <span className='text-muted-foreground text-xs'>
                                    —
                                </span>
                            )}
                        </Td>
                        <Td align='right'>
                            {c.status === 'unused' ? (
                                <Button
                                    variant='outline'
                                    size='sm'
                                    onClick={() => onVoid(c.id)}
                                >
                                    Void
                                </Button>
                            ) : null}
                        </Td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
)

const Th: FC<{ children: React.ReactNode; align?: 'left' | 'right' }> = ({
    children,
    align = 'left'
}) => (
    <th
        className={`px-3 py-2 font-medium ${
            align === 'right' ? 'text-right' : 'text-left'
        }`}
    >
        {children}
    </th>
)

const Td: FC<{
    children: React.ReactNode
    align?: 'left' | 'right'
    className?: string
}> = ({ children, align = 'left', className = '' }) => (
    <td
        className={`px-3 py-2 align-top ${
            align === 'right' ? 'text-right' : 'text-left'
        } ${className}`}
    >
        {children}
    </td>
)

export default AdminActivationCodesTab