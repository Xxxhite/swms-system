<script setup lang="ts">
import { ElConfigProvider } from 'element-plus'
import zhCN from 'element-plus/es/locale/lang/zh-cn'
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { LAYOUT_NAME } from '@/router/routes'

const route = useRoute()
/** 业务布局自行管理侧栏和内容滚动，公开长页面使用根级滚动容器。 */
const hasLayout = computed(() => route.matched.some((record) => record.name === LAYOUT_NAME))
</script>

<template>
    <el-config-provider :locale="zhCN" size="default" :z-index="3000">
        <router-view v-slot="{ Component }">
            <component :is="Component" v-if="hasLayout" />
            <el-scrollbar v-else height="100%" view-class="app__page-view">
                <component :is="Component" />
            </el-scrollbar>
        </router-view>
    </el-config-provider>
</template>

<style scoped>
:deep(.app__page-view) {
    min-height: 100%;
}
</style>
