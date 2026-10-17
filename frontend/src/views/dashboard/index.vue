<script setup lang="ts">
import { computed } from 'vue'

import { useMock } from '@/api/config'
import { useUserStore } from '@/stores/user'
import ShortcutItem from './components/ShortcutItem.vue'

const userStore = useUserStore()
const displayName = computed(() => userStore.profile?.name?.trim() || '用户')
const teamName = computed(() => userStore.profile?.teamName?.trim() || '未设置')
const roleNames = computed(() => userStore.profile?.roleNames.join('、') || '未设置')
</script>

<template>
    <div class="dashboard">
        <section class="dashboard__welcome" aria-labelledby="welcome-title">
            <p class="dashboard__eyebrow">工作台</p>
            <h1 id="welcome-title">{{ displayName }}，你好</h1>
            <p class="dashboard__intro">从下方选择功能，开始今天的工作。</p>
            <dl class="dashboard__identity">
                <div>
                    <dt>所属团队</dt>
                    <dd>{{ teamName }}</dd>
                </div>
                <div>
                    <dt>角色</dt>
                    <dd>{{ roleNames }}</dd>
                </div>
                <div>
                    <dt>数据范围</dt>
                    <dd>{{ userStore.dataScopeText || '未设置' }}</dd>
                </div>
            </dl>
        </section>

        <section aria-labelledby="shortcuts-title">
            <h2 id="shortcuts-title" class="dashboard__section-title">常用功能</h2>
            <div v-if="userStore.menus.length" class="dashboard__shortcuts">
                <section
                    v-for="menu in userStore.menus"
                    :key="menu.path"
                    class="dashboard__module"
                    :class="{ 'dashboard__module--group': menu.children?.length }"
                    :aria-label="menu.title"
                >
                    <template v-if="menu.children?.length">
                        <h3>{{ menu.title }}</h3>
                        <div class="dashboard__module-items">
                            <shortcut-item
                                v-for="child in menu.children"
                                :key="child.path"
                                :node="child"
                            />
                        </div>
                    </template>
                    <shortcut-item v-else :node="menu" />
                </section>
            </div>
            <el-empty v-else description="暂无可用功能，请联系管理员配置权限。" />
        </section>

        <el-alert
            v-if="useMock"
            type="info"
            show-icon
            :closable="false"
            title="当前为演示环境，数据为模拟数据。"
        />
    </div>
</template>

<style scoped>
.dashboard {
    display: grid;
    gap: 24px;
    max-width: 1200px;
    margin: 0 auto;
}
.dashboard__welcome {
    padding: 28px;
    border: 1px solid var(--el-border-color-light);
    border-radius: 8px;
    background: linear-gradient(120deg, var(--el-bg-color) 35%, var(--el-color-primary-light-9));
}
.dashboard__eyebrow {
    margin: 0 0 8px;
    color: var(--el-color-primary-dark-2);
    font-size: 13px;
}
.dashboard__welcome h1 {
    margin: 0;
    font-size: 26px;
    color: var(--el-text-color-primary);
}
.dashboard__intro {
    margin: 10px 0 24px;
    color: var(--el-text-color-regular);
}
.dashboard__identity {
    display: flex;
    flex-wrap: wrap;
    gap: 20px 40px;
    margin: 0;
}
.dashboard__identity dt {
    margin-bottom: 6px;
    font-size: 13px;
    color: var(--el-text-color-regular);
}
.dashboard__identity dd {
    margin: 0;
    color: var(--el-text-color-primary);
    font-weight: 500;
}
.dashboard__section-title {
    margin: 0 0 14px;
    font-size: 18px;
    color: var(--el-text-color-primary);
}
.dashboard__shortcuts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 16px;
}
.dashboard__module {
    padding: 16px;
    border: 1px solid var(--el-border-color-light);
    border-radius: 8px;
    background: var(--el-bg-color);
}
.dashboard__module--group {
    grid-column: 1 / -1;
}
.dashboard__module h3 {
    margin: 0 0 14px;
    font-size: 16px;
    color: var(--el-text-color-primary);
}
.dashboard__module-items {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 14px;
}
</style>
