<script setup lang="ts">
import type { MenuNode } from '@/router/routes'

defineOptions({ name: 'ShortcutItem' })
defineProps<{ node: MenuNode }>()
</script>

<template>
    <div v-if="node.children?.length" class="shortcut-group">
        <p class="shortcut-group__title">{{ node.title }}</p>
        <div class="shortcut-group__items">
            <shortcut-item v-for="child in node.children" :key="child.path" :node="child" />
        </div>
    </div>
    <router-link v-else :to="node.path" class="shortcut-link">
        <span>{{ node.title }}</span>
        <span aria-hidden="true">→</span>
    </router-link>
</template>

<style scoped>
.shortcut-group {
    grid-column: 1 / -1;
}
.shortcut-group__title {
    margin: 4px 0 10px;
    color: #606266;
    font-weight: 600;
}
.shortcut-group__items {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: 10px;
}
.shortcut-link {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    border: 1px solid #dcdfe6;
    border-radius: 6px;
    color: #303133;
    text-decoration: none;
    background: #fff;
}
.shortcut-link:hover {
    color: #337ecc;
    border-color: #a0cfff;
    background: #ecf5ff;
}
.shortcut-link:focus-visible {
    outline: 2px solid #409eff;
    outline-offset: 2px;
}
</style>
