<script setup lang="ts">
import ResponsiveTable from '@/components/ResponsiveTable.vue'
import { useViewport } from '@/composables/useViewport'
defineOptions({ name: 'ServiceTaskDetail' })
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useUserStore } from '@/stores/user'
import { PERM } from '@/api/permissions'
import { useMock } from '@/api/config'
import { taskApi } from '@/api/modules/task'
import { taskForms, taskStatuses, type Task } from '@/api/task-types'
import { formatDateTime } from '@/utils/dateTime'
import ExecutionPanel from './components/ExecutionPanel.vue'
import TaskDialog from './components/TaskDialog.vue'
const route = useRoute(),
    router = useRouter(),
    store = useUserStore(),
    task = ref<Task>(),
    loading = ref(false),
    dialog = ref(false),
    copy = ref(false)
async function load() {
    if (useMock) return
    loading.value = true
    try {
        task.value = await taskApi.detail(Number(route.params.id))
    } catch {
        task.value = undefined
    } finally {
        loading.value = false
    }
}
function edit(isCopy = false) {
    copy.value = isCopy
    dialog.value = true
}
async function cancel() {
    if (!task.value) return
    try {
        const { value } = await ElMessageBox.prompt('取消原因', '取消服务任务', {
            inputPattern: /\S/,
            inputErrorMessage: '请填写取消原因',
            inputType: 'textarea',
        })
        await taskApi.cancel(task.value.id, task.value.version, value)
        ElMessage.success('任务已取消')
        await load()
    } catch {
        /* 请求层提示或取消 */
    }
}
const eventLabels: Record<string, string> = {
    CREATE: '创建',
    COPY: '复制',
    UPDATE: '变更',
    CANCEL: '取消',
}
function snapshotText(value: unknown): string {
    if (!value || typeof value !== 'object') return '—'
    const v = value as Record<string, unknown>,
        parts: string[] = []
    if (v.title) parts.push(`标题：${v.title}`)
    if (v.startAt && v.endAt)
        parts.push(
            `时间：${formatDateTime(String(v.startAt))} 至 ${formatDateTime(String(v.endAt))}`,
        )
    if (v.location) parts.push(`地点：${v.location} ${v.address ?? ''}`)
    if (v.leaderName) parts.push(`负责人：${v.leaderName}`)
    if (Array.isArray(v.staffNames)) parts.push(`工作人员：${v.staffNames.join('、')}`)
    if (Array.isArray(v.indicators) && v.indicators.length)
        parts.push(
            `指标：${v.indicators.map((i: Record<string, unknown>) => `${i.indicatorName} ${i.plannedValue}`).join('；')}`,
        )
    if (Array.isArray(v.resources) && v.resources.length)
        parts.push(
            `协作资源：${v.resources.map((r: Record<string, unknown>) => `${r.resourceName}（${r.collaboration}）`).join('；')}`,
        )
    if (v.status) parts.push(`状态：${taskStatuses[String(v.status)] ?? v.status}`)
    if (v.conflictReason) parts.push(`冲突处理：${v.conflictReason}`)
    return parts.join('\n') || '—'
}
async function saved(id: number) {
    if (id !== Number(route.params.id)) await router.push(`/activity/${id}`)
    else await load()
}
watch(() => route.params.id, load)
onMounted(load)
const { isMobile } = useViewport()
</script>
<template>
    <section v-loading="loading">
        <div class="task-detail__header">
            <el-button @click="router.push('/activity')">返回服务任务</el-button>
            <div v-if="task">
                <el-button v-if="store.hasPermission(PERM.TASK_CREATE)" @click="edit(true)">
                    复制任务
                </el-button>
                <el-button v-if="task.canUpdate" type="primary" @click="edit()">修改安排</el-button>
                <el-button v-if="task.canCancel" type="danger" plain @click="cancel">
                    取消任务
                </el-button>
            </div>
        </div>
        <template v-if="task">
            <h2>{{ task.title }}</h2>
            <el-alert
                v-if="task.needsRearrangement"
                title="人员有效归属已变化，请重新安排工作人员。"
                type="error"
                :closable="false"
            />
            <el-alert
                v-else-if="task.overdue"
                title="计划时间已过，请跟进实际开展情况。"
                type="warning"
                :closable="false"
            />
            <el-descriptions :column="isMobile ? 1 : 2" border>
                <el-descriptions-item label="合同包">{{ task.projectName }}</el-descriptions-item>
                <el-descriptions-item label="团队">{{ task.teamName }}</el-descriptions-item>
                <el-descriptions-item label="服务形式">
                    {{ taskForms[task.form] }}
                </el-descriptions-item>
                <el-descriptions-item label="状态">
                    {{ taskStatuses[task.state] }}
                </el-descriptions-item>
                <el-descriptions-item label="开始时间">
                    {{ formatDateTime(task.startAt) }}
                </el-descriptions-item>
                <el-descriptions-item label="结束时间">
                    {{ formatDateTime(task.endAt) }}
                </el-descriptions-item>
                <el-descriptions-item label="地点">
                    {{ task.location }} {{ task.address }}
                </el-descriptions-item>
                <el-descriptions-item label="预计人数">
                    {{ task.expectedPeople }}
                </el-descriptions-item>
                <el-descriptions-item label="负责人">{{ task.leaderName }}</el-descriptions-item>
                <el-descriptions-item label="工作人员">
                    {{ task.staff.map((s) => s.name).join('、') }}
                </el-descriptions-item>
                <el-descriptions-item label="服务说明" :span="isMobile ? 1 : 2">
                    {{ task.description || '—' }}
                </el-descriptions-item>
                <el-descriptions-item label="凭证要求" :span="isMobile ? 1 : 2">
                    {{ task.evidence || '—' }}
                </el-descriptions-item>
                <el-descriptions-item v-if="task.sourceTaskId" label="复制来源">
                    任务 #{{ task.sourceTaskId }}
                </el-descriptions-item>
            </el-descriptions>
            <el-button
                v-if="store.hasPermission(PERM.EXECUTION_VIEW)"
                @click="router.push(`/field/tasks/${task.id}`)"
            >
                打开手机现场
            </el-button>
            <ExecutionPanel
                v-if="store.hasPermission(PERM.EXECUTION_VIEW)"
                :task-id="task.id"
                @changed="load"
            />
            <h3>指标计划</h3>
            <ResponsiveTable :data="task.indicators">
                <el-table-column prop="indicatorName" label="指标" />
                <el-table-column prop="plannedValue" label="计划量" />
                <el-table-column prop="unit" label="单位" />
                <el-table-column label="阶段基线">
                    <template #default="{ row }">
                        <el-link
                            v-if="store.hasPermission(PERM.PLAN_VIEW)"
                            type="primary"
                            @click="router.push(`/service/plans/${row.planId}`)"
                        >
                            查看引用版本 #{{ row.planId }}
                        </el-link>
                        <span v-else>#{{ row.planId }}</span>
                    </template>
                </el-table-column>
            </ResponsiveTable>
            <h3>协作资源</h3>
            <ResponsiveTable :data="task.resources">
                <el-table-column label="单位">
                    <template #default="{ row }">
                        <el-link
                            v-if="row.resourceId"
                            type="primary"
                            @click="router.push(`/resource/${row.resourceId}`)"
                        >
                            {{ row.resourceName }}
                        </el-link>
                        <span v-else>{{ row.resourceName }}</span>
                        <el-tag v-if="row.needsReview" type="warning">需重新核对</el-tag>
                    </template>
                </el-table-column>
                <el-table-column prop="collaboration" label="协作内容" />
                <el-table-column label="联系人">
                    <template #default="{ row }">
                        {{
                            row.contact
                                ? [row.contact.name, row.contact.phone, row.contact.email]
                                      .filter(Boolean)
                                      .join(' · ')
                                : '—'
                        }}
                    </template>
                </el-table-column>
            </ResponsiveTable>
            <h3>安排变更记录</h3>
            <ResponsiveTable :data="task.events">
                <el-table-column label="时间" width="180">
                    <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
                </el-table-column>
                <el-table-column prop="actorName" label="操作人" width="130" />
                <el-table-column label="动作" width="100">
                    <template #default="{ row }">
                        {{ eventLabels[row.action] ?? row.action }}
                    </template>
                </el-table-column>
                <el-table-column prop="reason" label="原因" />
                <el-table-column type="expand">
                    <template #default="{ row }">
                        <pre class="task-detail__snapshot">
变更前：
{{ snapshotText(row.beforeData) }}

变更后：
{{ snapshotText(row.afterData) }}</pre>
                    </template>
                </el-table-column>
            </ResponsiveTable>
            <TaskDialog v-model="dialog" :task="task" :copy="copy" @saved="saved" />
        </template>
        <el-empty v-else-if="!loading" description="任务不存在或无权访问" />
    </section>
</template>
<style scoped>
.task-detail__header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 16px;
}
.task-detail__snapshot {
    white-space: pre-wrap;
    padding: 16px;
    font: inherit;
    overflow-wrap: anywhere;
}
@media (max-width: 767px) {
    .task-detail__header > div {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
    }
}
</style>
