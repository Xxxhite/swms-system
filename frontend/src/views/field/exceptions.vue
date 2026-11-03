<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { executionApi } from '@/api/modules/execution'
import { useMock } from '@/api/config'
import { formatDateTime } from '@/utils/dateTime'
import type { ExecutionException } from '@/api/execution-types'
defineOptions({ name: 'FieldExceptionList' })
const rows = ref<ExecutionException[]>([]),
    loading = ref(false)
async function load() {
    if (useMock) return
    loading.value = true
    try {
        rows.value = await executionApi.exceptions()
    } catch {
        /* 请求层提示 */
    } finally {
        loading.value = false
    }
}
async function download(f: { id: number; name: string }) {
    try {
        const blob = await executionApi.download(f.id),
            url = URL.createObjectURL(blob),
            a = document.createElement('a')
        a.href = url
        a.download = f.name
        a.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
        /* 请求层提示 */
    }
}
onMounted(load)
</script>
<template>
    <section v-loading="loading">
        <div class="field-exceptions__header">
            <h2>异常与核验来源</h2>
            <el-button @click="load">刷新</el-button>
        </div>
        <p>查看本人、所负责任务及实际主管关系授权的来源。最终核验随档案审批处理。</p>
        <el-card v-for="e in rows" :key="e.id" shadow="never" class="field-exceptions__card">
            <h3>{{ e.title }} · {{ e.label }}</h3>
            <p>{{ e.ownerName }} · 主管 {{ e.reviewerName || '未配置' }}</p>
            <el-tag :type="e.status === 'RESOLVED' ? 'success' : 'warning'">
                {{
                    e.status === 'RESOLVED'
                        ? '已由后续记录解决'
                        : e.status === 'EXPLAINED'
                          ? '已说明·待核验'
                          : '待说明／核验'
                }}
            </el-tag>
            <template v-if="e.source">
                <p>
                    发生：{{ formatDateTime(e.source.occurredAt) }}；提交：{{
                        formatDateTime(e.source.receivedAt)
                    }}
                </p>
                <p>{{ e.source.reason }}</p>
                <p v-if="e.source.geo.status === 'OK'">
                    距离{{ Math.round(e.source.distance ?? 0) }}米，精度{{
                        Math.round(e.source.geo.accuracy ?? 0)
                    }}米
                </p>
            </template>
            <p v-for="(n, index) in e.notes" :key="index">
                {{ formatDateTime(n.createdAt) }} · {{ n.reason }}
            </p>
            <el-button
                v-for="f in e.evidence ?? []"
                :key="f.id"
                link
                type="primary"
                @click="download(f)"
            >
                {{ f.name }}
            </el-button>
        </el-card>
        <el-empty v-if="!loading && !rows.length" description="暂无授权异常" />
    </section>
</template>
<style scoped>
.field-exceptions__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
}
.field-exceptions__header h2 {
    font-size: 18px;
}
.field-exceptions__card {
    margin: 16px 0;
}
.field-exceptions__card p {
    overflow-wrap: anywhere;
    line-height: 1.7;
}
</style>
