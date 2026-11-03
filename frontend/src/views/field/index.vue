<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { executionApi } from '@/api/modules/execution'
import type { FieldTask } from '@/api/execution-types'
import { taskForms, taskStatuses } from '@/api/task-types'
import { formatDateTime } from '@/utils/dateTime'
import { useMock } from '@/api/config'
const router = useRouter(),
    rows = ref<FieldTask[]>([]),
    total = ref(0),
    page = ref(1),
    loading = ref(false)
let generation = 0
async function load(reset = false) {
    const seq = ++generation
    if (reset) page.value = 1
    if (useMock) return
    loading.value = true
    try {
        const r = await executionApi.mine(page.value)
        if (seq === generation) {
            rows.value = reset ? r.list : [...rows.value, ...r.list]
            total.value = r.total
        }
    } catch {
        /* 请求层提示 */
    } finally {
        if (seq === generation) loading.value = false
    }
}
function more() {
    page.value++
    void load()
}
onMounted(() => load(true))
</script>
<template>
    <section v-loading="loading">
        <div class="field-tasks__heading">
            <h2>我的现场任务</h2>
            <el-button @click="load(true)">刷新</el-button>
        </div>
        <el-alert
            v-if="useMock"
            title="演示模式展示手机入口；实际任务使用真实接口。"
            type="info"
            :closable="false"
        />
        <el-card v-for="t in rows" :key="t.id" class="field-tasks__card" shadow="never">
            <h3>{{ t.title }}</h3>
            <p>{{ t.projectName }}</p>
            <p>{{ formatDateTime(t.startAt) }} 至 {{ formatDateTime(t.endAt) }}</p>
            <p>{{ t.location }} · {{ taskForms[t.form] }}</p>
            <div class="field-tasks__heading">
                <el-tag>{{ taskStatuses[t.state] ?? t.state }}</el-tag>
                <el-button type="primary" @click="router.push(`/field/tasks/${t.id}`)">
                    进入现场
                </el-button>
            </div>
        </el-card>
        <el-empty v-if="!loading && !rows.length" description="暂无本人分派的现场任务" />
        <el-button
            v-if="rows.length < total"
            :loading="loading"
            class="field-tasks__more"
            @click="more"
        >
            加载更多
        </el-button>
    </section>
</template>
<style scoped>
.field-tasks__heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
}
.field-tasks__heading h2 {
    font-size: 18px;
}
.field-tasks__card {
    margin: 16px 0;
}
.field-tasks__card p {
    line-height: 1.7;
    overflow-wrap: anywhere;
    color: var(--el-text-color-secondary);
}
.field-tasks__more {
    width: 100%;
    min-height: 44px;
}
@media (max-width: 767px) {
    .field-tasks__heading {
        flex-wrap: wrap;
    }
    .field-tasks__card h3 {
        overflow-wrap: anywhere;
    }
}
</style>
