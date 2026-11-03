<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { PERM } from '@/api/permissions'
import { useMock } from '@/api/config'
import { taskApi } from '@/api/modules/task'
import { taskForms, taskStatuses, emptyCandidates, businessDay, type Task } from '@/api/task-types'
import { formatDateTime } from '@/utils/dateTime'
import TaskDialog from './components/TaskDialog.vue'
const store = useUserStore(),
    route = useRoute(),
    router = useRouter()
const rows = ref<Task[]>([]),
    total = ref(0),
    loading = ref(false),
    view = ref('list'),
    month = ref(new Date()),
    candidates = ref(emptyCandidates()),
    dialog = ref(false)
const query = reactive({
    page: 1,
    pageSize: 20,
    projectId: Number(route.query.projectId) || (undefined as number | undefined),
    teamId: undefined as number | undefined,
    leaderId: undefined as number | undefined,
    keyword: '',
    form: '',
    status: '',
    from: '',
    to: '',
    mine:
        store.profile?.teamId &&
        store.profile?.positionCode !== 'position-4' &&
        !store.profile?.isDevSuperadmin
            ? 'true'
            : '',
})
let generation = 0
function calendarRange() {
    const y = month.value.getFullYear(),
        m = month.value.getMonth()
    return {
        from: `${y}-${String(m + 1).padStart(2, '0')}-01`,
        to: new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10),
    }
}
async function load() {
    const seq = ++generation
    if (useMock) return
    loading.value = true
    try {
        const q = Object.fromEntries(
            Object.entries({
                ...query,
                ...(view.value === 'calendar' ? calendarRange() : {}),
            }).filter(([, v]) => v !== '' && v !== undefined),
        )
        const result = view.value === 'calendar' ? await taskApi.calendar(q) : await taskApi.list(q)
        if (seq === generation) {
            rows.value = result.list
            total.value = result.total
        }
    } catch {
        /* 请求层提示 */
    } finally {
        if (seq === generation) loading.value = false
    }
}
function search() {
    query.page = 1
    void load()
}
function reset() {
    Object.assign(query, {
        page: 1,
        projectId: undefined,
        teamId: undefined,
        leaderId: undefined,
        keyword: '',
        form: '',
        status: '',
        from: '',
        to: '',
        mine: '',
    })
    month.value = new Date()
    search()
}
function daily(day: string) {
    return rows.value.filter(
        (t) =>
            businessDay(new Date(t.startAt)) <= day &&
            businessDay(new Date(Date.parse(t.endAt) - 1)) >= day,
    )
}
const teams = computed(() =>
    candidates.value.teams.filter((t) => !query.projectId || t.projectId === query.projectId),
)
const leaders = computed(() => candidates.value.leaders)
watch([view, month], search)
watch(
    () => route.query.projectId,
    (value) => {
        query.projectId = Number(value) || undefined
        search()
    },
)
onMounted(async () => {
    void load()
    if (!useMock)
        try {
            candidates.value = await taskApi.candidates()
        } catch {
            /* 请求层提示 */
        }
})
</script>
<template>
    <section class="task-page">
        <div class="task-page__header">
            <h2>服务任务</h2>
            <el-button
                v-if="store.hasPermission(PERM.TASK_CREATE)"
                type="primary"
                :disabled="useMock"
                @click="dialog = true"
            >
                新增服务任务
            </el-button>
        </div>
        <el-alert
            v-if="useMock"
            title="演示模式展示任务入口；服务任务使用真实接口维护。"
            type="info"
            :closable="false"
        />
        <el-form :inline="true" class="filter-form" @submit.prevent="search">
            <el-form-item label="任务标题">
                <el-input v-model="query.keyword" clearable />
            </el-form-item>
            <el-form-item label="合同包">
                <el-select v-model="query.projectId" clearable @change="query.teamId = undefined">
                    <el-option
                        v-for="p in candidates.projects"
                        :key="p.id"
                        :label="p.name"
                        :value="p.id"
                    />
                </el-select>
            </el-form-item>
            <el-form-item label="团队">
                <el-select v-model="query.teamId" clearable>
                    <el-option
                        v-for="t in teams"
                        :key="`${t.projectId}-${t.teamId}`"
                        :label="t.name"
                        :value="t.teamId"
                    />
                </el-select>
            </el-form-item>
            <el-form-item label="负责人">
                <el-select v-model="query.leaderId" clearable>
                    <el-option v-for="u in leaders" :key="u.id" :label="u.name" :value="u.id" />
                </el-select>
            </el-form-item>
            <el-form-item label="服务形式">
                <el-select v-model="query.form" clearable>
                    <el-option
                        v-for="(label, key) in taskForms"
                        :key="key"
                        :label="label"
                        :value="key"
                    />
                </el-select>
            </el-form-item>
            <el-form-item label="安排状态">
                <el-select v-model="query.status" clearable>
                    <el-option label="待开展" value="SCHEDULED" />
                    <el-option label="已取消" value="CANCELED" />
                </el-select>
            </el-form-item>
            <template v-if="view === 'list'">
                <el-form-item label="开始日期">
                    <el-date-picker v-model="query.from" value-format="YYYY-MM-DD" />
                </el-form-item>
                <el-form-item label="结束日期">
                    <el-date-picker v-model="query.to" value-format="YYYY-MM-DD" />
                </el-form-item>
            </template>
            <el-form-item>
                <el-checkbox
                    :model-value="query.mine === 'true'"
                    @update:model-value="query.mine = $event ? 'true' : ''"
                >
                    本人参与
                </el-checkbox>
            </el-form-item>
            <el-form-item>
                <el-button type="primary" native-type="submit">查询</el-button>
                <el-button @click="reset">重置</el-button>
            </el-form-item>
        </el-form>
        <el-radio-group v-model="view">
            <el-radio-button value="list">列表</el-radio-button>
            <el-radio-button value="calendar">月历</el-radio-button>
        </el-radio-group>
        <div v-loading="loading">
            <el-table v-if="view === 'list'" :data="rows" stripe>
                <el-table-column label="任务标题" min-width="210">
                    <template #default="{ row }">
                        <el-link type="primary" @click="router.push(`/activity/${row.id}`)">
                            {{ row.title }}
                        </el-link>
                        <div>
                            <el-tag v-if="row.needsRearrangement" type="danger">需重新安排</el-tag>
                            <el-tag v-else-if="row.overdue" type="warning">已逾期</el-tag>
                        </div>
                    </template>
                </el-table-column>
                <el-table-column prop="projectName" label="合同包" min-width="170" />
                <el-table-column prop="teamName" label="团队" min-width="130" />
                <el-table-column label="形式" width="100">
                    <template #default="{ row }">{{ taskForms[row.form] }}</template>
                </el-table-column>
                <el-table-column prop="leaderName" label="负责人" width="110" />
                <el-table-column label="开始时间" width="170">
                    <template #default="{ row }">{{ formatDateTime(row.startAt) }}</template>
                </el-table-column>
                <el-table-column label="结束时间" width="170">
                    <template #default="{ row }">{{ formatDateTime(row.endAt) }}</template>
                </el-table-column>
                <el-table-column label="状态" width="100">
                    <template #default="{ row }">{{ taskStatuses[row.state] }}</template>
                </el-table-column>
            </el-table>
            <el-calendar v-else v-model="month">
                <template #date-cell="{ data }">
                    <div v-if="data.type === 'current-month'" class="task-page__day">
                        <span>{{ data.day.slice(-2) }}</span>
                        <button
                            v-for="t in daily(data.day)"
                            :key="t.id"
                            class="task-page__calendar-task"
                            :class="{ 'is-canceled': t.status === 'CANCELED' }"
                            @click.stop="router.push(`/activity/${t.id}`)"
                        >
                            {{ t.title }} · {{ taskStatuses[t.state] }}
                        </button>
                    </div>
                    <span v-else>{{ data.day.slice(-2) }}</span>
                </template>
            </el-calendar>
            <el-pagination
                v-if="view === 'list'"
                v-model:current-page="query.page"
                v-model:page-size="query.pageSize"
                :total="total"
                :page-sizes="[10, 20, 50, 100]"
                layout="total, sizes, prev, pager, next"
                @size-change="search"
                @current-change="load"
            />
        </div>
        <TaskDialog v-model="dialog" :project-id="query.projectId" @saved="load" />
    </section>
</template>
<style scoped>
.task-page__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
}
.task-page__calendar-task {
    display: block;
    width: 100%;
    text-align: left;
    background: var(--el-color-primary-light-9);
    color: var(--el-text-color-primary);
    border: 1px solid var(--el-color-primary-light-5);
    border-radius: 4px;
    padding: 4px;
    margin-top: 4px;
    cursor: pointer;
    font: inherit;
    white-space: normal;
}
.is-canceled {
    opacity: 0.65;
    text-decoration: line-through;
}
.task-page :deep(.el-calendar-day) {
    height: auto;
    min-height: 110px;
}
.task-page :deep(.el-radio-group) {
    margin-bottom: 16px;
}
</style>
