<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const title = computed(() => route.meta.title ?? '页面')
</script>

<template>
    <el-card class="placeholder">
        <template #header>{{ title }}</template>
        <el-empty description="待接入">
            <el-button type="primary" @click="router.push('/dashboard')">返回工作台</el-button>
        </el-empty>
    </el-card>
</template>
