<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import 'element-plus/es/components/message/style/css'
import { useMock } from '@/api/config'
import { approvalApi } from '@/api/modules/approval'
import { businessStatus, type ApprovalTask, type ApprovalInstance } from '@/api/business-types'
import { formatDateTime } from '@/utils/dateTime'
const rows = ref<ApprovalTask[]>([]),
    total = ref(0),
    loading = ref(false),
    busy = ref(false),
    dialog = ref(false),
    selected = ref<ApprovalTask>(),
    detail = ref<ApprovalInstance>(),
    comment = ref('')
const query = reactive({ page: 1, pageSize: 20, status: 'PENDING' })
let generation = 0
/** 待办列表仅查询本人实际任务，状态筛选不扩大授权范围。 */
async function load() {
    if (useMock) return
    const request = ++generation
    loading.value = true
    try {
        const result = await approvalApi.tasks(query)
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
/** 状态查询与重置均从第一页加载，重置展示本人全部任务。 */
function search() {
    query.page = 1
    void load()
}
function reset() {
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
    busy.value = true
    try {
        await approvalApi.decide(selected.value, approved, comment.value)
        dialog.value = false
        await load()
        ElMessage.success('审批已处理')
    } catch {
        /* 请求层提示 */
    } finally {
        busy.value = false
    }
}
onMounted(load)
</script>
<template>
    <el-card
        ><template #header>月报变更待办</template
        ><el-alert
            v-if="useMock"
            title="审批任务请使用真实接口模式。"
            type="info"
            :closable="false"
        /><template v-else
            ><el-form class="filter-form" @submit.prevent="search"
                ><el-form-item label="任务状态"
                    ><el-select v-model="query.status" clearable
                        ><el-option
                            v-for="status in ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']"
                            :key="status"
                            :value="status"
                            :label="businessStatus[status]" /></el-select></el-form-item
                ><el-form-item class="filter-form__actions"
                    ><el-button type="primary" native-type="submit">查询</el-button
                    ><el-button @click="reset">重置</el-button></el-form-item
                ></el-form
            ><el-table v-loading="loading" :data="rows"
                ><!-- @vue-generic {ApprovalTask} --><el-table-column label="项目" min-width="170"
                    ><template #default="{ row }">{{
                        row.instance?.businessSnapshot.projectName
                    }}</template></el-table-column
                ><!-- @vue-generic {ApprovalTask} --><el-table-column label="指标" min-width="140"
                    ><template #default="{ row }">{{
                        row.instance?.businessSnapshot.indicatorName
                    }}</template></el-table-column
                ><!-- @vue-generic {ApprovalTask} --><el-table-column label="月份" width="110"
                    ><template #default="{ row }">{{
                        row.instance?.businessSnapshot.month
                    }}</template></el-table-column
                ><!-- @vue-generic {ApprovalTask} --><el-table-column
                    label="申请内容"
                    min-width="150"
                    ><template #default="{ row }"
                        >{{ businessStatus[String(row.instance?.businessSnapshot.operation)] }}
                        {{ row.instance?.businessSnapshot.beforeValue }} →
                        {{ row.instance?.businessSnapshot.proposedValue }}</template
                    ></el-table-column
                ><!-- @vue-generic {ApprovalTask} --><el-table-column label="状态" width="100"
                    ><template #default="{ row }">{{
                        businessStatus[row.status]
                    }}</template></el-table-column
                ><!-- @vue-generic {ApprovalTask} --><el-table-column
                    label="操作"
                    width="120"
                    fixed="right"
                    ><template #default="{ row }"
                        ><el-button link type="primary" @click="open(row)">{{
                            row.status === 'PENDING' ? '查看并处理' : '查看记录'
                        }}</el-button></template
                    ></el-table-column
                ></el-table
            ><el-pagination
                v-model:current-page="query.page"
                :total="total"
                :page-size="query.pageSize"
                class="table-pagination"
                layout="total, prev, pager, next"
                @current-change="load"
        /></template>
        <el-dialog v-model="dialog" title="月报变更申请" width="700px"
            ><template v-if="detail"
                ><el-descriptions :column="2" border
                    ><el-descriptions-item label="项目">{{
                        detail.businessSnapshot.projectName
                    }}</el-descriptions-item
                    ><el-descriptions-item label="指标">{{
                        detail.businessSnapshot.indicatorName
                    }}</el-descriptions-item
                    ><el-descriptions-item label="团队">{{
                        detail.businessSnapshot.teamName
                    }}</el-descriptions-item
                    ><el-descriptions-item label="月份">{{
                        detail.businessSnapshot.month
                    }}</el-descriptions-item
                    ><el-descriptions-item label="操作">{{
                        businessStatus[String(detail.businessSnapshot.operation)]
                    }}</el-descriptions-item
                    ><el-descriptions-item label="原值／拟值"
                        >{{ detail.businessSnapshot.beforeValue }}／{{
                            detail.businessSnapshot.proposedValue
                        }}</el-descriptions-item
                    ><el-descriptions-item label="原因" :span="2">{{
                        detail.businessSnapshot.reason
                    }}</el-descriptions-item></el-descriptions
                ><el-timeline class="history"
                    ><el-timeline-item
                        v-for="r in detail.records"
                        :key="r.id"
                        :timestamp="formatDateTime(r.createdAt)"
                        >{{ r.actorName }} · {{ businessStatus[r.action] }}：{{
                            r.comment ?? '无补充意见'
                        }}</el-timeline-item
                    ></el-timeline
                ><el-form v-if="selected?.status === 'PENDING'" label-width="80px"
                    ><el-form-item label="审批意见"
                        ><el-input
                            v-model="comment"
                            type="textarea"
                            maxlength="1000"
                            placeholder="驳回须填写意见" /></el-form-item></el-form></template
            ><template #footer
                ><el-button @click="dialog = false">关闭</el-button
                ><template v-if="selected?.status === 'PENDING'"
                    ><el-button type="danger" :loading="busy" @click="decide(false)">驳回</el-button
                    ><el-button type="primary" :loading="busy" @click="decide(true)"
                        >通过</el-button
                    ></template
                ></template
            ></el-dialog
        >
    </el-card>
</template>
<style scoped>
.history {
    margin-top: 24px;
}
</style>
