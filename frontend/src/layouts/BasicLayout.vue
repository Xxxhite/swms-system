<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/message-box/style/css'

import SidebarItem from '@/layouts/components/SidebarItem.vue'
import { useUserStore } from '@/stores/user'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const activeMenu = computed(() => route.path)
const breadcrumb = computed(() =>
    route.path === '/dashboard' ? [] : [...(route.meta.parents ?? []), route.meta.title ?? ''],
)
const userName = computed(() => userStore.profile?.name ?? '')
const roleNames = computed(() => userStore.profile?.roleNames.join('/') ?? '')

/** 处理用户菜单命令：确认退出并清理会话，或打开个人中心。 */
async function handleCommand(command: string): Promise<void> {
    if (command === 'logout') {
        try {
            await ElMessageBox.confirm('确定要退出登录吗？', '提示', { type: 'warning' })
        } catch {
            return
        }
        try {
            await userStore.logout()
        } catch {
            // 接口失败的提示由请求层负责，本地会话仍然已清理。
        } finally {
            await router.replace('/login')
        }
        return
    }
    await router.push('/profile')
}
</script>

<template>
    <el-container class="layout">
        <el-aside width="220px" class="layout__aside">
            <router-link to="/dashboard" class="layout__brand" title="返回工作台">
                温馨社工服务管理系统
            </router-link>
            <el-menu :default-active="activeMenu" router class="layout__menu">
                <el-menu-item index="/dashboard">工作台</el-menu-item>
                <sidebar-item v-for="item in userStore.menus" :key="item.path" :node="item" />
            </el-menu>
        </el-aside>

        <el-container>
            <el-header class="layout__header">
                <el-breadcrumb separator="/">
                    <el-breadcrumb-item
                        :to="route.path === '/dashboard' ? undefined : '/dashboard'"
                    >
                        工作台
                    </el-breadcrumb-item>
                    <el-breadcrumb-item v-for="(item, index) in breadcrumb" :key="index">
                        {{ item }}
                    </el-breadcrumb-item>
                </el-breadcrumb>

                <div class="layout__actions">
                    <!-- 展示当前用户的数据访问范围 -->
                    <el-tag type="warning" effect="plain">{{ userStore.dataScopeText }}</el-tag>

                    <el-dropdown @command="handleCommand">
                        <span class="layout__user">{{ userName }}（{{ roleNames }}）▾</span>
                        <template #dropdown>
                            <el-dropdown-menu>
                                <el-dropdown-item command="profile">个人中心</el-dropdown-item>
                                <el-dropdown-item command="logout" divided
                                    >退出登录</el-dropdown-item
                                >
                            </el-dropdown-menu>
                        </template>
                    </el-dropdown>
                </div>
            </el-header>

            <el-main class="layout__main">
                <router-view />
            </el-main>
        </el-container>
    </el-container>
</template>

<style scoped>
.layout {
    height: 100%;
}

.layout__aside {
    display: flex;
    flex-direction: column;
    background-color: var(--swms-sidebar-bg);
}

.layout__brand {
    height: 56px;
    flex: none;
    display: flex;
    align-items: center;
    padding: 0 16px;
    color: var(--el-color-white);
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 0.5px;
    text-decoration: none;
}

.layout__brand:hover {
    background-color: var(--swms-sidebar-hover);
}

.layout__brand:focus-visible {
    outline: 2px solid var(--swms-sidebar-active);
    outline-offset: -2px;
}

.layout__menu {
    --el-menu-bg-color: var(--swms-sidebar-bg);
    --el-menu-text-color: var(--swms-sidebar-text);
    --el-menu-hover-text-color: var(--swms-sidebar-active);
    --el-menu-active-color: var(--swms-sidebar-active);
    --el-menu-hover-bg-color: var(--swms-sidebar-hover);

    flex: 1;
    overflow-y: auto;
    border-right: none;
}

.layout__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background-color: var(--el-bg-color);
    border-bottom: 1px solid var(--el-border-color-light);
}

.layout__actions {
    display: flex;
    align-items: center;
    gap: 16px;
}

.layout__user {
    cursor: pointer;
    outline: none;
    color: var(--el-text-color-primary);
}

.layout__main {
    background-color: var(--el-bg-color-page);
}
</style>
