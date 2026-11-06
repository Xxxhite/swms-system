<script setup lang="ts">
import { ref, onMounted, onActivated } from 'vue'
import { useRouter } from 'vue-router'
import { dashboardApi } from '@/api/modules/dashboard'
import type { DashboardOverview } from '@/api/management-types'
import { formatDateTime } from '@/utils/dateTime'
const router = useRouter(),
    data = ref<DashboardOverview>(),
    loading = ref(false),
    failed = ref(false)
let generation = 0
async function load() {
    const request = ++generation
    loading.value = true
    failed.value = false
    try {
        const result = await dashboardApi.overview()
        if (request === generation) data.value = result
    } catch {
        if (request === generation) {
            failed.value = true
            data.value = undefined
        }
    } finally {
        if (request === generation) loading.value = false
    }
}
onMounted(load)
onActivated(() => {
    if (data.value) void load()
})
</script>
<template>
    <section v-loading="loading" aria-label="职责待办">
        <div class="page-header">
            <h2>我的待办</h2>
            <el-button :loading="loading" @click="load">刷新待办</el-button>
        </div>
        <el-alert v-if="failed" title="待办读取失败，请刷新重试" type="error" :closable="false" />
        <template v-if="data">
            <div class="duties">
                <el-card v-for="g in data.groups" :key="g.key" shadow="never">
                    <template #header>
                        <strong>{{ g.title }}</strong>
                        <span v-if="!g.error">· {{ g.total }}条</span>
                    </template>
                    <el-alert v-if="g.error" :title="g.error" type="error" :closable="false" />
                    <el-empty v-else-if="!g.list.length" description="暂无待办" :image-size="48" />
                    <ul v-else>
                        <li v-for="item in g.list" :key="item.key">
                            <el-button
                                v-if="item.href"
                                link
                                type="primary"
                                @click="router.push(item.href)"
                            >
                                {{ item.title }}
                            </el-button>
                            <strong v-else>{{ item.title }}</strong>
                            <p>{{ item.detail }}</p>
                            <small v-if="item.dueDate">计划日期：{{ item.dueDate }}</small>
                        </li>
                    </ul>
                    <small v-if="g.total > g.list.length">
                        显示前{{ g.list.length }}条，进入相应业务可查看全部。
                    </small>
                </el-card>
            </div>
            <el-empty v-if="!data.groups.length" description="暂无可用职责待办" :image-size="48" />
            <el-card v-if="data.events.length" shadow="never">
                <template #header>最近业务动态</template>
                <ul>
                    <li v-for="e in data.events" :key="e.key">
                        <el-button link type="primary" @click="router.push(e.href)">
                            {{ e.title }}
                        </el-button>
                        <small>{{ formatDateTime(e.createdAt) }}</small>
                    </li>
                </ul>
            </el-card>
            <p class="duties-time">更新：{{ formatDateTime(data.generatedAt) }}</p>
        </template>
    </section>
</template>
<style scoped>
.duties {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 16px;
    margin-bottom: 16px;
}
ul {
    list-style: none;
    padding: 0;
    margin: 0;
}
li {
    padding: 10px 0;
    border-bottom: 1px solid var(--el-border-color-lighter);
    overflow-wrap: anywhere;
}
li:last-child {
    border: 0;
}
li .el-button {
    max-width: 100%;
    height: auto;
    white-space: normal;
    text-align: left;
}
p {
    margin: 6px 0;
}
small,
.duties-time {
    display: block;
    color: var(--el-text-color-secondary);
    font-size: 12px;
}
@media (max-width: 767px) {
    .duties {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
