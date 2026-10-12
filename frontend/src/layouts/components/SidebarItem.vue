<script setup lang="ts">
import type {MenuNode} from '@/router/routes'

// 递归组件：给个显式名字，模板里用自己的标签名渲染子级
defineOptions({name: 'SidebarItem'})

defineProps<{node: MenuNode}>()
</script>

<template>
    <el-sub-menu v-if="node.children?.length" :index="node.path">
        <template #title>{{ node.title }}</template>
        <sidebar-item v-for="child in node.children" :key="child.path" :node="child"/>
    </el-sub-menu>

    <el-menu-item v-else :index="node.path">{{ node.title }}</el-menu-item>
</template>
