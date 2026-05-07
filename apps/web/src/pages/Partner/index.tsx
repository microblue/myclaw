import type { FC } from 'react'

import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { userRole } from '@openclaw/shared'
import { partner, ROUTES } from '@/lib'
import { useProfile, useToast } from '@/hooks'
import AppShell from '@/components/layout/AppShell'
import { PageTitle, PageHeader, EmptyState, ErrorState } from '@/components'
import { Button } from '@/components/ui'
import {
    KeyIcon,
    DownloadSimpleIcon,
    XCircleIcon
} from '@phosphor-icons/react'
import AdminStatusBadge from '@/components/admin/AdminStatusBadge'

// Channel-partner self-serve dashboard. Mirrors the Admin codes tab
// but uses the partner API client (which hits /partner/* with row-level
// scoping baked in by the controller).
//
// Super-admin can also reach this page; partner_or_super_admin
// middleware admits both. The page is gated client-side too — anyone
// hitting /partner without the correct role gets redirected to /claws.
const PARTNER_CODES_QUERY_KEY = ['partnerCodes']
const PARTNER_BATCHES_QUERY_KEY = ['partnerBatches']

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

const validityLabel = (days: number | null): string => {
    if (days == null) return 'Perpetual'
    if (days === 365) return '1 year'
    if (days % 365 === 0) return `${days / 365} years`
    return `${days} day${days === 1 ? '' : 's'}`
}

const Partner: FC = () => {
    const navigate = useNavigate()
    const toast = useToast()
    const { data: profile, isLoading: profileLoading } = useProfile()

    const codesQuery = useQuery({
        queryKey: PARTNER_CODES_QUERY_KEY,
        queryFn: () => partner.listCodes(1, 200, {}),
        // Skip the call entirely if the user isn't a partner / super-admin —
        // the API would 403 anyway and we don't want to fire the request.
        enabled:
            !!profile &&
            (profile.role === userRole.partner ||
                profile.role === userRole.admin)
    })

    const batchesQuery = useQuery({
        queryKey: PARTNER_BATCHES_QUERY_KEY,
        queryFn: () => partner.listBatches(),
        enabled:
            !!profile &&
            (profile.role === userRole.partner ||
                profile.role === userRole.admin)
    })

    if (profileLoading) {
        return (
            <AppShell>
                <main className='mx-auto w-full max-w-6xl px-4 py-6'>
                    <p className='text-muted-foreground text-sm'>Loading…</p>
                </main>
            </AppShell>
        )
    }

    if (
        profile &&
        profile.role !== userRole.partner &&
        profile.role !== userRole.admin
    ) {
        // Client-side redirect for end-users who somehow land here. The
        // server is the actual gate; this is just a friendlier UX.
        navigate(ROUTES.CLAWS, { replace: true })
        return null
    }

    const codes = codesQuery.data?.items || []
    const batches = batchesQuery.data?.items || []

    const handleVoid = async (id: string) => {
        try {
            await partner.voidCode(id)
            toast.success('Code voided.')
            codesQuery.refetch()
            batchesQuery.refetch()
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Void failed')
        }
    }

    const handleDownload = async (batchId: string) => {
        try {
            await partner.downloadBatchCsv(batchId)
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Download failed')
        }
    }

    return (
        <AppShell>
            <PageTitle
                title='Partner dashboard'
                description='Mint and manage activation codes for your customers.'
                noIndex
            />
            <main className='mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-8'>
                <PageHeader
                    title='Partner dashboard'
                    description='Mint and manage activation codes for your customers.'
                    action={
                        <Button onClick={() => navigate(ROUTES.MINT_CODES)}>
                            Mint batch
                        </Button>
                    }
                />

                <h2 className='mt-8 text-base font-semibold'>Batches</h2>
                {batchesQuery.isLoading ? (
                    <p className='text-muted-foreground py-2 text-xs'>
                        Loading batches…
                    </p>
                ) : batchesQuery.isError ? (
                    <ErrorState
                        title='Failed to load batches'
                        description='Try again in a moment.'
                        onRetry={() => batchesQuery.refetch()}
                    />
                ) : batches.length === 0 ? (
                    <EmptyState
                        icon={<KeyIcon className='text-primary h-10 w-10' />}
                        title='No batches yet'
                        description='Mint your first batch to hand to a customer.'
                    />
                ) : (
                    <div className='border-border mt-3 overflow-x-auto rounded-lg border'>
                        <table className='w-full text-sm'>
                            <thead className='bg-foreground/5 text-muted-foreground text-xs uppercase tracking-wide'>
                                <tr>
                                    <th className='px-3 py-2 text-left font-medium'>
                                        Spec
                                    </th>
                                    <th className='px-3 py-2 text-left font-medium'>
                                        Validity
                                    </th>
                                    <th className='px-3 py-2 text-left font-medium'>
                                        Codes
                                    </th>
                                    <th className='px-3 py-2 text-left font-medium'>
                                        Created
                                    </th>
                                    <th className='px-3 py-2 text-right font-medium'>
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {batches.map((b) => (
                                    <tr
                                        key={b.batchId}
                                        className='border-border border-t'
                                    >
                                        <td className='px-3 py-2 align-top'>
                                            <div>
                                                {b.tierLabel ||
                                                    b.planId ||
                                                    (b.skuKind === 'renewal'
                                                        ? 'Renewal'
                                                        : '—')}
                                            </div>
                                            <div className='text-muted-foreground text-xs'>
                                                {b.skuKind === 'renewal'
                                                    ? 'Renewal SKU'
                                                    : `${b.provider} · ${b.planId}`}
                                            </div>
                                        </td>
                                        <td className='px-3 py-2 align-top'>
                                            {validityLabel(b.validityDays)}
                                            <div className='text-muted-foreground text-xs'>
                                                {b.seats > 1
                                                    ? `${b.seats} seats`
                                                    : 'single use'}
                                            </div>
                                        </td>
                                        <td className='px-3 py-2 align-top text-xs'>
                                            <span>
                                                <strong>{b.total}</strong>{' '}
                                                total
                                            </span>{' '}
                                            <span className='text-foreground/70'>
                                                {b.unused} unused
                                            </span>{' '}
                                            <span className='text-emerald-600 dark:text-emerald-400'>
                                                {b.redeemed} redeemed
                                            </span>
                                        </td>
                                        <td className='whitespace-nowrap px-3 py-2 align-top'>
                                            {formatDate(b.createdAt)}
                                        </td>
                                        <td className='px-3 py-2 align-top text-right'>
                                            <button
                                                type='button'
                                                onClick={() =>
                                                    handleDownload(b.batchId)
                                                }
                                                className='text-muted-foreground hover:bg-foreground/5 hover:text-foreground rounded-md p-1.5 transition-colors'
                                                title='Download CSV'
                                                aria-label='Download CSV'
                                            >
                                                <DownloadSimpleIcon className='h-4 w-4' />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <h2 className='mt-8 text-base font-semibold'>All codes</h2>
                {codesQuery.isError ? (
                    <ErrorState
                        title='Failed to load codes'
                        description='Try again in a moment.'
                        onRetry={() => codesQuery.refetch()}
                    />
                ) : codesQuery.isLoading ? (
                    <p className='text-muted-foreground py-2 text-xs'>
                        Loading…
                    </p>
                ) : codes.length === 0 ? (
                    <EmptyState
                        icon={<KeyIcon className='text-primary h-10 w-10' />}
                        title='No codes yet'
                        description='Mint a batch to populate this list.'
                    />
                ) : (
                    <div className='border-border mt-3 overflow-x-auto rounded-lg border'>
                        <table className='w-full text-sm'>
                            <thead className='bg-foreground/5 text-muted-foreground text-xs uppercase tracking-wide'>
                                <tr>
                                    <th className='px-3 py-2 text-left font-medium'>
                                        Code
                                    </th>
                                    <th className='px-3 py-2 text-left font-medium'>
                                        Status
                                    </th>
                                    <th className='px-3 py-2 text-left font-medium'>
                                        Spec
                                    </th>
                                    <th className='px-3 py-2 text-left font-medium'>
                                        Validity
                                    </th>
                                    <th className='px-3 py-2 text-left font-medium'>
                                        Redeemed
                                    </th>
                                    <th className='px-3 py-2 text-right font-medium'>
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {codes.map((c) => (
                                    <tr
                                        key={c.id}
                                        className='border-border border-t'
                                    >
                                        <td className='px-3 py-2 align-top'>
                                            <span className='font-mono text-xs'>
                                                {c.code}
                                            </span>
                                        </td>
                                        <td className='px-3 py-2 align-top'>
                                            <AdminStatusBadge
                                                status={c.status}
                                            />
                                        </td>
                                        <td className='px-3 py-2 align-top'>
                                            <div>
                                                {c.tierLabel ||
                                                    c.planId ||
                                                    '—'}
                                            </div>
                                            <div className='text-muted-foreground text-xs'>
                                                {c.skuKind === 'renewal'
                                                    ? 'Renewal SKU'
                                                    : `${c.provider} · ${c.region}`}
                                            </div>
                                        </td>
                                        <td className='px-3 py-2 align-top'>
                                            <div>
                                                {validityLabel(c.validityDays)}
                                            </div>
                                            <div className='text-muted-foreground text-xs'>
                                                {c.seats > 1
                                                    ? `${c.seatsUsed}/${c.seats} seats`
                                                    : 'single use'}
                                            </div>
                                        </td>
                                        <td className='px-3 py-2 align-top text-xs'>
                                            {c.redeemedByEmail ? (
                                                <div>
                                                    {c.redeemedByEmail}
                                                    {c.redeemedClawName
                                                        ? ` → ${c.redeemedClawName}`
                                                        : ''}
                                                </div>
                                            ) : (
                                                <span className='text-muted-foreground'>
                                                    —
                                                </span>
                                            )}
                                        </td>
                                        <td className='px-3 py-2 align-top text-right'>
                                            {c.status === 'unused' ? (
                                                <button
                                                    type='button'
                                                    onClick={() =>
                                                        handleVoid(c.id)
                                                    }
                                                    className='text-muted-foreground hover:bg-foreground/5 hover:text-destructive rounded-md p-1.5 transition-colors'
                                                    title='Void this code'
                                                    aria-label='Void code'
                                                >
                                                    <XCircleIcon className='h-4 w-4' />
                                                </button>
                                            ) : null}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </main>
        </AppShell>
    )
}

export default Partner