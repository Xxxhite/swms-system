<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ExecutionPanel from '@/views/activity/components/ExecutionPanel.vue'
defineOptions({ name: 'FieldTaskDetail' })
const route = useRoute(),
    router = useRouter(),
    id = computed(() => Number(route.params.id))
</script>
<template>
    <section>
        <el-button @click="router.push('/field/tasks')">返回我的任务</el-button>
        <ExecutionPanel :task-id="id" mobile />
    </section>
</template>
