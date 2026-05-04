import { useInfiniteQuery } from '@tanstack/react-query'
import { api } from '@/lib'
import ADMIN_INSTALL_REPORTS_QUERY_KEY from '@/hooks/useAdmin/ADMIN_INSTALL_REPORTS_QUERY_KEY'

const useAdminInstallReports = (
    limit: number = 20,
    search?: string,
    phase?: string
) => {
    return useInfiniteQuery({
        queryKey: [...ADMIN_INSTALL_REPORTS_QUERY_KEY, limit, search, phase],
        queryFn: ({ pageParam }) =>
            api.listAdminInstallReports(pageParam, limit, search, phase),
        initialPageParam: 1,
        getNextPageParam: (lastPage) =>
            lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
        // Auto-refresh every 30s so the admin sees new failure reports without
        // having to hit refresh. Cheap query — table is small.
        refetchInterval: 30_000,
        staleTime: 0
    })
}

export default useAdminInstallReports