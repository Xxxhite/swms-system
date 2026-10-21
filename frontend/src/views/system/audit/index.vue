<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useMock } from '@/api/config'
import { systemApi, type AuditLog } from '@/api/modules/system'
const rows = ref<AuditLog[]>([])
const total = ref(0)
const loading = ref(false)
const selected = ref<AuditLog>()
const dialog = ref(false)
const query = reactive({
    page: 1,
    pageSize: 20,
    actorId: undefined as number | undefined,
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
        actorId: undefined,
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
                ><el-form-item label="操作人 ID"
                    ><el-input-number
                        v-model="query.actorId"
                        :min="1"
                        :precision="0" /></el-form-item
                ><el-form-item label="动作"
                    ><el-input
                        v-model="query.action"
                        clearable
                        placeholder="如 approve-registration"
                        maxlength="100" /></el-form-item
                ><el-form-item label="对象类型"
                    ><el-input
                        v-model="query.entityType"
                        clearable
                        placeholder="如 user、role"
                        maxlength="50" /></el-form-item
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
                    label="时间（UTC）"
                    min-width="210"
                /><!-- @vue-generic {AuditLog} -->
                <el-table-column
                    prop="actorId"
                    label="操作人 ID"
                    width="110"
                /><!-- @vue-generic {AuditLog} -->
                <el-table-column
                    prop="action"
                    label="动作"
                    min-width="180"
                    show-overflow-tooltip
                /><!-- @vue-generic {AuditLog} -->
                <el-table-column
                    prop="entityType"
                    label="对象类型"
                    width="120"
                /><!-- @vue-generic {AuditLog} -->
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
