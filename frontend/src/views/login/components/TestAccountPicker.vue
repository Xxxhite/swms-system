<script setup lang="ts">
import { computed } from 'vue'
import { useMock } from '@/api/config'
import { mockAccountsHint } from '@/mock/auth'
import type { LoginPayload } from '@/api/types'

defineProps<{ disabled?: boolean }>()
const emit = defineEmits<{ select: [account: LoginPayload] }>()

const accounts = computed(() => {
    if (!import.meta.env.DEV) return []
    if (useMock) return mockAccountsHint

    const administratorPassword = import.meta.env.VITE_DEV_ADMIN_PASSWORD || ''
    const demoPassword = import.meta.env.VITE_DEV_DEMO_PASSWORD || ''
    return [
        { username: 'admin', roleName: '机构管理员', password: administratorPassword },
        { username: 'project_manager', roleName: '项目总监', password: demoPassword },
        { username: 'supervisor', roleName: '高级主任（兼督导）', password: demoPassword },
        { username: 'department', roleName: '部门总监', password: demoPassword },
        { username: 'leader', roleName: '团队主任', password: demoPassword },
        { username: 'social', roleName: '社工甲', password: demoPassword },
        { username: 'other_social', roleName: '社工乙', password: demoPassword },
        { username: 'intern', roleName: '实习生', password: demoPassword },
        { username: 'pending', roleName: '待审核人员', password: demoPassword },
    ]
})
</script>

<template>
    <section v-if="accounts.length" class="test-accounts" aria-label="测试账号快捷填入">
        <h2 class="test-accounts__title">测试账号</h2>
        <p class="test-accounts__tip">点击填入后登录；未预填密码时请手动输入。</p>
        <div class="test-accounts__grid">
            <el-button
                v-for="account in accounts"
                :key="account.username"
                class="test-accounts__button"
                :disabled="disabled"
                native-type="button"
                @click="emit('select', { username: account.username, password: account.password })"
            >
                <span class="test-accounts__label">
                    <span>{{ account.roleName }}</span>
                    <span class="test-accounts__username">{{ account.username }}</span>
                </span>
            </el-button>
        </div>
    </section>
</template>

<style scoped>
.test-accounts {
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid var(--el-border-color-light);
}

.test-accounts__title {
    margin: 0 0 8px;
    font-size: 14px;
    font-weight: 600;
}

.test-accounts__tip {
    margin: 0 0 12px;
    color: var(--el-text-color-secondary);
    line-height: 1.6;
}

.test-accounts__grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
}

.test-accounts__button {
    width: 100%;
    height: auto;
    margin-left: 0;
    padding: 10px 8px;
}

.test-accounts__label {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.test-accounts__username {
    color: var(--el-text-color-secondary);
    font-size: 12px;
}
</style>
