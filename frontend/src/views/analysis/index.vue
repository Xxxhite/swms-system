<script setup lang="ts">
import { computed, ref } from 'vue'
import { useUserStore } from '@/stores/user'
import type { ReportKind } from '@/api/management-types'
import { reportLabels } from '@/api/management-types'
import QualityReport from './components/QualityReport.vue'
import ReportView from './components/ReportView.vue'
const store = useUserStore()
const kinds = computed(
    () =>
        Object.entries(reportLabels).filter(
            ([kind]) =>
                kind === 'progress' ||
                (kind === 'tasks' && store.hasPermission('activity:view')) ||
                (kind === 'approvals' &&
                    (store.hasPermission('service:monthly:view') ||
                        store.hasPermission('service:monthly:approve'))) ||
                (kind === 'resources' && store.hasPermission('resource:view')),
        ) as [ReportKind, string][],
)
const active = ref<ReportKind | 'quality'>('progress')
</script>
<template>
    <el-card>
        <template #header><h2>数据分析</h2></template>
        <template v-if="store.hasPermission('analysis:report:view')">
            <el-tabs v-model="active">
                <el-tab-pane
                    v-for="[kind, title] in kinds"
                    :key="kind"
                    :label="title"
                    :name="kind"
                />
                <el-tab-pane
                    v-if="
                        store.hasPermission('service:feedback:view') ||
                        store.hasPermission('resource:view')
                    "
                    label="质量反馈"
                    name="quality"
                />
            </el-tabs>
            <QualityReport v-if="active === 'quality'" />
            <ReportView v-else :key="active" :kind="active" />
        </template>
        <el-empty v-else description="暂无分析查询权限" />
    </el-card>
</template>
