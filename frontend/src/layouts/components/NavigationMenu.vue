<script setup lang="ts">
import SidebarItem from './SidebarItem.vue'
import { useUserStore } from '@/stores/user'
defineProps<{ active: string; closable?: boolean }>()
const emit = defineEmits<{ navigate: [] }>(),
    store = useUserStore()
</script>
<template>
    <div class="navigation-menu">
        <div class="navigation-menu__brand">
            <router-link to="/dashboard" title="返回工作台" @click="emit('navigate')">
                温馨社工服务管理系统
            </router-link>
            <el-button v-if="closable" text aria-label="关闭导航菜单" @click="emit('navigate')">
                关闭
            </el-button>
        </div>
        <el-scrollbar class="navigation-menu__scroll">
            <el-menu :default-active="active" router @select="emit('navigate')">
                <el-menu-item index="/dashboard">工作台</el-menu-item>
                <SidebarItem v-for="item in store.menus" :key="item.path" :node="item" />
            </el-menu>
        </el-scrollbar>
    </div>
</template>
<style scoped>
.navigation-menu {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--swms-sidebar-bg);
}
.navigation-menu__brand {
    min-height: 60px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 16px;
}
.navigation-menu__brand a {
    color: var(--el-color-white);
    text-decoration: none;
    font-weight: 600;
    font-size: 14px;
    flex: 1;
}
.navigation-menu__brand .el-button {
    color: var(--swms-sidebar-text);
    min-height: 44px;
}
.navigation-menu__scroll {
    flex: 1;
    min-height: 0;
}
.el-menu {
    --el-menu-bg-color: var(--swms-sidebar-bg);
    --el-menu-text-color: var(--swms-sidebar-text);
    --el-menu-hover-text-color: var(--swms-sidebar-active);
    --el-menu-active-color: var(--swms-sidebar-active);
    --el-menu-hover-bg-color: var(--swms-sidebar-hover);
    border-right: none;
}
</style>
