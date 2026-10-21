<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useMock } from '@/api/config'
import { systemApi, type AuditLog } from '@/api/modules/system'
import { APP_TIME_ZONE_LABEL } from '@/constants/time'
import {
    AUDIT_ACTION_LABELS,
    AUDIT_ENTITY_TYPE_LABELS,
    auditActionLabel,
    auditEntityTypeLabel,
} from '@/constants/audit'
import { formatDateTime } from '@/utils/dateTime'
const rows = ref<AuditLog[]>([])
const total = ref(0)
const loading = ref(false)
const selected = ref<AuditLog>()
const dialog = ref(false)
const query = reactive({
    page: 1,
    pageSize: 20,
    actorName: '',
    action: '',
    entityType: '',
    dateFrom: '',
    dateTo: '',
})
// 筛选与重置可能连续发起请求，仅最后一次查询可以更新表格。
let generation = 0
/** 移除空筛选条件后分页查询日志，mock 模式不请求真实管理接口。 */
async function load() {
    if (useMock) return
    const request = ++generation
    loading.value = true
    try {
        const result = await systemApi.logs(
            Object.fromEntries(
                Object.entries(query).filter(
                    ([, value]) => value !== undefined && value !== null && value !== '',
                ),
            ),
        )
        if (request === generation) {
            rows.value = result.list
            total.value = result.total
        }
    } catch {
        /* 请求层统一提示 */
    } finally {
        if (request === generation) loading.value = false
    }
}
/** 重置页码并执行日志筛选。 */
function search() {
    query.page = 1
    void load()
}
/** 清空全部手动筛选条件，并立即查询第一页日志。 */
function resetSearch() {
    Object.assign(query, {
        actorName: '',
        action: '',
        entityType: '',
        dateFrom: '',
        dateTo: '',
    })
    search()
}
/** 选中日志并打开脱敏变更详情弹窗。 */
function showDetail(row: AuditLog) {
    selected.value = row
    dialog.value = true
}
onMounted(load)
</script>
<template>
    <el-card
        ><template #header>操作日志</template>
        <el-alert
            v-if="useMock"
            title="当前为演示模式；操作日志需使用真实接口模式。"
            type="info"
            :closable="false"
        />
        <template v-else
            ><el-form class="filter-form" @submit.prevent="search"
                ><el-form-item label="操作人姓名"
                    ><el-input
                        v-model="query.actorName"
                        clearable
                        maxlength="50"
                        placeholder="输入姓名，可模糊查询" /></el-form-item
                ><el-form-item label="动作"
                    ><el-select v-model="query.action" clearable filterable placeholder="全部动作"
                        ><el-option
                            v-for="(label, code) in AUDIT_ACTION_LABELS"
                            :key="code"
                            :label="label"
                            :value="code" /></el-select></el-form-item
                ><el-form-item label="对象类型"
                    ><el-select v-model="query.entityType" clearable placeholder="全部对象类型"
                        ><el-option
                            v-for="(label, code) in AUDIT_ENTITY_TYPE_LABELS"
                            :key="code"
                            :label="label"
                            :value="code" /></el-select></el-form-item
                ><el-form-item label="开始日期"
                    ><el-date-picker
                        v-model="query.dateFrom"
                        type="date"
                        value-format="YYYY-MM-DD" /></el-form-item
                ><el-form-item label="结束日期"
                    ><el-date-picker
                        v-model="query.dateTo"
                        type="date"
                        value-format="YYYY-MM-DD" /></el-form-item
                ><el-form-item class="filter-form__actions">
                    <el-button type="primary" native-type="submit">查询</el-button>
                    <el-button @click="resetSearch">重置</el-button>
                </el-form-item></el-form
            ><el-table v-loading="loading" :data="rows"
                ><!-- @vue-generic {AuditLog} -->
                <el-table-column prop="id" label="ID" width="80" /><!-- @vue-generic {AuditLog} -->
                <el-table-column
                    prop="createdAt"
                    :label="`时间（${APP_TIME_ZONE_LABEL}）`"
                    min-width="210"
                    ><template #default="{ row }">{{
                        formatDateTime(row.createdAt)
                    }}</template> </el-table-column
                ><!-- @vue-generic {AuditLog} -->
                <el-table-column
                    prop="actorName"
                    label="操作人"
                    min-width="140"
                    show-overflow-tooltip
                    ><template #default="{ row }">
                        <span :title="row.actorId == null ? undefined : `人员 ID：${row.actorId}`">
                            {{
                                row.actorName ||
                                (row.actorId == null
                                    ? row.action === 'register'
                                        ? '未登录申请'
                                        : '系统操作'
                                    : '未知人员')
                            }}
                        </span>
                    </template> </el-table-column
                ><!-- @vue-generic {AuditLog} -->
                <el-table-column prop="action" label="动作" min-width="180" show-overflow-tooltip
                    ><template #default="{ row }"
                        ><span :title="row.action">{{
                            auditActionLabel(row.action)
                        }}</span></template
                    > </el-table-column
                ><!-- @vue-generic {AuditLog} -->
                <el-table-column prop="entityType" label="对象类型" width="120"
                    ><template #default="{ row }"
                        ><span :title="row.entityType">{{
                            auditEntityTypeLabel(row.entityType)
                        }}</span></template
                    > </el-table-column
                ><!-- @vue-generic {AuditLog} -->
                <el-table-column
                    prop="entityId"
                    label="对象 ID"
                    width="100"
                /><!-- @vue-generic {AuditLog} -->
                <el-table-column label="操作" width="110" fixed="right"
                    ><template #default="{ row }"
                        ><el-button link type="primary" @click="showDetail(row)"
                            >查看变更</el-button
                        ></template
                    ></el-table-column
                ></el-table
            ><el-pagination
                v-model:current-page="query.page"
                :page-size="query.pageSize"
                :total="total"
                layout="total, prev, pager, next"
                class="table-pagination"
                @current-change="load"
        /></template>
        <el-dialog v-model="dialog" title="脱敏变更记录" width="700px"
            ><template v-if="selected"
                ><h3>变更前</h3>
                <pre>{{ JSON.stringify(selected.beforeData, null, 2) }}</pre>
                <h3>变更后</h3>
                <pre>{{ JSON.stringify(selected.afterData, null, 2) }}</pre>
            </template></el-dialog
        >
    </el-card>
</template>
<style scoped>
pre {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    padding: 12px;
    background: var(--el-fill-color-light);
    border-radius: 4px;
}
</style>
