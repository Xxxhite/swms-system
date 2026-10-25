<script setup lang="ts">
import { useTableSort } from '@/utils/tableSort'
import { projectApi } from '@/api/modules/project'
import { computed, onMounted, reactive, ref } from 'vue'
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
import { useMock } from '@/api/config'
import { serviceApi } from '@/api/modules/service'
import { businessStatus, type Monthly, type MonthlyInput } from '@/api/business-types'
import { formatDateTime } from '@/utils/dateTime'
const store = useUserStore(),
    rows = ref<Monthly[]>([]),
    total = ref(0),
    loading = ref(false),
    busy = ref(false),
    dialog = ref(false),
    changeDialog = ref(false),
    historyDialog = ref(false)
const selected = ref<Monthly>(),
    history = ref<Monthly>(),
    context = ref<Awaited<ReturnType<typeof serviceApi.context>>>({
        fixedProject: true,
        projects: [],
        slots: [],
    }),
    selectedProjectId = ref(0)
const form = reactive<MonthlyInput>({
    indicatorId: 0,
    teamId: 0,
    serviceDate: formatDateTime(new Date()).slice(0, 10),
    requestKey: crypto.randomUUID(),
    actualValue: '0.00',
    note: '',
})
const selectedIndicatorId = computed({
    get: () => form.indicatorId || undefined,
    set: (value: number | undefined) => {
        form.indicatorId = value ?? 0
    },
})
const change = reactive({ operation: 'CORRECT', actualValue: '0.00', note: '', reason: '' })
const formRef = ref<FormInstance>(),
    changeRef = ref<FormInstance>()
const formRules: FormRules = {
    indicatorId: [
        fieldRule(() => (form.indicatorId > 0 && form.teamId > 0 ? undefined : '请选择指标及团队')),
    ],
    serviceDate: [fieldRule((value) => dateIssue(value, '服务日期'))],
    actualValue: [fieldRule((value) => decimalIssue(value, '本次完成量'))],
}
const changeRules: FormRules = {
    actualValue: [
        fieldRule((value) =>
            change.operation === 'CORRECT' ? decimalIssue(value, '更正后新增') : undefined,
        ),
    ],
    reason: [fieldRule((value) => textIssue(value, '变更原因', 1000))],
}
const filterTeams = ref<Array<{ id: number; name: string }>>([])
const filterProjects = ref<Array<{ id: number; name: string }>>([])
const query = reactive({
    teamId: undefined as number | undefined,
    projectId: undefined as number | undefined,
    page: 1,
    pageSize: 20,
    keyword: '',
    month: '',
    status: '',
})
const teamOptions = computed(() => [
    ...new Map(
        context.value.slots
            .filter((s) => s.projectId === selectedProjectId.value)
            .map((s) => [s.teamId, { id: s.teamId, name: s.teamName }]),
    ).values(),
])
const indicatorOptions = computed(() =>
    context.value.slots.filter(
        (s) => s.projectId === selectedProjectId.value && s.teamId === form.teamId,
    ),
)
/** 项目改变后清除过期团队及指标选择。 */
function chooseProject() {
    form.teamId = teamOptions.value.length === 1 ? teamOptions.value[0]!.id : 0
    form.indicatorId = 0
}
function chooseTeam() {
    form.indicatorId = 0
}
const { setTableRef, defaultSort, onSortChange, resetSort } = useTableSort(
    query,
    'serviceDate',
    'descending',
    load,
)
let generation = 0
/** 列表按当前范围读取，并忽略旧筛选的迟到响应。 */
async function load() {
    if (useMock) return
    const request = ++generation
    loading.value = true
    try {
        const result = await serviceApi.list(query)
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
/** 查询或重置后立即从第一页重新加载。 */
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
        month: '',
        status: '',
    })
    search()
}
/** 写入串行执行，成功后刷新正式值与状态。 */
async function operate(work: () => Promise<unknown>, validate?: () => Promise<boolean>) {
    if (busy.value) return
    busy.value = true
    try {
        if (validate && !(await validate())) return
        await work()
        dialog.value = false
        changeDialog.value = false
        await load()
        ElMessage.success('操作完成')
    } catch {
        /* 请求层提示 */
    } finally {
        busy.value = false
    }
}
/** 读取全部可见指标团队候选，不将第一页误作完整列表。 */
async function edit(row?: Monthly) {
    try {
        context.value = await serviceApi.context()
        if (!context.value.projects.length) {
            ElMessage.warning('尚未分配有效合同包项目或指标，请联系负责人')
            return
        }
        selectedProjectId.value = row?.projectId ?? context.value.projects[0]?.id ?? 0
        selected.value = row
        Object.assign(
            form,
            row
                ? {
                      indicatorId: row.indicatorId,
                      teamId: row.teamId,
                      serviceDate: row.serviceDate ?? '',
                      requestKey: row.requestKey,
                      actualValue: row.actualValue,
                      note: row.note ?? '',
                  }
                : {
                      indicatorId: 0,
                      teamId: 0,
                      serviceDate: formatDateTime(new Date()).slice(0, 10),
                      requestKey: crypto.randomUUID(),
                      actualValue: '0.00',
                      note: '',
                  },
        )
        if (!row) chooseProject()
        dialog.value = true
    } catch {
        /* 请求层提示 */
    }
}
/** 更正、撤销和恢复均提交原因，等待主管确认后才改变累计。 */
function openChange(row: Monthly, operation: string) {
    selected.value = row
    Object.assign(change, {
        operation,
        actualValue: row.actualValue,
        note: row.note ?? '',
        reason: '',
    })
    changeDialog.value = true
}
/** 详情重读保留所有审批轮次与申请编号，支持申请人撤回未决申请。 */
async function showHistory(row: Monthly) {
    try {
        history.value = await serviceApi.detail(row.id)
        historyDialog.value = true
    } catch {
        /* 请求层提示 */
    }
}
/** 草稿、提交和审批申请分别调用状态对应的接口。 */
function saveMonthly() {
    void operate(
        () => serviceApi.save(form, selected.value),
        () => validateForm(formRef.value),
    )
}
function submitMonthly(row: Monthly) {
    void operate(() => serviceApi.submit(row))
}
function removeMonthly(row: Monthly) {
    void operate(() => serviceApi.remove(row))
}
function saveChange() {
    void operate(
        () => serviceApi.change(selected.value!, change),
        () => validateForm(changeRef.value),
    )
}
async function withdraw(id: number) {
    await operate(() => serviceApi.withdraw(id))
    historyDialog.value = false
}
/** 撤回本人首次提交并回到草稿，保留历史审批记录。 */
function withdrawInitial(id: number) {
    void operate(() => serviceApi.withdrawSubmission(id))
}
onMounted(async () => {
    await load()
    if (!useMock) {
        try {
            const options = await projectApi.filterOptions()
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
                <span>服务档案填报</span>
                <el-button
                    v-if="!useMock && store.hasPermission('service:monthly:create')"
                    type="primary"
                    @click="edit()"
                >
                    新增服务档案
                </el-button>
            </div>
        </template>
        <el-alert
            v-if="useMock"
            title="服务档案填报请使用真实接口模式。"
            type="info"
            :closable="false"
        />
        <template v-else>
            <el-alert
                title="每次完成服务后填写本次完成量；首次及更正均由直接主管审批，通过后计入累计。"
                type="info"
                :closable="false"
                class="notice"
            />
            <el-form class="filter-form" @submit.prevent="search">
                <el-form-item label="项目／指标">
                    <el-input v-model="query.keyword" clearable />
                </el-form-item>
                <el-form-item label="服务月份">
                    <el-date-picker v-model="query.month" type="month" value-format="YYYY-MM" />
                </el-form-item>
                <el-form-item label="状态">
                    <el-select v-model="query.status" clearable>
                        <el-option
                            v-for="value in ['DRAFT', 'IN_REVIEW', 'REJECTED', 'SUBMITTED', 'VOID']"
                            :key="value"
                            :value="value"
                            :label="businessStatus[value]"
                        />
                    </el-select>
                </el-form-item>
                <el-form-item label="项目">
                    <el-select v-model="query.projectId" clearable filterable>
                        <el-option
                            v-for="p in filterProjects"
                            :key="p.id"
                            :label="p.name"
                            :value="p.id"
                        />
                    </el-select>
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
                <!-- @vue-generic {Monthly} -->
                <el-table-column
                    prop="projectName"
                    sortable="custom"
                    label="项目"
                    min-width="160"
                    show-overflow-tooltip
                />
                <!-- @vue-generic {Monthly} -->
                <el-table-column
                    prop="indicatorName"
                    sortable="custom"
                    label="指标"
                    min-width="140"
                    show-overflow-tooltip
                />
                <!-- @vue-generic {Monthly} -->
                <el-table-column prop="teamName" sortable="custom" label="团队" min-width="130" />
                <!-- @vue-generic {Monthly} -->
                <el-table-column prop="serviceDate" sortable="custom" label="服务日期" width="150">
                    <template #default="{ row }">
                        {{ row.serviceDate || `${row.month}（历史月汇总）` }}
                    </template>
                </el-table-column>
                <!-- @vue-generic {Monthly} -->
                <el-table-column
                    prop="actualValue"
                    sortable="custom"
                    label="本次完成量"
                    width="100"
                />
                <!-- @vue-generic {Monthly} -->
                <el-table-column prop="unit" label="单位" width="70" />
                <!-- @vue-generic {Monthly} -->
                <el-table-column label="状态" width="100">
                    <template #default="{ row }">
                        {{ businessStatus[row.status] }}
                        <span v-if="row.changes.some((c) => c.pendingReportId)">／变更待审</span>
                    </template>
                </el-table-column>
                <!-- @vue-generic {Monthly} -->
                <el-table-column
                    prop="createdAt"
                    label="创建时间"
                    min-width="180"
                    sortable="custom"
                >
                    <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
                </el-table-column>
                <!-- @vue-generic {Monthly} -->
                <el-table-column label="操作" min-width="280" fixed="right">
                    <template #default="{ row }">
                        <el-button link type="primary" @click="showHistory(row)">详情</el-button>
                        <template
                            v-if="
                                ['DRAFT', 'REJECTED'].includes(row.status) &&
                                row.canMaintain &&
                                !row.legacyReportId
                            "
                        >
                            <el-button
                                v-if="store.hasPermission('service:monthly:update')"
                                link
                                type="primary"
                                @click="edit(row)"
                            >
                                编辑
                            </el-button>
                            <el-button
                                v-if="store.hasPermission('service:monthly:submit')"
                                link
                                type="primary"
                                :disabled="busy"
                                @click="submitMonthly(row)"
                            >
                                提交
                            </el-button>
                            <el-button
                                v-if="store.hasPermission('service:monthly:delete')"
                                link
                                type="danger"
                                @click="removeMonthly(row)"
                            >
                                删除
                            </el-button>
                        </template>
                        <el-button
                            v-if="
                                row.status === 'IN_REVIEW' &&
                                row.submissions?.some(
                                    (i) =>
                                        i.status === 'IN_REVIEW' &&
                                        i.applicantId === store.profile?.id,
                                )
                            "
                            link
                            type="warning"
                            @click="withdrawInitial(row.id)"
                        >
                            撤回提交
                        </el-button>
                        <template
                            v-else-if="
                                row.canMaintain && !row.changes.some((c) => c.pendingReportId)
                            "
                        >
                            <el-button
                                v-if="
                                    row.status === 'SUBMITTED' &&
                                    store.hasPermission('service:monthly:update')
                                "
                                link
                                type="primary"
                                @click="openChange(row, 'CORRECT')"
                            >
                                申请更正
                            </el-button>
                            <el-button
                                v-if="
                                    row.status === 'SUBMITTED' &&
                                    store.hasPermission('service:monthly:delete')
                                "
                                link
                                type="danger"
                                @click="openChange(row, 'DELETE')"
                            >
                                申请撤销
                            </el-button>
                            <el-button
                                v-if="
                                    row.status === 'VOID' &&
                                    store.hasPermission('service:monthly:update')
                                "
                                link
                                type="primary"
                                @click="openChange(row, 'RESTORE')"
                            >
                                申请恢复
                            </el-button>
                        </template>
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
        <el-dialog v-model="dialog" destroy-on-close title="服务档案草稿" width="600px">
            <el-form
                ref="formRef"
                class="business-form"
                :model="form"
                :rules="formRules"
                label-width="100px"
                scroll-to-error
            >
                <el-form-item label="项目" required>
                    <el-select
                        v-model="selectedProjectId"
                        :disabled="context.fixedProject || !!selected"
                        @change="chooseProject"
                    >
                        <el-option
                            v-for="p in context.projects"
                            :key="p.id"
                            :label="p.name"
                            :value="p.id"
                        />
                    </el-select>
                </el-form-item>
                <el-form-item label="服务团队" required>
                    <el-select
                        v-model="form.teamId"
                        :disabled="!!selected || teamOptions.length === 1"
                        @change="chooseTeam"
                    >
                        <el-option
                            v-for="t in teamOptions"
                            :key="t.id"
                            :label="t.name"
                            :value="t.id"
                        />
                    </el-select>
                </el-form-item>
                <el-form-item label="指标" prop="indicatorId" required>
                    <el-select
                        v-model="selectedIndicatorId"
                        :disabled="!!selected || !form.teamId"
                        filterable
                    >
                        <el-option
                            v-for="i in indicatorOptions"
                            :key="i.indicatorId"
                            :label="`${i.indicatorName}（${i.unit}）`"
                            :value="i.indicatorId"
                        />
                    </el-select>
                </el-form-item>
                <el-form-item label="服务日期" prop="serviceDate" required>
                    <el-date-picker
                        v-model="form.serviceDate"
                        type="date"
                        value-format="YYYY-MM-DD"
                    />
                </el-form-item>
                <el-form-item label="本次完成量" prop="actualValue" required>
                    <el-input v-model="form.actualValue" placeholder="非负数，最多两位小数" />
                </el-form-item>
                <el-form-item label="说明">
                    <el-input v-model="form.note" type="textarea" maxlength="1000" />
                </el-form-item>
            </el-form>
            <template #footer>
                <el-button @click="dialog = false">取消</el-button>
                <el-button type="primary" :loading="busy" @click="saveMonthly()">
                    保存草稿
                </el-button>
            </template>
        </el-dialog>
        <el-dialog
            v-model="changeDialog"
            destroy-on-close
            :title="`申请${businessStatus[change.operation]}`"
            width="560px"
        >
            <el-form
                ref="changeRef"
                class="business-form"
                :model="change"
                :rules="changeRules"
                label-width="100px"
                scroll-to-error
            >
                <el-form-item
                    v-if="change.operation === 'CORRECT'"
                    label="更正后新增"
                    prop="actualValue"
                    required
                >
                    <el-input v-model="change.actualValue" />
                </el-form-item>
                <el-form-item label="原因" prop="reason" required>
                    <el-input v-model="change.reason" type="textarea" maxlength="1000" />
                </el-form-item>
                <el-form-item v-if="change.operation === 'CORRECT'" label="更新说明">
                    <el-input v-model="change.note" type="textarea" maxlength="1000" />
                </el-form-item>
            </el-form>
            <template #footer>
                <el-button @click="changeDialog = false">取消</el-button>
                <el-button type="primary" :loading="busy" @click="saveChange()">
                    提交主管确认
                </el-button>
            </template>
        </el-dialog>
        <el-dialog v-model="historyDialog" title="服务档案及审批历史" width="700px">
            <template v-if="history">
                <p>
                    {{ history.projectName }}／{{ history.indicatorName }}／{{
                        history.serviceDate || history.month
                    }}：{{ history.actualValue }}{{ history.unit }}
                </p>
                <p>{{ history.note }}</p>
                <el-timeline>
                    <el-timeline-item
                        v-for="submission in history.submissions ?? []"
                        :key="`submission-${submission.id}`"
                    >
                        <p>首次填报：{{ businessStatus[submission.status] }}</p>
                        <p v-for="r in submission.records ?? []" :key="r.id">
                            {{ formatDateTime(r.createdAt) }} {{ r.actorName }} ·
                            {{ businessStatus[r.action] }}：{{ r.comment || '无补充意见' }}
                        </p>
                    </el-timeline-item>
                    <el-timeline-item v-for="c in history.changes" :key="c.id">
                        <p>
                            {{ businessStatus[c.operation] }}：{{ c.reason }}；{{
                                businessStatus[c.instance.status]
                            }}
                        </p>
                        <ul v-if="c.instance.records?.length">
                            <li v-for="record in c.instance.records" :key="record.id">
                                {{ formatDateTime(record.createdAt) }} {{ record.actorName }} ·
                                {{ businessStatus[record.action] }}：{{
                                    record.comment ?? '无补充意见'
                                }}
                            </li>
                        </ul>
                        <el-button
                            v-if="c.pendingReportId && c.instance.applicantId === store.profile?.id"
                            :disabled="busy"
                            @click="withdraw(c.id)"
                        >
                            撤回申请
                        </el-button>
                    </el-timeline-item>
                </el-timeline>
            </template>
        </el-dialog>
    </el-card>
</template>
<style scoped>
.notice {
    margin-bottom: 20px;
}
</style>
