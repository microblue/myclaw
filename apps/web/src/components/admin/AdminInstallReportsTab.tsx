import type { FC, ReactNode } from 'react'
import type { AdminInstallReportListItem } from '@/ts/Interfaces'

import { Fragment, useMemo, useState } from 'react'
import { formatDate } from '@/lib'
import {
    useAdminInstallReports,
    useAdminInstallReport,
    useInfiniteScrollObserver,
    useDebouncedValue
} from '@/hooks'
import {
    Badge,
    Card,
    CardContent,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    Input
} from '@/components/ui'
import { EmptyState, ErrorState } from '@/components'
import { BugIcon, XIcon } from '@phosphor-icons/react'

const PAGE_SIZE = 20

// Phases the desktop bootstrap state machine reports — kept in sync with
// myclaw-desk/src/shared/bootstrap.ts. Failures usually cluster on a couple
// (installing, starting-gateway), so the filter helps slice fast.
const PHASE_OPTIONS = [
    { value: '', label: 'All phases' },
    { value: 'detecting', label: 'detecting' },
    { value: 'preparing', label: 'preparing' },
    { value: 'installing', label: 'installing' },
    { value: 'starting-gateway', label: 'starting-gateway' },
    { value: 'error', label: 'error' }
]

// `Install Reports` — crash reports posted by the desktop installer when
// bootstrap fails. Renders a table; click a row to expand the full env +
// log dump beneath it.
const AdminInstallReportsTab: FC = (): ReactNode => {
    const [search, setSearch] = useState('')
    const [phase, setPhase] = useState('')
    const debouncedSearch = useDebouncedValue(search, 300)
    const [expandedId, setExpandedId] = useState<string | null>(null)

    const {
        data,
        isLoading,
        isError,
        refetch,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage
    } = useAdminInstallReports(PAGE_SIZE, debouncedSearch || undefined, phase || undefined)

    const allItems: AdminInstallReportListItem[] = useMemo(
        () =>
            data?.pages.flatMap(
                (p: { items: AdminInstallReportListItem[] }) => p.items
            ) ?? [],
        [data]
    )

    const loadMoreRef = useInfiniteScrollObserver({
        isFetchingNextPage,
        hasNextPage,
        fetchNextPage
    })

    return (
        <Fragment>
            <div className='mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
                <h3 className='text-xl font-semibold flex items-center gap-2'>
                    <BugIcon size={22} weight='duotone' />
                    Install Reports
                </h3>
                <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder='Search hostname / version / message'
                        className='h-10 w-full sm:w-72'
                    />
                    <Select value={phase} onValueChange={setPhase}>
                        <SelectTrigger
                            className='h-10 w-full sm:w-44'
                            placeholder={
                                PHASE_OPTIONS.find((o) => o.value === phase)
                                    ?.label ?? 'All phases'
                            }
                        />
                        <SelectContent>
                            {PHASE_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                    {o.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {isError ? (
                <div className='py-8'>
                    <ErrorState
                        title='Failed to load install reports'
                        onRetry={() => refetch()}
                    />
                </div>
            ) : !isLoading && allItems.length === 0 ? (
                <EmptyState
                    icon={<BugIcon size={32} weight='duotone' />}
                    title='No install reports yet'
                    description='Reports will appear here when a desktop installer fails on a user machine.'
                />
            ) : (
                <Card>
                    <CardContent className='p-0'>
                        <div className='overflow-x-auto'>
                            <table className='w-full text-sm'>
                                <thead className='border-b text-left text-xs uppercase text-muted-foreground'>
                                    <tr>
                                        <Th>Time</Th>
                                        <Th>Host</Th>
                                        <Th>Version</Th>
                                        <Th>OS</Th>
                                        <Th>Phase</Th>
                                        <Th>Error</Th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {allItems.map((row) => (
                                        <Fragment key={row.id}>
                                            <tr
                                                className='cursor-pointer border-b last:border-0 hover:bg-muted/40'
                                                onClick={() =>
                                                    setExpandedId((prev) =>
                                                        prev === row.id
                                                            ? null
                                                            : row.id
                                                    )
                                                }
                                            >
                                                <Td>
                                                    <span className='whitespace-nowrap'>
                                                        {formatDate(
                                                            row.createdAt
                                                        )}
                                                    </span>
                                                </Td>
                                                <Td>
                                                    <div className='font-mono text-xs'>
                                                        {row.hostname}
                                                    </div>
                                                    <div className='text-xs text-muted-foreground'>
                                                        {row.username}
                                                    </div>
                                                </Td>
                                                <Td>
                                                    <Badge variant='outline'>
                                                        {row.desktopVersion}
                                                    </Badge>
                                                </Td>
                                                <Td>
                                                    <span className='text-xs'>
                                                        {row.platform}-
                                                        {row.arch}
                                                    </span>
                                                </Td>
                                                <Td>
                                                    <Badge>
                                                        {row.bootstrapPhase}
                                                    </Badge>
                                                </Td>
                                                <Td>
                                                    <span className='line-clamp-1 max-w-md text-xs text-muted-foreground'>
                                                        {row.errorMessage}
                                                    </span>
                                                </Td>
                                            </tr>
                                            {expandedId === row.id ? (
                                                <ExpandedRow
                                                    id={row.id}
                                                    onClose={() =>
                                                        setExpandedId(null)
                                                    }
                                                />
                                            ) : null}
                                        </Fragment>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Sentinel for infinite scroll — observer fires when near the bottom. */}
            <div ref={loadMoreRef} className='h-4 w-full' />
            {isFetchingNextPage ? (
                <div className='py-2 text-center text-xs text-muted-foreground'>
                    Loading more…
                </div>
            ) : null}
        </Fragment>
    )
}

const Th: FC<{ children: ReactNode }> = ({ children }) => (
    <th className='px-3 py-2 font-medium'>{children}</th>
)
const Td: FC<{ children: ReactNode }> = ({ children }) => (
    <td className='px-3 py-2 align-top'>{children}</td>
)

const ExpandedRow: FC<{ id: string; onClose: () => void }> = ({
    id,
    onClose
}) => {
    const { data, isLoading, isError } = useAdminInstallReport(id)
    const report = data?.report

    return (
        <tr>
            <td colSpan={6} className='border-b bg-muted/20 p-4'>
                <div className='mb-2 flex items-center justify-between'>
                    <div className='text-xs text-muted-foreground'>
                        Report id: <span className='font-mono'>{id}</span>
                    </div>
                    <button
                        className='text-xs text-muted-foreground hover:text-foreground'
                        onClick={onClose}
                    >
                        <XIcon size={14} className='inline' /> Collapse
                    </button>
                </div>

                {isLoading ? (
                    <div className='text-xs text-muted-foreground'>
                        Loading details…
                    </div>
                ) : isError || !report ? (
                    <div className='text-xs text-destructive'>
                        Failed to load this report.
                    </div>
                ) : (
                    <div className='space-y-3'>
                        <Section title='Identity'>
                            <Field label='installId' value={report.installId} />
                            <Field label='hostname' value={report.hostname} />
                            <Field label='username' value={report.username} />
                            <Field label='ip' value={report.ip ?? '—'} />
                        </Section>

                        <Section title='Versions'>
                            <Field
                                label='desktop'
                                value={report.desktopVersion}
                            />
                            <Field
                                label='node'
                                value={report.nodeVersion}
                            />
                            <Field
                                label='os'
                                value={`${report.platform}-${report.arch} (${report.osRelease})`}
                            />
                        </Section>

                        <Section title='Failure'>
                            <Field
                                label='phase'
                                value={report.bootstrapPhase}
                            />
                            <div>
                                <div className='text-xs font-medium text-muted-foreground'>
                                    error.message
                                </div>
                                <pre className='whitespace-pre-wrap break-all rounded bg-background p-2 text-xs'>
                                    {report.errorMessage}
                                </pre>
                            </div>
                            {report.errorStack ? (
                                <div>
                                    <div className='text-xs font-medium text-muted-foreground'>
                                        error.stack
                                    </div>
                                    <pre className='max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-background p-2 font-mono text-[11px] leading-tight'>
                                        {report.errorStack}
                                    </pre>
                                </div>
                            ) : null}
                        </Section>

                        <Section title='Environment'>
                            <pre className='max-h-48 overflow-auto whitespace-pre-wrap rounded bg-background p-2 font-mono text-[11px] leading-tight'>
                                {JSON.stringify(report.envInfo, null, 2)}
                            </pre>
                        </Section>

                        <Section title='Logs'>
                            <pre className='max-h-96 overflow-auto whitespace-pre-wrap rounded bg-background p-2 font-mono text-[11px] leading-tight'>
                                {report.logs || '(no logs)'}
                            </pre>
                        </Section>
                    </div>
                )}
            </td>
        </tr>
    )
}

const Section: FC<{ title: string; children: ReactNode }> = ({
    title,
    children
}) => (
    <div>
        <div className='mb-1 text-xs font-semibold uppercase text-muted-foreground'>
            {title}
        </div>
        <div className='space-y-2'>{children}</div>
    </div>
)

const Field: FC<{ label: string; value: string }> = ({ label, value }) => (
    <div className='flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3'>
        <span className='w-28 shrink-0 text-xs font-medium text-muted-foreground'>
            {label}
        </span>
        <span className='break-all font-mono text-xs'>{value}</span>
    </div>
)

export default AdminInstallReportsTab