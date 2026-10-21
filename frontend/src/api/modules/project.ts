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
    filterOptions: (): Promise<Candidates> => http.get('/projects/candidates', { kind: 'filters' }),
    list: (q: BusinessQuery): Promise<PageResult<Project>> => http.get('/projects', queryParams(q)),
    detail: (id: number): Promise<Project> => http.get(`/projects/${id}`),
    candidates: (projectId?: number): Promise<Candidates> =>
        http.get('/projects/candidates', projectId ? { projectId } : {}),
    create: (body: ProjectInput): Promise<{ id: number }> => http.post('/projects', body),
    update: (id: number, body: ProjectInput, version: number) =>
        http.put(`/projects/${id}`, { ...body, version }),
    activate: (p: Project) => http.post(`/projects/${p.id}/activate`, { version: p.version }),
    remove: (p: Project) => http.delete(`/projects/${p.id}`, { version: p.version }),
    contract: (p: Project, body: ContractInput) =>
        http.put(`/projects/${p.id}/contract`, { ...body, version: p.version }),
    teams: (p: Project, teams: Array<{ teamId: number; reporterId: number }>) =>
        http.put(`/projects/${p.id}/teams`, { teams, version: p.version }),
    points: (p: Project, points: Project['servicePoints']) =>
        http.put(`/projects/${p.id}/service-points`, {
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
            ? http.put(`/projects/${projectId}/indicators/${indicator.id}`, {
                  ...body,
                  version: indicator.version,
              })
            : http.post(`/projects/${projectId}/indicators`, body),
    allocations: (
        projectId: number,
        i: Indicator,
        targets: Allocation[],
        targetValue?: string,
        reason?: string,
    ) =>
        http.put(
            `/projects/${projectId}/indicators/${i.id}/${i.status === 'ACTIVE' ? 'target-plan' : 'allocations'}`,
            {
                version: i.version,
                targets,
                ...(i.status === 'ACTIVE' ? { targetValue, reason } : {}),
            },
        ),
    activateIndicator: (projectId: number, i: Indicator) =>
        http.post(`/projects/${projectId}/indicators/${i.id}/activate`, { version: i.version }),
    removeIndicator: (projectId: number, i: Indicator) =>
        http.delete(`/projects/${projectId}/indicators/${i.id}`, { version: i.version }),
}
