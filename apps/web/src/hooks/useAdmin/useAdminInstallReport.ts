import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib'
import ADMIN_INSTALL_REPORTS_QUERY_KEY from '@/hooks/useAdmin/ADMIN_INSTALL_REPORTS_QUERY_KEY'

const useAdminInstallReport = (id: string | null) => {
    return useQuery({
        queryKey: [...ADMIN_INSTALL_REPORTS_QUERY_KEY, 'detail', id],
        queryFn: () => api.getAdminInstallReport(id!),
        enabled: !!id,
        staleTime: 0
    })
}

export default useAdminInstallReport