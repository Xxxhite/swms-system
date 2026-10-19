<script setup lang="ts">
import type { MenuNode } from '@/router/routes'

// 显式声明组件名，供模板递归渲染子菜单。
defineOptions({ name: 'SidebarItem' })

defineProps<{ node: MenuNode }>()
</script>

<template>
    <el-sub-menu v-if="node.children?.length" :index="node.path">
        <template #title>{{ node.title }}</template>
        <sidebar-item v-for="child in node.children" :key="child.path" :node="child" />
    </el-sub-menu>

    <el-menu-item v-else :index="node.path">{{ node.title }}</el-menu-item>
</template>
