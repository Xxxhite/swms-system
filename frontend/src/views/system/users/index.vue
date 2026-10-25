<script setup lang="ts">
import { canSupervise } from '@/constants/personnel'
import { useTableSort } from '@/utils/tableSort'
import { formatDateTime } from '@/utils/dateTime'
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/message-box/style/css'
import { identityApi } from '@/api/modules/identity'
import { useMock } from '@/api/config'
import { PERM } from '@/api/permissions'
import {
    statusLabels,
    type AuthorizationInput,
    type Organization,
    type Permission,
    type Role,
    type UserDetail,
    type UserSummary,
} from '@/api/types'
import { useUserStore } from '@/stores/user'
import { scopeOptions } from '../shared'
import { useUserList } from './useUserList'
const store = useUserStore()
const route = useRoute()
const router = useRouter()
// 人员管理与注册审核复用表格和弹窗，路由决定数据来源及可执行的操作。
const registrations = computed(() => route.path === '/system/registrations')
const title = computed(() => (registrations.value ? '注册审核' : '人员管理'))
const {
    rows,
    total,
    query,
    loading,
    load: loadUsers,
    invalidate,
    applyReview,
} = useUserList(() => registrations.value, identityApi.users)
const { setTableRef, defaultSort, onSortChange, resetSort } = useTableSort(
    query,
    'createdAt',
    'descending',
    load,
)
const busy = ref(false)
const dialog = ref(false)
// 弹窗模式分别控制展示字段和保存接口，任职资料与功能授权分开提交。
const mode = ref<'view' | 'edit' | 'approve' | 'authorize' | 'reject'>('view')
const target = ref<UserDetail>()
const orgs = ref<Organization[]>([])
const roles = ref<Role[]>([])
const permissions = ref<Permission[]>([])
const directory = ref<UserSummary[]>([])
const positions = ref<Array<{ code: string; name: string }>>([])
const fields = ref<Array<{ code: string; name: string }>>([])
const form = reactive({
    name: '',
    phone: '',
    orgId: null as number | null,
    positionCode: '',
    supervisorId: null as number | null,
    socialWorkerNo: '',
    serviceFieldCodes: [] as string[],
    isSupervisor: false,
    roleIds: [] as number[],
    extraPermissions: [] as string[],
    dataScope: 'SELF' as AuthorizationInput['dataScope'],
    managedOrgIds: [] as number[],
    comment: '',
})
watch(
    () => form.positionCode,
    (value) => {
        if (!canSupervise(value)) form.isSupervisor = false
    },
)
/** 真实接口模式按当前入口查询；演示模式不发送人员管理请求。 */
async function load() {
    if (useMock) return 'superseded'
    return loadUsers()
}
/** 写入弹窗才加载授权选项，只有查询权限的主管查看详情时不请求管理员接口。 */
async function options() {
    const [organizationRows, roleRows, permissionRows, positionRows, fieldRows] = await Promise.all(
        [
            identityApi.orgs(),
            identityApi.roles(),
            identityApi.permissions(),
            identityApi.dictionary('positions'),
            identityApi.dictionary('serviceFields'),
        ],
    )
    orgs.value = organizationRows
    roles.value = roleRows
    permissions.value = permissionRows
    positions.value = positionRows
    fields.value = fieldRows
    // 主管候选来自当前账号可见的启用人员；逐页读取，避免候选被单页上限截断。
    const all: UserSummary[] = []
    for (let page = 1; ; page++) {
        const result = await identityApi.users({ page, pageSize: 100, status: 'ACTIVE' })
        all.push(...result.list)
        if (all.length >= result.total || result.list.length === 0) break
    }
    directory.value = all
}
/** 读取完整人员详情，按弹窗模式加载必要选项并回填编辑字段。 */
async function open(row: UserSummary, nextMode: typeof mode.value) {
    if (busy.value) return
    busy.value = true
    try {
        // 列表仅有摘要；打开弹窗重新读取完整资料、授权集合和用于冲突检查的 version。
        const detail = await identityApi.user(row.id, registrations.value)
        if (['edit', 'approve', 'authorize'].includes(nextMode)) await options()
        target.value = detail
        mode.value = nextMode
        Object.assign(form, {
            name: detail.name,
            phone: detail.phone,
            orgId: detail.orgId,
            positionCode: detail.positionCode ?? '',
            supervisorId: detail.supervisorId,
            socialWorkerNo: detail.socialWorkerNo ?? '',
            serviceFieldCodes: detail.serviceFieldCodes ?? [],
            isSupervisor: detail.isSupervisor ?? false,
            roleIds: detail.roleIds,
            extraPermissions: detail.extraPermissions,
            dataScope: detail.dataScope,
            managedOrgIds: detail.managedOrgIds,
            comment: '',
        })
        dialog.value = true
    } catch {
        /* 请求层统一提示 */
    } finally {
        busy.value = false
    }
}
/** 按编辑、审核或授权模式组装字段，携带版本提交并刷新列表及本人身份。 */
async function save() {
    if (busy.value || !target.value) return
    if (['edit', 'approve'].includes(mode.value) && (!form.orgId || !form.positionCode)) {
        ElMessage.warning('请选择任职组织和岗位')
        return
    }
    if (mode.value === 'edit' && (!form.name.trim() || !form.phone.trim())) {
        ElMessage.warning('请填写姓名和联系电话')
        return
    }
    if (mode.value === 'edit' && !form.serviceFieldCodes.length) {
        ElMessage.warning('请至少选择一个服务领域')
        return
    }
    if (mode.value === 'reject' && !form.comment.trim()) {
        ElMessage.warning('请填写驳回意见')
        return
    }
    if (
        ['approve', 'authorize'].includes(mode.value) &&
        form.dataScope === 'SUBTREE' &&
        !form.managedOrgIds.length
    ) {
        ElMessage.warning('请选择负责组织')
        return
    }
    busy.value = true
    const sourcePath = route.path
    try {
        const id = target.value.id
        // 使用打开弹窗时取得的版本，让后端发现编辑期间其他人对同一记录的修改。
        const version = target.value.version
        const placement = {
            orgId: form.orgId,
            positionCode: form.positionCode,
            supervisorId: form.supervisorId,
            isSupervisor: form.isSupervisor,
        }
        const authorization = {
            roleIds: form.roleIds,
            extraPermissions: form.extraPermissions,
            dataScope: form.dataScope,
            // 切出组织子树范围时清空旧根节点，避免下次切换时沿用过期的负责组织。
            managedOrgIds: form.dataScope === 'SUBTREE' ? form.managedOrgIds : [],
        }
        let reviewed: UserSummary | undefined
        if (mode.value === 'edit')
            await identityApi.updateUser(id, {
                ...placement,
                version,
                name: form.name,
                phone: form.phone,
                socialWorkerNo: form.socialWorkerNo || null,
                serviceFieldCodes: form.serviceFieldCodes,
            })
        else if (mode.value === 'approve')
            reviewed = await identityApi.approve(id, { ...placement, ...authorization, version })
        else if (mode.value === 'authorize')
            await identityApi.authorize(id, { ...authorization, version })
        else if (mode.value === 'reject')
            reviewed = await identityApi.reject(id, version, form.comment)
        // 请求期间可能切换入口，不把旧页面的审核结果写入新页面。
        if (route.path !== sourcePath) {
            ElMessage.success('操作完成')
            return
        }
        if (reviewed) applyReview(reviewed)
        dialog.value = false
        ElMessage.success(reviewed ? '审核结果已保存' : '操作完成')
        // 管理员修改本人资料或授权后，同步刷新菜单和身份摘要。
        if (id === store.profile?.id) await store.loadProfile()
        if ((await load()) === 'failed')
            ElMessage.warning('操作已成功，列表刷新失败，请点击“刷新”重试')
    } catch {
        /* 请求层统一提示 */
    } finally {
        busy.value = false
    }
}
/** 确认账号状态变更，再按记录版本提交启用、停用或离职操作。 */
async function changeStatus(row: UserSummary, status: 'ACTIVE' | 'DISABLED' | 'LEFT') {
    if (busy.value) return
    try {
        await ElMessageBox.confirm(
            `确认将“${row.name}”设为${statusLabels[status]}？停用或离职后旧凭证立即失效。`,
            '账号状态',
            { type: 'warning' },
        )
    } catch {
        return
    }
    busy.value = true
    try {
        await identityApi.status(row.id, row.version, status)
        await load()
        ElMessage.success('状态已更新')
    } catch {
        /* 请求层统一提示 */
    } finally {
        busy.value = false
    }
}
/** 从第一页执行新的筛选，避免沿用旧页码导致结果为空。 */
function search() {
    query.page = 1
    void load()
}
/** 清空手动筛选条件，从第一页立即重新查询，保留每页条数。 */
function resetSearch() {
    resetSort()
    query.keyword = ''
    query.status = ''
    search()
}
watch(
    () => route.path,
    () => {
        invalidate()
        resetSort()
        query.page = 1
        query.keyword = ''
        query.status = ''
        rows.value = []
        total.value = 0
        dialog.value = false
        void load()
    },
    { immediate: true },
)
</script>
<template>
    <el-card>
        <template #header>
            <div class="page-header">
                <span>{{ title }}</span>
                <el-button v-if="!useMock" @click="load">刷新</el-button>
            </div>
        </template>
        <el-alert
            v-if="useMock"
            title="当前为演示模式；人员维护与审核需使用真实接口模式。"
            type="info"
            :closable="false"
        />
        <template v-else>
            <el-form class="filter-form" @submit.prevent="search">
                <el-form-item label="姓名或账号">
                    <el-input v-model="query.keyword" clearable maxlength="100" />
                </el-form-item>
                <el-form-item label="状态">
                    <el-select v-model="query.status" clearable>
                        <el-option
                            v-for="(label, status) in statusLabels"
                            v-show="!registrations || ['PENDING', 'REJECTED'].includes(status)"
                            :key="status"
                            :label="label"
                            :value="status"
                        />
                    </el-select>
                </el-form-item>
                <el-form-item class="filter-form__actions">
                    <el-button type="primary" native-type="submit">查询</el-button>
                    <el-button @click="resetSearch">重置</el-button>
                </el-form-item>
            </el-form>
            <p v-if="!registrations" class="approval-hint">
                待审核账号须在“注册审核”中批准并分配任职与权限；已驳回账号须由申请人修改后重新提交。
            </p>
            <el-table
                :ref="setTableRef"
                v-loading="loading"
                :data="rows"
                :default-sort="defaultSort"
                @sort-change="onSortChange"
            >
                <!-- @vue-generic {UserSummary} -->
                <el-table-column
                    prop="name"
                    sortable="custom"
                    label="姓名"
                    min-width="120"
                    show-overflow-tooltip
                />
                <!-- @vue-generic {UserSummary} -->
                <el-table-column
                    prop="username"
                    sortable="custom"
                    label="账号"
                    min-width="180"
                    show-overflow-tooltip
                />
                <!-- @vue-generic {UserSummary} -->
                <el-table-column prop="phone" label="电话" min-width="140" />
                <!-- @vue-generic {UserSummary} -->
                <el-table-column label="状态" width="100">
                    <template #default="{ row }">
                        {{ statusLabels[row.status as keyof typeof statusLabels] }}
                    </template>
                </el-table-column>
                <!-- @vue-generic {UserSummary} -->
                <el-table-column
                    prop="proposedPosition"
                    label="申请岗位"
                    min-width="180"
                    show-overflow-tooltip
                />
                <!-- @vue-generic {UserSummary} -->
                <el-table-column prop="dataScope" label="范围" min-width="160">
                    <template #default="{ row }">
                        {{
                            scopeOptions.find((scope) => scope.value === row.dataScope)?.label ??
                            '未知范围'
                        }}
                    </template>
                </el-table-column>
                <!-- @vue-generic {UserSummary} -->
                <el-table-column
                    prop="createdAt"
                    label="注册时间"
                    min-width="180"
                    sortable="custom"
                >
                    <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
                </el-table-column>
                <!-- @vue-generic {UserSummary} -->
                <el-table-column label="操作" width="300" fixed="right">
                    <template #default="{ row }">
                        <el-button link type="primary" @click="open(row, 'view')">详情</el-button>
                        <el-button
                            v-if="
                                !registrations &&
                                ['PENDING', 'REJECTED'].includes(row.status) &&
                                store.hasPermission(PERM.REGISTRATION_VIEW) &&
                                store.hasPermission(PERM.REGISTRATION_APPROVE)
                            "
                            link
                            type="primary"
                            @click="router.push('/system/registrations')"
                        >
                            前往审核
                        </el-button>
                        <template
                            v-if="
                                registrations &&
                                row.status === 'PENDING' &&
                                store.hasPermission(PERM.REGISTRATION_APPROVE)
                            "
                        >
                            <el-button link type="primary" @click="open(row, 'approve')">
                                批准
                            </el-button>
                            <el-button link type="danger" @click="open(row, 'reject')">
                                驳回
                            </el-button>
                        </template>
                        <template
                            v-if="!registrations && !['PENDING', 'REJECTED'].includes(row.status)"
                        >
                            <el-button
                                v-if="store.hasPermission(PERM.USER_MANAGE)"
                                link
                                type="primary"
                                @click="open(row, 'edit')"
                            >
                                编辑
                            </el-button>
                            <el-button
                                v-if="
                                    row.status === 'ACTIVE' &&
                                    store.hasPermission(PERM.USER_AUTHORIZE)
                                "
                                link
                                type="primary"
                                @click="open(row, 'authorize')"
                            >
                                授权
                            </el-button>
                            <template v-if="store.hasPermission(PERM.USER_MANAGE)">
                                <el-button
                                    v-if="row.status !== 'ACTIVE'"
                                    link
                                    type="primary"
                                    @click="changeStatus(row, 'ACTIVE')"
                                >
                                    启用
                                </el-button>
                                <el-button
                                    v-if="row.status === 'ACTIVE'"
                                    link
                                    type="warning"
                                    @click="changeStatus(row, 'DISABLED')"
                                >
                                    停用
                                </el-button>
                                <el-button
                                    v-if="row.status !== 'LEFT'"
                                    link
                                    type="danger"
                                    @click="changeStatus(row, 'LEFT')"
                                >
                                    离职
                                </el-button>
                            </template>
                        </template>
                    </template>
                </el-table-column>
            </el-table>
            <el-pagination
                v-model:current-page="query.page"
                v-model:page-size="query.pageSize"
                :page-sizes="[10, 20, 50, 100]"
                :total="total"
                layout="total, sizes, prev, pager, next"
                @size-change="search"
                class="table-pagination"
                @current-change="load"
            />
        </template>
        <el-dialog
            v-model="dialog"
            :title="
                {
                    view: '人员详情',
                    edit: '编辑人员',
                    approve: '审核并分配权限',
                    authorize: '人员授权',
                    reject: '驳回申请',
                }[mode]
            "
            width="680px"
        >
            <template v-if="target">
                <el-descriptions :column="2" border>
                    <el-descriptions-item label="姓名">{{ target.name }}</el-descriptions-item>
                    <el-descriptions-item label="账号">{{ target.username }}</el-descriptions-item>
                    <el-descriptions-item label="联系电话">{{ target.phone }}</el-descriptions-item>
                    <el-descriptions-item label="到岗日期">
                        {{ target.arrivalDate }}
                    </el-descriptions-item>
                    <el-descriptions-item label="专业">{{ target.major }}</el-descriptions-item>
                    <el-descriptions-item label="申请岗位">
                        {{ target.proposedPosition }}
                    </el-descriptions-item>
                    <el-descriptions-item label="最高学历">
                        {{ target.education }}
                    </el-descriptions-item>
                    <el-descriptions-item label="政治面貌">
                        {{ target.politicalStatus }}
                    </el-descriptions-item>
                    <el-descriptions-item label="拟团队">
                        {{ target.proposedTeam ?? '未填写' }}
                    </el-descriptions-item>
                    <el-descriptions-item label="社工号">
                        {{ target.socialWorkerNo ?? '未填写' }}
                    </el-descriptions-item>
                    <el-descriptions-item label="服务领域" :span="2">
                        {{
                            target.serviceFieldCodes?.join('、') ||
                            target.serviceFieldCode ||
                            '待补充'
                        }}
                    </el-descriptions-item>
                    <el-descriptions-item label="督导身份">
                        {{ target.isSupervisor ? '是' : '否' }}
                    </el-descriptions-item>
                    <el-descriptions-item v-if="target.reviewComment" label="审核意见" :span="2">
                        {{ target.reviewComment }}
                    </el-descriptions-item>
                </el-descriptions>
                <el-form
                    v-if="mode !== 'view'"
                    label-width="110px"
                    class="detail-form"
                    @submit.prevent="save"
                >
                    <template v-if="mode === 'edit'">
                        <el-form-item label="姓名" required>
                            <el-input v-model="form.name" maxlength="50" />
                        </el-form-item>
                        <el-form-item label="联系电话" required>
                            <el-input v-model="form.phone" maxlength="32" />
                        </el-form-item>
                        <el-form-item label="社工号">
                            <el-input v-model="form.socialWorkerNo" maxlength="100" />
                        </el-form-item>
                        <el-form-item label="服务领域" required>
                            <el-select v-model="form.serviceFieldCodes" multiple filterable>
                                <el-option
                                    v-for="field in fields"
                                    :key="field.code"
                                    :value="field.code"
                                    :label="field.name"
                                />
                            </el-select>
                        </el-form-item>
                    </template>
                    <template v-if="['edit', 'approve'].includes(mode)">
                        <el-form-item label="任职组织" required>
                            <el-select v-model="form.orgId">
                                <el-option
                                    v-for="org in orgs.filter((item) => item.status === 'ACTIVE')"
                                    :key="org.id"
                                    :value="org.id"
                                    :label="`${org.name}（${org.code}）`"
                                />
                            </el-select>
                        </el-form-item>
                        <el-form-item label="岗位" required>
                            <el-select v-model="form.positionCode">
                                <el-option
                                    v-for="position in positions"
                                    :key="position.code"
                                    :value="position.code"
                                    :label="position.name"
                                />
                            </el-select>
                        </el-form-item>
                        <el-form-item label="督导身份">
                            <el-checkbox
                                v-model="form.isSupervisor"
                                :disabled="!canSupervise(form.positionCode)"
                            >
                                兼任督导
                            </el-checkbox>
                        </el-form-item>
                        <el-form-item label="直接主管">
                            <el-select
                                v-model="form.supervisorId"
                                clearable
                                filterable
                                @clear="form.supervisorId = null"
                            >
                                <el-option
                                    v-for="person in directory.filter(
                                        (item) => item.id !== target?.id,
                                    )"
                                    :key="person.id"
                                    :value="person.id"
                                    :label="`${person.name}（${person.username}）`"
                                />
                            </el-select>
                        </el-form-item>
                    </template>
                    <template v-if="['approve', 'authorize'].includes(mode)">
                        <el-form-item label="角色">
                            <el-select v-model="form.roleIds" multiple>
                                <el-option
                                    v-for="role in roles.filter((item) => item.status === 'ACTIVE')"
                                    :key="role.id"
                                    :value="role.id"
                                    :label="role.name"
                                />
                            </el-select>
                        </el-form-item>
                        <el-form-item label="个人附加权限">
                            <el-select v-model="form.extraPermissions" multiple filterable>
                                <el-option
                                    v-for="permission in permissions"
                                    :key="permission.code"
                                    :value="permission.code"
                                    :label="`${permission.name}（${permission.code}）`"
                                />
                            </el-select>
                        </el-form-item>
                        <el-form-item label="数据范围">
                            <el-select v-model="form.dataScope">
                                <el-option
                                    v-for="scope in scopeOptions"
                                    :key="scope.value"
                                    :value="scope.value"
                                    :label="scope.label"
                                />
                            </el-select>
                        </el-form-item>
                        <el-form-item v-if="form.dataScope === 'SUBTREE'" label="负责组织" required>
                            <el-select v-model="form.managedOrgIds" multiple>
                                <el-option
                                    v-for="org in orgs.filter((item) => item.status === 'ACTIVE')"
                                    :key="org.id"
                                    :value="org.id"
                                    :label="org.name"
                                />
                            </el-select>
                        </el-form-item>
                    </template>
                    <el-form-item v-if="mode === 'reject'" label="驳回意见" required>
                        <el-input
                            v-model="form.comment"
                            type="textarea"
                            maxlength="1000"
                            :rows="4"
                        />
                    </el-form-item>
                </el-form>
            </template>
            <template #footer>
                <el-button @click="dialog = false">关闭</el-button>
                <el-button v-if="mode !== 'view'" type="primary" :loading="busy" @click="save">
                    {{ mode === 'approve' ? '确认批准' : mode === 'reject' ? '确认驳回' : '保存' }}
                </el-button>
            </template>
        </el-dialog>
    </el-card>
</template>
<style scoped>
.approval-hint {
    color: var(--el-text-color-secondary);
}
.detail-form {
    margin-top: 24px;
}
</style>
