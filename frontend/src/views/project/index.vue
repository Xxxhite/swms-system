<script setup lang="ts">
import { canSupervise } from '@/constants/personnel'
import { formatDateTime } from '@/utils/dateTime'
import { useTableSort } from '@/utils/tableSort'
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/message-box/style/css'
import { useMock } from '@/api/config'
import { useUserStore } from '@/stores/user'
import { projectApi } from '@/api/modules/project'
import {
    projectCategories,
    businessStatus,
    type Project,
    type ProjectInput,
    type Candidates,
} from '@/api/business-types'
import ProjectForm from './components/ProjectForm.vue'
const formRef = ref<InstanceType<typeof ProjectForm>>()
const router = useRouter(),
    store = useUserStore()
const rows = ref<Project[]>([]),
    total = ref(0),
    loading = ref(false),
    busy = ref(false),
    dialog = ref(false)
const candidates = ref<Candidates>({ organizations: [], users: [], serviceFields: [] })
const filterFields = ref<Array<{ code: string; name: string }>>([])
const filterAreas = ref<string[]>([])
const filterTeams = ref<Array<{ id: number; name: string }>>([])
const filterProjects = ref<Array<{ id: number; name: string }>>([])
const query = reactive({
    teamId: undefined as number | undefined,
    projectId: undefined as number | undefined,
    page: 1,
    pageSize: 20,
    keyword: '',
    category: '',
    status: '',
    serviceFieldCode: '',
    serviceArea: '',
    dateFrom: '',
    dateTo: '',
})
const form = ref<ProjectInput>({
    code: '',
    name: '',
    category: 'CONTRACT_PACKAGE',
    ownerOrgId: 0,
    directorId: 0,
    seniorDirectorId: 0,
    supervisorId: null,
    subFieldCodes: [],
    brandCodes: [],
    serviceFieldCode: '',
})
const { setTableRef, defaultSort, onSortChange, resetSort } = useTableSort(
    query,
    'createdAt',
    'descending',
    load,
)
let generation = 0
/** 按当前筛选读取项目，过时响应不覆盖后续查询。 */
async function load() {
    if (useMock) return
    const request = ++generation
    loading.value = true
    try {
        const result = await projectApi.list(query)
        if (request === generation) {
            rows.value = result.list
            total.value = result.total
        }
    } catch {
        /* 请求层提示 */
    } finally {
        if (request === generation) loading.value = false
    }
}
/** 查询和重置统一回到第一页，重置后立即展示全部可见项目。 */
function search() {
    query.page = 1
    void load()
}
function reset() {
    resetSort()
    Object.assign(query, {
        teamId: undefined,
        projectId: undefined,
        keyword: '',
        category: '',
        status: '',
        serviceFieldCode: '',
        serviceArea: '',
        dateFrom: '',
        dateTo: '',
    })
    search()
}
/** 只有登记人员打开表单时加载业务候选，不要求系统管理权限。 */
async function create() {
    try {
        candidates.value = await projectApi.candidates()
        const managers = candidates.value.users.filter((user) =>
            canSupervise(user.positionCode ?? null),
        )
        const manager = managers.find((user) => user.id === store.profile?.id) ?? managers[0]
        form.value = {
            code: '',
            name: '',
            category: 'CONTRACT_PACKAGE',
            ownerOrgId: candidates.value.organizations[0]?.id ?? 0,
            directorId: manager?.id ?? 0,
            seniorDirectorId: manager?.id ?? 0,
            supervisorId: null,
            subFieldCodes: [],
            brandCodes: [],
            serviceFieldCode: '',
        }
        dialog.value = true
    } catch {
        /* 请求层提示 */
    }
}
/** 保存后直接进入项目详情，继续补齐合同、团队和指标。 */
async function save() {
    if (busy.value) return
    busy.value = true
    try {
        if (!(await formRef.value?.validate())) return
        const result = await projectApi.create(form.value)
        dialog.value = false
        ElMessage.success('项目草稿已登记')
        await router.push(`/service/contract-package-projects/${result.id}`)
    } catch {
        /* 请求层提示 */
    } finally {
        busy.value = false
    }
}
/** 删除仅提交当前版本，历史引用限制由服务端检查。 */
async function remove(row: Project) {
    try {
        await ElMessageBox.confirm(`删除草稿项目“${row.name}”？`, '删除项目', { type: 'warning' })
        await projectApi.remove(row)
        await load()
    } catch {
        /* 取消或请求层提示 */
    }
}
onMounted(async () => {
    await load()
    if (!useMock) {
        try {
            const options = await projectApi.filterOptions()
            filterFields.value = options.serviceFields
            filterAreas.value = options.serviceAreas ?? []
            filterTeams.value = options.organizations
            filterProjects.value = options.projects ?? []
        } catch {
            /* 请求层提示 */
        }
    }
})
</script>
<template>
    <el-card>
        <template #header>
            <div class="page-header">
                <span>合同包项目管理</span>
                <div v-if="!useMock" class="page-actions">
                    <el-button
                        v-if="
                            (store.profile?.isDevSuperadmin ||
                                canSupervise(store.profile?.positionCode ?? null)) &&
                            store.hasPermission('project:record:create')
                        "
                        type="primary"
                        @click="create"
                    >
                        新增项目
                    </el-button>
                    <el-button @click="load">刷新</el-button>
                </div>
            </div>
        </template>
        <el-alert
            v-if="useMock"
            title="项目业务请切换真实接口模式使用。"
            type="info"
            :closable="false"
        />
        <template v-else>
            <el-form class="filter-form" @submit.prevent="search">
                <el-form-item label="项目名称／编码">
                    <el-input v-model="query.keyword" clearable />
                </el-form-item>
                <el-form-item label="分类">
                    <el-select v-model="query.category" clearable>
                        <el-option
                            v-for="(label, value) in projectCategories"
                            :key="value"
                            :value="value"
                            :label="label"
                        />
                    </el-select>
                </el-form-item>
                <el-form-item label="状态">
                    <el-select v-model="query.status" clearable>
                        <el-option label="草稿" value="DRAFT" />
                        <el-option label="已启用" value="ACTIVE" />
                    </el-select>
                </el-form-item>
                <el-form-item label="服务领域">
                    <el-select v-model="query.serviceFieldCode" clearable filterable>
                        <el-option
                            v-for="f in filterFields"
                            :key="f.code"
                            :value="f.code"
                            :label="f.name"
                        />
                    </el-select>
                </el-form-item>
                <el-form-item label="区域">
                    <el-select v-model="query.serviceArea" clearable filterable>
                        <el-option
                            v-for="area in filterAreas"
                            :key="area"
                            :value="area"
                            :label="area"
                        />
                    </el-select>
                </el-form-item>
                <el-form-item label="合同区间起">
                    <el-date-picker v-model="query.dateFrom" value-format="YYYY-MM-DD" />
                </el-form-item>
                <el-form-item label="合同区间止">
                    <el-date-picker v-model="query.dateTo" value-format="YYYY-MM-DD" />
                </el-form-item>
                <el-form-item label="团队">
                    <el-select v-model="query.teamId" clearable filterable>
                        <el-option
                            v-for="t in filterTeams"
                            :key="t.id"
                            :label="t.name"
                            :value="t.id"
                        />
                    </el-select>
                </el-form-item>
                <el-form-item class="filter-form__actions">
                    <el-button type="primary" native-type="submit">查询</el-button>
                    <el-button @click="reset">重置</el-button>
                </el-form-item>
            </el-form>
            <el-table
                :ref="setTableRef"
                v-loading="loading"
                :data="rows"
                :default-sort="defaultSort"
                @sort-change="onSortChange"
            >
                <!-- @vue-generic {Project} -->
                <el-table-column
                    prop="code"
                    sortable="custom"
                    label="编码"
                    min-width="140"
                    show-overflow-tooltip
                />
                <!-- @vue-generic {Project} -->
                <el-table-column
                    prop="name"
                    sortable="custom"
                    label="项目名称"
                    min-width="200"
                    show-overflow-tooltip
                />
                <!-- @vue-generic {Project} -->
                <el-table-column label="分类" width="110">
                    <template #default="{ row }">{{ projectCategories[row.category] }}</template>
                </el-table-column>
                <!-- @vue-generic {Project} -->
                <el-table-column prop="startDate" label="合同开始" width="130" sortable="custom">
                    <template #default="{ row }">
                        {{ row.contract?.startDate ?? '待补齐' }}
                    </template>
                </el-table-column>
                <!-- @vue-generic {Project} -->
                <el-table-column prop="endDate" label="合同结束" width="130" sortable="custom">
                    <template #default="{ row }">{{ row.contract?.endDate ?? '待补齐' }}</template>
                </el-table-column>
                <!-- @vue-generic {Project} -->
                <el-table-column label="状态" width="100">
                    <template #default="{ row }">{{ businessStatus[row.status] }}</template>
                </el-table-column>
                <!-- @vue-generic {Project} -->
                <el-table-column
                    prop="createdAt"
                    label="创建时间"
                    min-width="180"
                    sortable="custom"
                >
                    <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
                </el-table-column>
                <!-- @vue-generic {Project} -->
                <el-table-column label="操作" width="160" fixed="right">
                    <template #default="{ row }">
                        <el-button
                            link
                            type="primary"
                            @click="router.push(`/service/contract-package-projects/${row.id}`)"
                        >
                            查看配置
                        </el-button>
                        <el-button
                            v-if="
                                row.canManage &&
                                row.status === 'DRAFT' &&
                                store.hasPermission('project:record:delete')
                            "
                            link
                            type="danger"
                            @click="remove(row)"
                        >
                            删除
                        </el-button>
                    </template>
                </el-table-column>
            </el-table>
            <el-pagination
                v-model:current-page="query.page"
                class="table-pagination"
                :total="total"
                v-model:page-size="query.pageSize"
                :page-sizes="[10, 20, 50, 100]"
                layout="total, sizes, prev, pager, next"
                @size-change="search"
                @current-change="load"
            />
        </template>
        <el-dialog v-model="dialog" title="登记项目" destroy-on-close width="660px">
            <project-form ref="formRef" v-model="form" :candidates="candidates" />
            <template #footer>
                <el-button @click="dialog = false">取消</el-button>
                <el-button type="primary" :loading="busy" @click="save">保存草稿</el-button>
            </template>
        </el-dialog>
    </el-card>
</template>
