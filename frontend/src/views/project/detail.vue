<script setup lang="ts">
import { useTableSort, sortTableRows, type SortQuery } from '@/utils/tableSort'
import { formatDateTime } from '@/utils/dateTime'
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import {
    fieldRule,
    textIssue,
    decimalIssue,
    dateIssue,
    validateForm,
} from '@/utils/businessValidation'
import 'element-plus/es/components/message/style/css'
import { useUserStore } from '@/stores/user'
import { projectApi } from '@/api/modules/project'
import {
    businessStatus,
    projectCategories,
    type Project,
    type ProjectInput,
    type ContractInput,
    type Candidates,
    type Indicator,
} from '@/api/business-types'
import ProjectForm from './components/ProjectForm.vue'
defineOptions({ name: 'ProjectDetail' })
const route = useRoute(),
    router = useRouter(),
    store = useUserStore()
const contractInput = ref<HTMLInputElement>()
const files = ref<import('@/api/business-types').ContractFile[]>([])
const project = ref<Project>(),
    busy = ref(false),
    candidates = ref<Candidates>({ organizations: [], users: [], serviceFields: [] })
const base = ref<ProjectInput>({
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
const contract = reactive<ContractInput>({
    contractNo: '',
    partnerName: '',
    startDate: '',
    endDate: '',
    amount: '0.00',
    serviceArea: '',
    note: '',
})
const members = ref<Project['members']>([])
const teams = ref<Array<{ teamId?: number; reporterId?: number }>>([]),
    points = ref<Project['servicePoints']>([])
const indicatorPage = ref(1),
    indicatorPageSize = ref(20)
const sortQuery = reactive<SortQuery>({})
const { setTableRef, defaultSort, onSortChange } = useTableSort(
    sortQuery,
    'createdAt',
    'descending',
    () => {
        indicatorPage.value = 1
    },
)
const indicatorRows = computed(() =>
    sortTableRows(
        project.value?.indicators ?? [],
        sortQuery,
        [
            ['createdAt', 'desc'],
            ['id', 'desc'],
        ],
        ['targetValue'],
    ),
)
const canManage = computed(() => project.value?.canManage ?? false)
const has = (permission: string) => canManage.value && store.hasPermission(permission)
const indicatorDialog = ref(false),
    allocationDialog = ref(false),
    selected = ref<Indicator>()
const indicator = reactive({ name: '', unit: '人次', definition: '', targetValue: '0.00' })
const allocations = ref<
    Array<{ teamId: number; teamName: string; targetValue: string; selected: boolean }>
>([])
const targetPlan = reactive({ targetValue: '0.00', reason: '' })
const baseRef = ref<InstanceType<typeof ProjectForm>>()
const contractRef = ref<FormInstance>(),
    indicatorRef = ref<FormInstance>(),
    allocationRef = ref<FormInstance>()
const allocationModel = computed(() => ({ ...targetPlan, allocations: allocations.value }))
const contractRules: FormRules = {
    partnerName: [fieldRule((value) => textIssue(value, '合作方', 150))],
    startDate: [fieldRule((value) => dateIssue(value, '开始日期'))],
    endDate: [
        fieldRule(
            (value) =>
                dateIssue(value, '结束日期') ||
                (!dateIssue(contract.startDate, '开始日期') && String(value) < contract.startDate
                    ? '结束日期不得早于开始日期'
                    : undefined),
        ),
    ],
    amount: [fieldRule((value) => decimalIssue(value, '合同金额', false, 12))],
    serviceArea: [fieldRule((value) => textIssue(value, '服务区域', 100))],
}
const indicatorRules: FormRules = {
    name: [fieldRule((value) => textIssue(value, '指标名称', 150))],
    unit: [fieldRule((value) => textIssue(value, '单位', 20))],
    definition: [fieldRule((value) => textIssue(value, '统计口径', 5000))],
    targetValue: [fieldRule((value) => decimalIssue(value, '合同目标', true))],
}
const allocationRules: FormRules = {
    targetValue: [fieldRule((value) => decimalIssue(value, '合同目标', true))],
    reason: [
        fieldRule((value) =>
            selected.value?.status === 'ACTIVE' ? textIssue(value, '调整原因', 1000) : undefined,
        ),
    ],
}
/** 刷新后统一回填版本和编辑副本，避免直接改动表格中的已保存对象。 */
async function load() {
    try {
        const p = await projectApi.detail(Number(route.params.id))
        project.value = p
        files.value = await projectApi.files(p.id)
        base.value = {
            code: p.code,
            name: p.name,
            category: p.category,
            ownerOrgId: p.ownerOrgId,
            directorId: p.directorId,
            seniorDirectorId: p.seniorDirectorId,
            supervisorId: p.supervisorId,
            subFieldCodes: p.subFieldCodes ?? [],
            brandCodes: p.brandCodes ?? [],
            serviceFieldCode: p.serviceFieldCode,
        }
        if (p.contract)
            Object.assign(contract, {
                contractNo: p.contract.contractNo ?? '',
                partnerName: p.contract.partnerName,
                startDate: p.contract.startDate,
                endDate: p.contract.endDate,
                amount: p.contract.amount,
                serviceArea: p.contract.serviceArea,
                note: p.contract.note ?? '',
            })
        members.value = p.members.map((m) => ({ ...m }))
        teams.value = p.teams.map((t) => ({ teamId: t.teamId, reporterId: t.reporterId }))
        points.value = p.servicePoints.map((p) => ({ ...p }))
        if (canManage.value && store.hasPermission('project:record:update'))
            candidates.value = await projectApi.candidates(p.id)
    } catch {
        /* 请求层提示 */
    }
}
/** 阻止重复写入，成功后重读全部版本并给出统一反馈。 */
async function operate(work: () => Promise<unknown>, validate?: () => Promise<boolean>) {
    if (busy.value) return
    busy.value = true
    try {
        if (validate && !(await validate())) return
        await work()
        indicatorDialog.value = false
        allocationDialog.value = false
        await load()
        ElMessage.success('已保存')
    } catch {
        /* 请求层提示 */
    } finally {
        busy.value = false
    }
}
/** 打开指标资料副本；修改目标的完整分配在独立操作中提交。 */
function editIndicator(row?: Indicator) {
    selected.value = row
    Object.assign(
        indicator,
        row
            ? {
                  name: row.name,
                  unit: row.unit,
                  definition: row.definition,
                  targetValue: row.targetValue ?? '0.00',
              }
            : { name: '', unit: '人次', definition: '', targetValue: '0.00' },
    )
    indicatorDialog.value = true
}
/** 分配表可选择实际承担指标的部分团队，完整方案在一次请求中保存。 */
function editAllocations(row: Indicator) {
    selected.value = row
    targetPlan.targetValue = row.targetValue ?? '0.00'
    targetPlan.reason = ''
    allocations.value = project.value!.teams.map((t) => ({
        teamId: t.teamId,
        teamName: t.teamName,
        targetValue: row.allocations.find((a) => a.teamId === t.teamId)?.targetValue ?? '0.00',
        selected: row.allocations.some((a) => a.teamId === t.teamId),
    }))
    allocationDialog.value = true
}
/** 提交整个分配方案；已启用指标同时传入最新合同目标和调整原因。 */
function saveAllocations() {
    const row = selected.value!
    void operate(
        () =>
            projectApi.allocations(
                project.value!.id,
                row,
                allocations.value
                    .filter((a) => a.selected)
                    .map((a) => ({ teamId: a.teamId, targetValue: a.targetValue })),
                targetPlan.targetValue,
                targetPlan.reason,
            ),
        () => validateForm(allocationRef.value),
    )
}
/** 各表单只提交对应资源，所有写入共用忙碌状态及版本刷新。 */
function activateProject() {
    void operate(() => projectApi.activate(project.value!))
}
function saveBase() {
    void operate(
        () => projectApi.update(project.value!.id, base.value, project.value!.version),
        async () => (await baseRef.value?.validate()) ?? false,
    )
}
function saveContract() {
    void operate(
        () => projectApi.contract(project.value!, contract),
        () => validateForm(contractRef.value),
    )
}
function saveTeams() {
    const selectedTeams: Array<{ teamId: number; reporterId: number }> = []
    for (const [index, team] of teams.value.entries()) {
        if (!team.teamId || !team.reporterId) {
            ElMessage.warning(`请完整选择第 ${index + 1} 行的服务团队和填报负责人`)
            return
        }
        selectedTeams.push({ teamId: team.teamId, reporterId: team.reporterId })
    }
    void operate(() => projectApi.teams(project.value!, selectedTeams))
}
function savePoints() {
    void operate(() => projectApi.points(project.value!, points.value))
}
function saveIndicator() {
    void operate(
        () => projectApi.indicator(project.value!.id, indicator, selected.value),
        () => validateForm(indicatorRef.value),
    )
}
function activateIndicator(row: Indicator) {
    void operate(() => projectApi.activateIndicator(project.value!.id, row))
}
function removeIndicator(row: Indicator) {
    void operate(() => projectApi.removeIndicator(project.value!.id, row))
}
/** 多个电子合同逐项上传并刷新结果，已成功文件在后续文件失败时保留。 */
async function uploadContract(event: Event) {
    const input = event.target as HTMLInputElement
    if (!project.value || busy.value) return
    busy.value = true
    try {
        for (const file of Array.from(input.files ?? []))
            await projectApi.upload(project.value.id, file)
        ElMessage.success('合同附件已上传')
    } catch {
        /* 请求层提示 */
    } finally {
        busy.value = false
        input.value = ''
        try {
            files.value = await projectApi.files(project.value.id)
        } catch {
            /* 请求层提示 */
        }
    }
}
/** 下载经过鉴权的合同文件，浏览器仅接收文件数据。 */
async function downloadContract(file: import('@/api/business-types').ContractFile) {
    try {
        const blob = await projectApi.downloadFile(file.id)
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = file.name
        a.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
        /* 请求层提示 */
    }
}
/** 保存项目成员使用当前项目版本。 */
function saveMembers() {
    void operate(() => projectApi.members(project.value!, members.value))
}
/** 移除附件关联后刷新合同列表。 */
function removeContract(id: number) {
    void operate(() => projectApi.removeFile(id))
}
onMounted(load)
</script>
<template>
    <el-card v-if="project">
        <template #header>
            <div class="page-header">
                <span>{{ project.name }}</span>
                <div class="page-actions">
                    <el-button @click="router.push('/service/contract-package-projects')">
                        返回项目
                    </el-button>
                    <el-button @click="load">刷新</el-button>
                    <el-button
                        v-if="project.status === 'DRAFT' && has('project:record:update')"
                        type="primary"
                        :loading="busy"
                        @click="activateProject()"
                    >
                        启用项目
                    </el-button>
                </div>
            </div>
        </template>
        <el-alert
            :title="`项目${businessStatus[project.status]}；${project.statisticsScope === 'PROJECT' ? '可查看完整项目配置和统计' : '仅查看授权团队，其他团队和合同目标不展示'}`"
            :type="project.statisticsScope === 'PROJECT' ? 'info' : 'warning'"
            :closable="false"
            class="notice"
        />
        <el-tabs>
            <el-tab-pane label="基础信息">
                <template v-if="has('project:record:update')">
                    <project-form ref="baseRef" v-model="base" :candidates="candidates" />
                    <el-button type="primary" :loading="busy" @click="saveBase()">
                        保存基础信息
                    </el-button>
                </template>
                <el-descriptions v-else :column="2" border>
                    <el-descriptions-item label="项目名称">{{ project.name }}</el-descriptions-item>
                    <el-descriptions-item label="项目分类">
                        {{ projectCategories[project.category] }}
                    </el-descriptions-item>
                    <el-descriptions-item label="归属组织">
                        {{ project.ownerOrgName ?? '未设置' }}
                    </el-descriptions-item>
                    <el-descriptions-item label="项目总监">
                        {{ project.directorName ?? '未设置' }}
                    </el-descriptions-item>
                    <el-descriptions-item label="高级主任">
                        {{ project.seniorDirectorName ?? '未设置' }}
                    </el-descriptions-item>
                    <el-descriptions-item label="督导">
                        {{ project.supervisorName ?? '未设置' }}
                    </el-descriptions-item>
                    <el-descriptions-item label="细分领域">
                        {{ project.subFieldCodes?.join('、') || '未填写' }}
                    </el-descriptions-item>
                    <el-descriptions-item label="品牌归属">
                        {{ project.brandCodes?.join('、') || '未填写' }}
                    </el-descriptions-item>
                    <el-descriptions-item label="项目编码">{{ project.code }}</el-descriptions-item>
                    <el-descriptions-item label="主服务领域">
                        {{ project.serviceFieldCode }}
                    </el-descriptions-item>
                </el-descriptions>
            </el-tab-pane>
            <el-tab-pane label="合同资料">
                <el-form
                    ref="contractRef"
                    class="business-form"
                    :model="contract"
                    :rules="contractRules"
                    label-width="110px"
                    :disabled="!has('project:record:update')"
                    scroll-to-error
                >
                    <el-form-item label="合同编号">
                        <el-input v-model="contract.contractNo" maxlength="100" />
                    </el-form-item>
                    <el-form-item label="合作方" prop="partnerName" required>
                        <el-input v-model="contract.partnerName" maxlength="150" />
                    </el-form-item>
                    <el-form-item label="开始日期" prop="startDate" required>
                        <el-date-picker
                            v-model="contract.startDate"
                            value-format="YYYY-MM-DD"
                            @change="contractRef?.validateField('endDate').catch(() => {})"
                        />
                    </el-form-item>
                    <el-form-item label="结束日期" prop="endDate" required>
                        <el-date-picker v-model="contract.endDate" value-format="YYYY-MM-DD" />
                    </el-form-item>
                    <el-form-item
                        v-if="project.statisticsScope === 'PROJECT'"
                        label="合同金额"
                        prop="amount"
                        required
                    >
                        <el-input v-model="contract.amount" placeholder="如 10000.00" />
                    </el-form-item>
                    <el-form-item label="服务区域" prop="serviceArea" required>
                        <el-input v-model="contract.serviceArea" maxlength="100" />
                    </el-form-item>
                    <el-form-item label="说明">
                        <el-input v-model="contract.note" type="textarea" maxlength="5000" />
                    </el-form-item>
                    <el-form-item v-if="has('project:record:update')" class="form-actions">
                        <el-button type="primary" :loading="busy" @click="saveContract()">
                            保存合同
                        </el-button>
                    </el-form-item>
                </el-form>
                <div class="notice">
                    <p>电子合同附件</p>
                    <el-button
                        v-if="has('project:record:update')"
                        type="primary"
                        :loading="busy"
                        :disabled="!project.contract"
                        @click="contractInput?.click()"
                    >
                        上传合同附件
                    </el-button>
                    <input
                        ref="contractInput"
                        hidden
                        v-if="has('project:record:update')"
                        type="file"
                        multiple
                        accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                        :disabled="busy || !project.contract"
                        @change="uploadContract"
                    />
                    <p>支持 PDF、图片、Word，每个文件最多 20MB。</p>
                    <div v-for="file in files" :key="file.id" class="page-actions">
                        <el-button link type="primary" @click="downloadContract(file)">
                            {{ file.name }}
                        </el-button>
                        <span>{{ (file.size / 1024).toFixed(1) }} KB</span>
                        <el-button
                            v-if="has('project:record:update')"
                            link
                            type="danger"
                            :disabled="busy"
                            @click="removeContract(file.id)"
                        >
                            移除
                        </el-button>
                    </div>
                </div>
            </el-tab-pane>
            <el-tab-pane label="服务团队">
                <p>每个团队指定一名填报负责人；出现指标目标后，团队关系须保留。</p>
                <div
                    v-for="(team, index) in teams"
                    v-show="has('project:record:update')"
                    :key="index"
                    class="edit-row"
                >
                    <el-select
                        v-model="team.teamId"
                        :disabled="!has('project:record:update')"
                        placeholder="服务团队"
                        @change="team.reporterId = undefined"
                    >
                        <el-option
                            v-for="o in candidates.organizations.filter((o) => o.type === 'TEAM')"
                            :key="o.id"
                            :label="o.name"
                            :value="o.id"
                        />
                    </el-select>
                    <el-select
                        v-model="team.reporterId"
                        :disabled="!has('project:record:update') || !team.teamId"
                        placeholder="填报负责人"
                        filterable
                    >
                        <el-option
                            v-for="u in candidates.users.filter((u) => u.teamId === team.teamId)"
                            :key="u.id"
                            :label="u.name"
                            :value="u.id"
                        />
                    </el-select>
                    <el-button
                        v-if="has('project:record:update')"
                        type="danger"
                        plain
                        @click="teams.splice(index, 1)"
                    >
                        移除
                    </el-button>
                </div>
                <div v-if="has('project:record:update')" class="page-actions">
                    <el-button @click="teams.push({})">添加团队</el-button>
                    <el-button type="primary" :loading="busy" @click="saveTeams()">
                        保存团队
                    </el-button>
                </div>
                <template v-else>
                    <p v-for="team in project.teams" :key="team.teamId">
                        {{ team.teamName }}：{{ team.reporterName }}
                    </p>
                </template>
            </el-tab-pane>
            <el-tab-pane label="项目成员">
                <p>成员有效期间位于合同周期内；团队主任及以下同一时间只分配一个合同包项目。</p>
                <div v-for="(member, index) in members" :key="index" class="edit-row">
                    <el-select
                        v-if="has('project:record:update')"
                        :model-value="member.userId || undefined"
                        @update:model-value="member.userId = $event ?? 0"
                        filterable
                        @change="
                            member.teamId =
                                candidates.users.find((u) => u.id === member.userId)?.teamId ?? 0
                        "
                    >
                        <el-option
                            v-for="u in candidates.users.filter((u) =>
                                project?.teams.some((t) => t.teamId === u.teamId),
                            )"
                            :key="u.id"
                            :value="u.id"
                            :label="u.name"
                        />
                    </el-select>
                    <span v-else>{{ member.name }}</span>
                    <el-date-picker
                        v-model="member.startDate"
                        value-format="YYYY-MM-DD"
                        :disabled="!has('project:record:update')"
                        placeholder="开始日期"
                    />
                    <el-date-picker
                        v-model="member.endDate"
                        value-format="YYYY-MM-DD"
                        :disabled="!has('project:record:update')"
                        placeholder="结束日期"
                    />
                    <el-button
                        v-if="has('project:record:update')"
                        @click="members.splice(index, 1)"
                    >
                        移除
                    </el-button>
                </div>
                <div v-if="has('project:record:update')" class="page-actions">
                    <el-button
                        :disabled="!project.contract"
                        @click="
                            members.push({
                                userId: 0,
                                teamId: 0,
                                startDate: project.contract?.startDate ?? '',
                                endDate: project.contract?.endDate ?? '',
                            })
                        "
                    >
                        添加成员
                    </el-button>
                    <el-button type="primary" :loading="busy" @click="saveMembers">
                        保存成员
                    </el-button>
                </div>
            </el-tab-pane>
            <el-tab-pane label="服务点">
                <div v-for="(point, index) in points" :key="index" class="edit-row">
                    <el-input
                        v-model="point.name"
                        :disabled="!has('project:record:update')"
                        placeholder="服务点名称"
                        maxlength="100"
                    />
                    <el-input
                        v-model="point.address"
                        :disabled="!has('project:record:update')"
                        placeholder="地址"
                        maxlength="255"
                    />
                    <el-input
                        v-model="point.note"
                        :disabled="!has('project:record:update')"
                        placeholder="说明"
                        maxlength="1000"
                    />
                    <el-button v-if="has('project:record:update')" @click="points.splice(index, 1)">
                        移除
                    </el-button>
                </div>
                <div v-if="has('project:record:update')" class="page-actions">
                    <el-button @click="points.push({ name: '', address: '', note: '' })">
                        添加服务点
                    </el-button>
                    <el-button type="primary" :loading="busy" @click="savePoints()">
                        保存服务点
                    </el-button>
                </div>
            </el-tab-pane>
            <el-tab-pane label="指标及目标">
                <el-button
                    v-if="has('service:indicator:manage')"
                    type="primary"
                    class="notice"
                    @click="editIndicator()"
                >
                    新增指标
                </el-button>
                <el-table
                    :ref="setTableRef"
                    :data="
                        indicatorRows.slice(
                            (indicatorPage - 1) * indicatorPageSize,
                            indicatorPage * indicatorPageSize,
                        )
                    "
                    :default-sort="defaultSort"
                    @sort-change="onSortChange"
                >
                    <!-- @vue-generic {Indicator} -->
                    <el-table-column prop="name" sortable="custom" label="指标" min-width="160" />
                    <!-- @vue-generic {Indicator} -->
                    <el-table-column prop="unit" sortable="custom" label="单位" width="80" />
                    <!-- @vue-generic {Indicator} -->
                    <el-table-column
                        prop="definition"
                        label="统计口径"
                        min-width="180"
                        show-overflow-tooltip
                    />
                    <!-- @vue-generic {Indicator} -->
                    <el-table-column
                        v-if="project.statisticsScope === 'PROJECT'"
                        prop="targetValue"
                        sortable="custom"
                        label="合同目标"
                        width="110"
                    />
                    <!-- @vue-generic {Indicator} -->
                    <el-table-column label="状态" width="90">
                        <template #default="{ row }">{{ businessStatus[row.status] }}</template>
                    </el-table-column>
                    <!-- @vue-generic {Indicator} -->
                    <el-table-column
                        prop="createdAt"
                        label="创建时间"
                        min-width="180"
                        sortable="custom"
                    >
                        <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
                    </el-table-column>
                    <!-- @vue-generic {Indicator} -->
                    <el-table-column label="操作" min-width="280" fixed="right">
                        <template #default="{ row }">
                            <el-button
                                v-if="has('service:indicator:manage')"
                                link
                                type="primary"
                                @click="editIndicator(row)"
                            >
                                编辑
                            </el-button>
                            <el-button
                                v-if="has('service:indicator:allocate')"
                                link
                                type="primary"
                                @click="editAllocations(row)"
                            >
                                {{ row.status === 'ACTIVE' ? '调整目标' : '分配目标' }}
                            </el-button>
                            <el-button
                                v-if="row.status === 'DRAFT' && has('service:indicator:manage')"
                                link
                                type="primary"
                                @click="activateIndicator(row)"
                            >
                                启用
                            </el-button>
                            <el-button
                                v-if="row.status === 'DRAFT' && has('service:indicator:manage')"
                                link
                                type="danger"
                                @click="removeIndicator(row)"
                            >
                                删除
                            </el-button>
                        </template>
                    </el-table-column>
                </el-table>
                <el-pagination
                    v-model:current-page="indicatorPage"
                    v-model:page-size="indicatorPageSize"
                    :page-sizes="[10, 20, 50, 100]"
                    :total="indicatorRows.length"
                    layout="total, sizes, prev, pager, next"
                    class="table-pagination"
                    @size-change="indicatorPage = 1"
                />
                <p v-for="i in project.indicators" :key="i.id">
                    {{ i.name }}：
                    <span v-for="a in i.allocations" :key="a.teamId">
                        {{ project.teams.find((t) => t.teamId === a.teamId)?.teamName }}
                        {{ a.targetValue }}{{ i.unit }}；
                    </span>
                </p>
            </el-tab-pane>
        </el-tabs>
        <el-dialog
            v-model="indicatorDialog"
            :title="selected ? '编辑指标' : '新增指标'"
            width="580px"
            destroy-on-close
        >
            <el-form
                ref="indicatorRef"
                class="business-form"
                :model="indicator"
                :rules="indicatorRules"
                label-width="100px"
                scroll-to-error
            >
                <el-form-item label="名称" prop="name" required>
                    <el-input v-model="indicator.name" maxlength="150" />
                </el-form-item>
                <el-form-item label="单位" prop="unit" required>
                    <el-input v-model="indicator.unit" maxlength="20" />
                </el-form-item>
                <el-form-item label="统计口径" prop="definition" required>
                    <el-input v-model="indicator.definition" type="textarea" maxlength="5000" />
                </el-form-item>
                <el-form-item label="合同目标" prop="targetValue" required>
                    <el-input
                        v-model="indicator.targetValue"
                        :disabled="selected?.status === 'ACTIVE'"
                    />
                </el-form-item>
            </el-form>
            <template #footer>
                <el-button @click="indicatorDialog = false">取消</el-button>
                <el-button type="primary" :loading="busy" @click="saveIndicator()">保存</el-button>
            </template>
        </el-dialog>
        <el-dialog v-model="allocationDialog" destroy-on-close title="团队目标方案" width="620px">
            <el-alert
                title="启用时团队目标总和须等于合同目标；已有月报的团队不可取消分配。"
                type="info"
                :closable="false"
                class="notice"
            />
            <el-form
                ref="allocationRef"
                class="business-form"
                :model="allocationModel"
                :rules="allocationRules"
                label-width="100px"
                scroll-to-error
            >
                <el-form-item label="合同目标" prop="targetValue" required>
                    <el-input
                        v-model="targetPlan.targetValue"
                        :disabled="selected?.status !== 'ACTIVE'"
                    />
                </el-form-item>
                <el-form-item
                    v-if="selected?.status === 'ACTIVE'"
                    label="调整原因"
                    prop="reason"
                    required
                >
                    <el-input v-model="targetPlan.reason" type="textarea" maxlength="1000" />
                </el-form-item>
                <el-form-item
                    v-for="(a, index) in allocations"
                    :key="a.teamId"
                    :prop="`allocations.${index}.targetValue`"
                    :rules="[
                        fieldRule((value) =>
                            a.selected ? decimalIssue(value, '团队目标', true) : undefined,
                        ),
                    ]"
                >
                    <el-checkbox
                        v-model="a.selected"
                        @change="allocationRef?.clearValidate(`allocations.${index}.targetValue`)"
                    >
                        {{ a.teamName }}
                    </el-checkbox>
                    <el-input
                        v-model="a.targetValue"
                        :disabled="!a.selected"
                        placeholder="团队目标"
                    />
                </el-form-item>
            </el-form>
            <template #footer>
                <el-button @click="allocationDialog = false">取消</el-button>
                <el-button type="primary" :loading="busy" @click="saveAllocations">
                    保存完整方案
                </el-button>
            </template>
        </el-dialog>
    </el-card>
</template>
<style scoped>
.notice {
    margin-bottom: 20px;
}
.edit-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
}
.edit-row > * {
    min-width: 0;
    flex: 1;
}
.edit-row > .el-button {
    flex: none;
}
.el-form {
    max-width: 760px;
}
p {
    color: var(--el-text-color-regular);
}
</style>
