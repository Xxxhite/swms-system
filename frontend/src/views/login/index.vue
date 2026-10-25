<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import 'element-plus/es/components/message/style/css'

import { useMock } from '@/api/config'
import type { LoginPayload } from '@/api/types'
import { useUserStore } from '@/stores/user'
import TestAccountPicker from './components/TestAccountPicker.vue'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

const formRef = ref<FormInstance>()
const submitting = ref(false)
const showTestAccounts = import.meta.env.DEV

const form = reactive({
    username: useMock ? 'admin' : '',
    password: useMock ? '123456' : '',
})

const rules: FormRules = {
    username: [{ required: true, message: '请输入账号', trigger: 'blur' }],
    password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

/** 快捷操作只回填表单并清除旧校验提示，由用户手动提交登录。 */
function fillTestAccount(account: LoginPayload) {
    if (submitting.value) return
    Object.assign(form, account)
    formRef.value?.clearValidate()
}

/** 校验表单并登录，受限账号进入审核页，启用账号恢复合法站内目标或工作台。 */
async function submit(): Promise<void> {
    const valid = await formRef.value?.validate().catch(() => false)
    if (!valid) return

    submitting.value = true
    try {
        await userStore.login({ username: form.username, password: form.password })
        ElMessage.success('登录成功')
        const target = typeof route.query.redirect === 'string' ? route.query.redirect : ''
        const redirect = userStore.restricted
            ? '/account-status'
            : target.startsWith('/') &&
                !target.startsWith('//') &&
                !['/login', '/register', '/account-status'].includes(target.split('?')[0]!)
              ? target
              : '/dashboard'
        await router.replace(redirect)
    } catch {
        // 失败提示由响应拦截器统一给出，这里不重复弹
    } finally {
        submitting.value = false
    }
}
</script>

<template>
    <div class="login">
        <el-card class="login__card">
            <div class="login__title">温馨社工服务信息管理系统</div>

            <el-form ref="formRef" :model="form" :rules="rules" size="large" @keyup.enter="submit">
                <el-form-item prop="username">
                    <el-input v-model="form.username" placeholder="账号" clearable />
                </el-form-item>
                <el-form-item prop="password">
                    <el-input
                        v-model="form.password"
                        type="password"
                        placeholder="密码"
                        show-password
                    />
                </el-form-item>
                <el-button
                    type="primary"
                    class="login__submit"
                    :loading="submitting"
                    @click="submit"
                >
                    登 录
                </el-button>
            </el-form>
            <p class="login__register"><router-link to="/register">员工注册</router-link></p>

            <TestAccountPicker
                v-if="showTestAccounts"
                :disabled="submitting"
                @select="fillTestAccount"
            />
        </el-card>
    </div>
</template>

<style scoped>
.login {
    /* 直接使用视口高度，避免滚动容器的自动高度使登录页只包住卡片。 */
    min-height: 100vh;
    min-height: 100dvh;
    padding: 24px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, var(--swms-sidebar-bg) 0%, var(--swms-sidebar-hover) 100%);
}

.login__card {
    width: 420px;
    max-width: 100%;
}

.login__title {
    font-size: var(--swms-font-size-title);
    margin: 8px 0 28px;
    font-weight: 600;
    text-align: center;
}

.login__submit {
    width: 100%;
}

.login__register {
    text-align: center;
}
.login__register a {
    color: var(--el-color-primary);
}
</style>
