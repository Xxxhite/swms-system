import { http } from '@/api/request'
import type {
    AuthorizationInput,
    Organization,
    PageResult,
    Permission,
    Role,
    UserDetail,
    UserSummary,
} from '@/api/types'

export const identityApi = {
    orgs: (): Promise<Organization[]> => http.get('/orgs/tree'),
    saveOrg: (id: number | null, input: Record<string, unknown>): Promise<unknown> =>
        id ? http.put(`/orgs/${id}`, input) : http.post('/orgs', input),
    deleteOrg: (id: number, version: number): Promise<unknown> =>
        http.delete(`/orgs/${id}`, { version }),
    dictionary: (type: string): Promise<Array<{ code: string; name: string }>> =>
        http.get(`/dictionaries/${type}`),
    users: (
        query: Record<string, unknown>,
        registrations = false,
    ): Promise<PageResult<UserSummary>> =>
        http.get(registrations ? '/registrations' : '/users', query),
    user: (id: number, registration = false): Promise<UserDetail> =>
        http.get(`${registration ? '/registrations' : '/users'}/${id}`),
    updateUser: (id: number, input: Record<string, unknown>): Promise<unknown> =>
        http.put(`/users/${id}`, input),
    status: (id: number, version: number, status: string): Promise<unknown> =>
        http.put(`/users/${id}/status`, { version, status }),
    authorize: (id: number, input: AuthorizationInput & { version: number }): Promise<unknown> =>
        http.put(`/users/${id}/authorization`, input),
    approve: (id: number, input: Record<string, unknown>): Promise<unknown> =>
        http.post(`/registrations/${id}/approve`, input),
    reject: (id: number, version: number, comment: string): Promise<unknown> =>
        http.post(`/registrations/${id}/reject`, { version, comment }),
    roles: (): Promise<Role[]> => http.get('/roles'),
    permissions: (): Promise<Permission[]> => http.get('/permissions'),
    saveRole: (id: number | null, input: Record<string, unknown>): Promise<unknown> =>
        id ? http.put(`/roles/${id}`, input) : http.post('/roles', input),
    rolePermissions: (id: number, version: number, permissionCodes: string[]): Promise<unknown> =>
        http.put(`/roles/${id}/permissions`, { version, permissionCodes }),
    deleteRole: (id: number, version: number): Promise<unknown> =>
        http.delete(`/roles/${id}`, { version }),
}
