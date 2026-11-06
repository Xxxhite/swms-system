import { http } from '@/api/request'
import { useMock } from '@/api/config'
import { mockDashboard } from '@/mock/management'
import type { DashboardOverview } from '@/api/management-types'
export const dashboardApi = {
    overview: (): Promise<DashboardOverview> =>
        useMock ? mockDashboard() : http.get('/dashboard/overview'),
}
