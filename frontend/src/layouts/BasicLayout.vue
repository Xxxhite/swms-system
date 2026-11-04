<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/message-box/style/css'

import NavigationMenu from '@/layouts/components/NavigationMenu.vue'
import { useViewport } from '@/composables/useViewport'
import { useUserStore } from '@/stores/user'

const { isMobile, isNarrow } = useViewport()
const menuOpen = ref(false)
const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
watch(
    () => route.fullPath,
    () => {
        menuOpen.value = false
    },
)
watch(isNarrow, () => {
    menuOpen.value = false
})

const activeMenu = computed(() =>
    route.name === 'TaskDetail'
        ? '/activity'
        : route.name === 'PlanDetail'
          ? '/service/plans'
          : route.name === 'ResourceDetail'
            ? '/resource'
            : route.name === 'ProjectDetail'
              ? '/service/contract-package-projects'
              : route.path,
)
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
        <el-aside v-if="!isNarrow" width="220px" class="layout__aside">
            <NavigationMenu :active="activeMenu" />
        </el-aside>
        <el-drawer
            v-if="isNarrow"
            v-model="menuOpen"
            direction="ltr"
            size="min(320px, calc(100vw - 40px))"
            :with-header="false"
            title="导航菜单"
            class="layout-drawer"
            append-to-body
        >
            <NavigationMenu :active="activeMenu" closable @navigate="menuOpen = false" />
        </el-drawer>

        <el-container class="layout__body">
            <el-header class="layout__header">
                <el-button
                    v-if="isNarrow"
                    class="layout__menu-button"
                    aria-label="打开导航菜单"
                    :aria-expanded="menuOpen"
                    @click="menuOpen = true"
                >
                    菜单
                </el-button>
                <span v-if="isMobile" class="layout__mobile-title">
                    {{ route.meta.title ?? '工作台' }}
                </span>
                <el-breadcrumb v-if="!isMobile" separator="/">
                    <el-breadcrumb-item
                        :to="route.path === '/dashboard' ? undefined : '/dashboard'"
                    >
                        工作台
                    </el-breadcrumb-item>
                    <el-breadcrumb-item
                        v-for="(item, index) in breadcrumb"
                        :key="index"
                        :to="
                            route.name === 'TaskDetail' && item === '服务任务'
                                ? '/activity'
                                : route.name === 'PlanDetail' && item === '阶段计划'
                                  ? '/service/plans'
                                  : route.name === 'ProjectDetail' && item === '合同包项目管理'
                                    ? '/service/contract-package-projects'
                                    : undefined
                        "
                    >
                        {{ item }}
                    </el-breadcrumb-item>
                </el-breadcrumb>

                <div class="layout__actions">
                    <!-- 展示当前用户的数据访问范围 -->
                    <el-tag v-if="!isNarrow" type="warning" effect="plain">
                        {{
                            userStore.profile?.isDevSuperadmin
                                ? userStore.profile.superadminMode === 'testing'
                                    ? '测试超级管理员'
                                    : '开发超级管理员'
                                : userStore.dataScopeText
                        }}
                    </el-tag>

                    <el-dropdown :trigger="isNarrow ? 'click' : 'hover'" @command="handleCommand">
                        <span class="layout__user" :title="`${userName}（${roleNames}）`">
                            {{ userName }}
                            <template v-if="!isNarrow">（{{ roleNames }}）</template>
                            ▾
                        </span>
                        <template #dropdown>
                            <el-dropdown-menu>
                                <el-dropdown-item command="profile">个人中心</el-dropdown-item>
                                <el-dropdown-item command="logout" divided>
                                    退出登录
                                </el-dropdown-item>
                            </el-dropdown-menu>
                        </template>
                    </el-dropdown>
                </div>
            </el-header>

            <el-main class="layout__main">
                <el-scrollbar class="layout__content-scrollbar" view-class="layout__content">
                    <router-view />
                </el-scrollbar>
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
    overflow: hidden;
    background-color: var(--swms-sidebar-bg);
}

.layout__body {
    min-width: 0;
    min-height: 0;
}

.layout__header {
    gap: 12px;
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
    min-width: 0;
}

.layout__user {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 40vw;
    display: inline-flex;
    align-items: center;
    min-height: 32px;
    font-size: 14px;
    cursor: pointer;
    outline: none;
    color: var(--el-text-color-primary);
}

.layout__main {
    min-width: 0;
    min-height: 0;
    padding: 0;
    overflow: hidden;
    background-color: var(--el-bg-color-page);
}

.layout__content-scrollbar {
    height: 100%;
}

:deep(.layout__content) {
    min-height: 100%;
    padding: var(--el-main-padding);
    box-sizing: border-box;
}
.layout__mobile-title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
}
.layout__menu-button {
    min-height: 44px;
}
@media (max-width: 1023px) {
    .layout__header {
        padding: 0 12px;
    }
    .layout__actions {
        flex-shrink: 0;
    }
    .layout__header :deep(.el-breadcrumb) {
        flex: 1;
        min-width: 0;
    }
}
@media (max-width: 767px) {
    .layout__user {
        min-height: 44px;
    }
    .layout {
        height: 100dvh;
    }
    :deep(.layout__content) {
        padding: 12px;
        padding-bottom: max(16px, env(safe-area-inset-bottom));
    }
}
</style>
