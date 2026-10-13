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
        <el-empty description="页面待接入">
            <div class="placeholder__tip">
                该模块的页面和接口要等数据库表结构确定后再实现。<br />
                路由、菜单和权限判断已经跑通，现在可以直接演示「不同角色看到不同菜单」。
            </div>
            <el-button type="primary" @click="router.push('/dashboard')">返回工作台</el-button>
        </el-empty>
    </el-card>
</template>

<style scoped>
.placeholder__tip {
    margin-bottom: 16px;
    color: #909399;
    line-height: 1.8;
}
</style>
