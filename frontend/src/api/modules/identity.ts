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

/** 组织与身份管理接口：封装路由地址，具体权限和业务规则由后端校验。 */
export const identityApi = {
    /** 读取授权范围内的组织平面列表，由页面组装树形结构。 */
    orgs: (): Promise<Organization[]> => http.get('/orgs/tree'),
    /** 按是否传入主键新增或修改组织，修改时携带 version。 */
    saveOrg: (id: number | null, input: Record<string, unknown>): Promise<unknown> =>
        id ? http.put(`/orgs/${id}`, input) : http.post('/orgs', input),
    /** 按指定版本删除无引用的组织，引用保护由后端执行。 */
    deleteOrg: (id: number, version: number): Promise<unknown> =>
        http.delete(`/orgs/${id}`, { version }),
    /** 按白名单类型读取固定岗位、领域等字典。 */
    dictionary: (type: string): Promise<Array<{ code: string; name: string }>> =>
        http.get(`/dictionaries/${type}`),
    /** 分页查询人员；registrations=true 时切换为注册审核列表。 */
    users: (
        query: Record<string, unknown>,
        registrations = false,
    ): Promise<PageResult<UserSummary>> =>
        http.get(registrations ? '/registrations' : '/users', query),
    /** 读取人员或注册申请详情，补齐列表中没有的授权信息。 */
    user: (id: number, registration = false): Promise<UserDetail> =>
        http.get(`${registration ? '/registrations' : '/users'}/${id}`),
    /** 提交管理员维护的人员资料及任职信息，不混入角色授权。 */
    updateUser: (id: number, input: Record<string, unknown>): Promise<unknown> =>
        http.put(`/users/${id}`, input),
    /** 按资料版本修改启用、停用或离职状态。 */
    status: (id: number, version: number, status: string): Promise<unknown> =>
        http.put(`/users/${id}/status`, { version, status }),
    /** 整体提交角色、附加权限、数据范围和负责组织。 */
    authorize: (id: number, input: AuthorizationInput & { version: number }): Promise<unknown> =>
        http.put(`/users/${id}/authorization`, input),
    /** 提交审核批准及任职授权信息，后端统一处理事务和重复请求。 */
    approve: (id: number, input: Record<string, unknown>): Promise<unknown> =>
        http.post(`/registrations/${id}/approve`, input),
    /** 提交驳回意见及申请版本，员工可修改后重提。 */
    reject: (id: number, version: number, comment: string): Promise<unknown> =>
        http.post(`/registrations/${id}/reject`, { version, comment }),
    /** 读取角色及其权限集合，供管理表格和授权选项使用。 */
    roles: (): Promise<Role[]> => http.get('/roles'),
    /** 读取完整功能权限目录，供角色及个人附加权限选择。 */
    permissions: (): Promise<Permission[]> => http.get('/permissions'),
    /** 新增或修改角色基本资料，权限集合通过独立方法保存。 */
    saveRole: (id: number | null, input: Record<string, unknown>): Promise<unknown> =>
        id ? http.put(`/roles/${id}`, input) : http.post('/roles', input),
    /** 按角色版本替换完整权限集合，空数组表示清空可编辑权限。 */
    rolePermissions: (id: number, version: number, permissionCodes: string[]): Promise<unknown> =>
        http.put(`/roles/${id}/permissions`, { version, permissionCodes }),
    /** 按版本删除可移除的自定义角色，内建及引用保护由后端执行。 */
    deleteRole: (id: number, version: number): Promise<unknown> =>
        http.delete(`/roles/${id}`, { version }),
}
