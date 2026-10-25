import { http } from '@/api/request'
import type { PageResult } from '@/api/types'
import {
    queryParams,
    type BusinessQuery,
    type Project,
    type ProjectInput,
    type ContractInput,
    type Candidates,
    type Allocation,
    type Indicator,
} from '@/api/business-types'
/** 项目配置接口：嵌套资源写入携带项目或指标版本，服务端再校验完整范围。 */
export const projectApi = {
    files: (id: number): Promise<import('@/api/business-types').ContractFile[]> =>
        http.get(`/service/contract-package-projects/${id}/contract/files`),
    upload: (id: number, file: File) => {
        const data = new FormData()
        data.append('file', file)
        return http.post(`/service/contract-package-projects/${id}/contract/files`, data, {
            timeout: 120000,
        })
    },
    downloadFile: (id: number) => http.download(`/files/${id}/download`),
    removeFile: (id: number) => http.delete(`/files/${id}`),
    filterOptions: (): Promise<Candidates> =>
        http.get('/service/contract-package-projects/candidates', { kind: 'filters' }),
    list: (q: BusinessQuery): Promise<PageResult<Project>> =>
        http.get('/service/contract-package-projects', queryParams(q)),
    detail: (id: number): Promise<Project> => http.get(`/service/contract-package-projects/${id}`),
    candidates: (projectId?: number): Promise<Candidates> =>
        http.get('/service/contract-package-projects/candidates', projectId ? { projectId } : {}),
    create: (body: ProjectInput): Promise<{ id: number }> =>
        http.post('/service/contract-package-projects', body),
    update: (id: number, body: ProjectInput, version: number) =>
        http.put(`/service/contract-package-projects/${id}`, { ...body, version }),
    activate: (p: Project) =>
        http.post(`/service/contract-package-projects/${p.id}/activate`, { version: p.version }),
    remove: (p: Project) =>
        http.delete(`/service/contract-package-projects/${p.id}`, { version: p.version }),
    contract: (p: Project, body: ContractInput) =>
        http.put(`/service/contract-package-projects/${p.id}/contract`, {
            ...body,
            version: p.version,
        }),
    teams: (p: Project, teams: Array<{ teamId: number; reporterId: number }>) =>
        http.put(`/service/contract-package-projects/${p.id}/teams`, { teams, version: p.version }),
    members: (p: Project, members: import('@/api/business-types').ProjectMember[]) =>
        http.put(`/service/contract-package-projects/${p.id}/members`, {
            version: p.version,
            members,
        }),
    points: (p: Project, points: Project['servicePoints']) =>
        http.put(`/service/contract-package-projects/${p.id}/service-points`, {
            points: points.map((point) => ({
                id: point.id,
                name: point.name,
                address: point.address ?? '',
                note: point.note ?? '',
            })),
            version: p.version,
        }),
    indicator: (
        projectId: number,
        body: { name: string; unit: string; definition: string; targetValue: string },
        indicator?: Indicator,
    ) =>
        indicator
            ? http.put(
                  `/service/contract-package-projects/${projectId}/indicators/${indicator.id}`,
                  {
                      ...body,
                      version: indicator.version,
                  },
              )
            : http.post(`/service/contract-package-projects/${projectId}/indicators`, body),
    allocations: (
        projectId: number,
        i: Indicator,
        targets: Allocation[],
        targetValue?: string,
        reason?: string,
    ) =>
        http.put(
            `/service/contract-package-projects/${projectId}/indicators/${i.id}/${i.status === 'ACTIVE' ? 'target-plan' : 'allocations'}`,
            {
                version: i.version,
                targets,
                ...(i.status === 'ACTIVE' ? { targetValue, reason } : {}),
            },
        ),
    activateIndicator: (projectId: number, i: Indicator) =>
        http.post(`/service/contract-package-projects/${projectId}/indicators/${i.id}/activate`, {
            version: i.version,
        }),
    removeIndicator: (projectId: number, i: Indicator) =>
        http.delete(`/service/contract-package-projects/${projectId}/indicators/${i.id}`, {
            version: i.version,
        }),
}
