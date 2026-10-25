<script setup lang="ts">
import { useTableSort } from '@/utils/tableSort'
import { onMounted, ref } from 'vue'
import { useApprovalList } from './useApprovalList'
import { ElMessage } from 'element-plus'
import 'element-plus/es/components/message/style/css'
import { useMock } from '@/api/config'
import { approvalApi } from '@/api/modules/approval'
import { businessStatus, type ApprovalTask, type ApprovalInstance } from '@/api/business-types'
import { formatDateTime } from '@/utils/dateTime'
const taskList = useApprovalList(approvalApi.tasks)
const { rows, total, loading, query } = taskList
const busy = ref(false),
    dialog = ref(false),
    selected = ref<ApprovalTask>(),
    detail = ref<ApprovalInstance>(),
    comment = ref('')
const { setTableRef, defaultSort, onSortChange, resetSort } = useTableSort(
    query,
    'createdAt',
    'descending',
    load,
)
/** mock 模式保留提示，真实模式读取本人的审批任务。 */
async function load() {
    if (!useMock) return taskList.load()
}
/** 状态查询与重置均从第一页加载，重置展示本人全部任务。 */
function search() {
    query.page = 1
    void load()
}
function reset() {
    resetSort()
    query.status = ''
    search()
}
/** 打开审批时重新读取不可变业务快照及当次意见历史。 */
async function open(row: ApprovalTask) {
    try {
        selected.value = row
        detail.value = await approvalApi.detail(row.instanceId)
        comment.value = ''
        dialog.value = true
    } catch {
        /* 请求层提示 */
    }
}
/** 决策提交当前任务版本，前后端均防止重复操作，驳回必须有意见。 */
async function decide(approved: boolean) {
    if (busy.value || !selected.value) return
    if (!approved && !comment.value.trim()) {
        ElMessage.warning('请填写驳回意见')
        return
    }
    const task = selected.value
    busy.value = true
    try {
        await approvalApi.decide(task, approved, comment.value)
        taskList.applyDecision(task.id, approved)
        dialog.value = false
        ElMessage.success('审批已处理')
        const result = await load()
        if (result === 'failed') ElMessage.warning('审批已生效，列表刷新失败，请稍后刷新')
    } catch {
        /* 请求层提示 */
    } finally {
        busy.value = false
    }
}
onMounted(load)
</script>
<template>
    <el-card>
        <template #header>服务档案审批</template>
        <el-alert
            v-if="useMock"
            title="审批任务请使用真实接口模式。"
            type="info"
            :closable="false"
        />
        <template v-else>
            <el-form class="filter-form" @submit.prevent="search">
                <el-form-item label="任务状态">
                    <el-select v-model="query.status" clearable>
                        <el-option
                            v-for="status in ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']"
                            :key="status"
                            :value="status"
                            :label="businessStatus[status]"
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
                <!-- @vue-generic {ApprovalTask} -->
                <el-table-column prop="projectName" sortable="custom" label="项目" min-width="170">
                    <template #default="{ row }">
                        {{ row.instance?.businessSnapshot.projectName }}
                    </template>
                </el-table-column>
                <!-- @vue-generic {ApprovalTask} -->
                <el-table-column
                    prop="indicatorName"
                    sortable="custom"
                    label="指标"
                    min-width="140"
                >
                    <template #default="{ row }">
                        {{ row.instance?.businessSnapshot.indicatorName }}
                    </template>
                </el-table-column>
                <!-- @vue-generic {ApprovalTask} -->
                <el-table-column prop="month" sortable="custom" label="服务日期" width="150">
                    <template #default="{ row }">
                        {{
                            row.instance?.businessSnapshot.serviceDate ||
                            row.instance?.businessSnapshot.month
                        }}
                    </template>
                </el-table-column>
                <!-- @vue-generic {ApprovalTask} -->
                <el-table-column label="申请内容" min-width="150">
                    <template #default="{ row }">
                        {{ businessStatus[String(row.instance?.businessSnapshot.operation)] }}
                        {{ row.instance?.businessSnapshot.beforeValue }} →
                        {{ row.instance?.businessSnapshot.proposedValue }}
                    </template>
                </el-table-column>
                <!-- @vue-generic {ApprovalTask} -->
                <el-table-column label="状态" width="100">
                    <template #default="{ row }">{{ businessStatus[row.status] }}</template>
                </el-table-column>
                <!-- @vue-generic {ApprovalTask} -->
                <el-table-column
                    prop="createdAt"
                    label="任务创建时间"
                    min-width="180"
                    sortable="custom"
                >
                    <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
                </el-table-column>
                <!-- @vue-generic {ApprovalTask} -->
                <el-table-column label="操作" width="120" fixed="right">
                    <template #default="{ row }">
                        <el-button link type="primary" @click="open(row)">
                            {{
                                row.status === 'PENDING' && row.canDecide !== false
                                    ? '查看并处理'
                                    : '查看记录'
                            }}
                        </el-button>
                    </template>
                </el-table-column>
            </el-table>
            <el-pagination
                v-model:current-page="query.page"
                :total="total"
                v-model:page-size="query.pageSize"
                :page-sizes="[10, 20, 50, 100]"
                class="table-pagination"
                layout="total, sizes, prev, pager, next"
                @size-change="search"
                @current-change="load"
            />
        </template>
        <el-dialog v-model="dialog" title="服务档案审批详情" width="700px">
            <template v-if="detail">
                <el-descriptions :column="2" border>
                    <el-descriptions-item label="项目">
                        {{ detail.businessSnapshot.projectName }}
                    </el-descriptions-item>
                    <el-descriptions-item label="指标">
                        {{ detail.businessSnapshot.indicatorName }}
                    </el-descriptions-item>
                    <el-descriptions-item label="团队">
                        {{ detail.businessSnapshot.teamName }}
                    </el-descriptions-item>
                    <el-descriptions-item label="服务日期">
                        {{ detail.businessSnapshot.serviceDate || detail.businessSnapshot.month }}
                    </el-descriptions-item>
                    <el-descriptions-item label="操作">
                        {{ businessStatus[String(detail.businessSnapshot.operation)] }}
                    </el-descriptions-item>
                    <el-descriptions-item label="原值／拟值">
                        {{ detail.businessSnapshot.beforeValue }}／{{
                            detail.businessSnapshot.proposedValue
                        }}
                    </el-descriptions-item>
                    <el-descriptions-item label="原因" :span="2">
                        {{ detail.businessSnapshot.reason }}
                    </el-descriptions-item>
                </el-descriptions>
                <el-timeline class="history">
                    <el-timeline-item
                        v-for="r in detail.records"
                        :key="r.id"
                        :timestamp="formatDateTime(r.createdAt)"
                    >
                        {{ r.actorName }} · {{ businessStatus[r.action] }}：{{
                            r.comment ?? '无补充意见'
                        }}
                    </el-timeline-item>
                </el-timeline>
                <el-form
                    v-if="selected?.status === 'PENDING' && selected.canDecide !== false"
                    label-width="80px"
                >
                    <el-form-item label="审批意见">
                        <el-input
                            v-model="comment"
                            type="textarea"
                            maxlength="1000"
                            placeholder="驳回须填写意见"
                        />
                    </el-form-item>
                </el-form>
            </template>
            <template #footer>
                <el-button @click="dialog = false">关闭</el-button>
                <template v-if="selected?.status === 'PENDING' && selected.canDecide !== false">
                    <el-button type="danger" :loading="busy" @click="decide(false)">驳回</el-button>
                    <el-button type="primary" :loading="busy" @click="decide(true)">通过</el-button>
                </template>
            </template>
        </el-dialog>
    </el-card>
</template>
<style scoped>
.history {
    margin-top: 24px;
}
</style>
