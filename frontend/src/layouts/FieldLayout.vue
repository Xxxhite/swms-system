<script setup lang="ts">
import { useUserStore } from '@/stores/user'
import { useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
const store = useUserStore(),
    router = useRouter()
async function logout() {
    try {
        await ElMessageBox.confirm('退出后清理本机现场页面的登录状态。', '退出登录')
        try {
            await store.logout()
        } finally {
            await router.replace('/login')
        }
    } catch {
        /* 取消或请求层提示 */
    }
}
</script>
<template>
    <section class="field-layout">
        <header>
            <strong>手机现场</strong>
            <span>{{ store.profile?.name }}</span>
            <el-button text @click="logout">退出登录</el-button>
        </header>
        <nav>
            <router-link to="/field/tasks">我的任务</router-link>
            <router-link
                v-if="store.hasPermission('service:exception:view')"
                to="/field/exceptions"
            >
                异常与核验
            </router-link>
            <router-link to="/dashboard">工作台</router-link>
        </nav>
        <el-scrollbar class="field-layout__body" view-class="field-layout__content">
            <router-view />
        </el-scrollbar>
    </section>
</template>
<style scoped>
.field-layout {
    height: 100%;
    display: flex;
    flex-direction: column;
    max-width: 860px;
    margin: 0 auto;
    background: var(--el-bg-color);
}
header {
    display: flex;
    gap: 12px;
    align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid var(--el-border-color);
}
header strong {
    flex: 1;
}
nav {
    display: flex;
    justify-content: space-around;
    gap: 8px;
    padding: 12px;
    border-bottom: 1px solid var(--el-border-color);
}
nav a {
    color: var(--el-text-color-regular);
    text-decoration: none;
    padding: 8px;
    border-radius: 4px;
}
nav a.router-link-exact-active {
    color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
}
.field-layout__body {
    flex: 1;
    min-height: 0;
}
.field-layout :deep(.field-layout__content) {
    padding: 16px;
    box-sizing: border-box;
}
@media (max-width: 767px) {
    .field-layout {
        height: 100dvh;
    }
    header {
        padding: 8px 12px;
        gap: 8px;
    }
    header span {
        max-width: 35%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    nav {
        padding: 4px;
        gap: 0;
        flex-wrap: wrap;
    }
    nav a {
        min-height: 44px;
        display: flex;
        align-items: center;
        box-sizing: border-box;
    }
    .field-layout :deep(.field-layout__content) {
        padding: 12px;
        padding-bottom: max(16px, env(safe-area-inset-bottom));
    }
}
</style>
