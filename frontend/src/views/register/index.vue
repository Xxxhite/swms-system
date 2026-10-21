<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, type FormInstance } from 'element-plus'
import 'element-plus/es/components/message/style/css'
import { authApi } from '@/api/modules/auth'
import { useMock } from '@/api/config'
import PersonnelFields from './PersonnelFields.vue'
import { nullablePersonnel, personnelDefaults, registrationRules } from './fields'
const router = useRouter()
const form = reactive({ username: '', password: '', ...personnelDefaults() })
const formRef = ref<FormInstance>()
const busy = ref(false)
/** 校验并提交注册资料，成功后跳转登录页并带回账号。 */
async function submit() {
    if (busy.value || useMock || !(await formRef.value?.validate().catch(() => false))) return
    busy.value = true
    try {
        const { username, password, ...personnel } = form
        await authApi.register({ username, password, ...nullablePersonnel(personnel) })
        ElMessage.success('注册成功，请登录查看审核状态')
        await router.replace({ path: '/login', query: { username } })
    } catch {
        /* 请求层统一提示 */
    } finally {
        busy.value = false
    }
}
</script>
<template>
    <main class="account-page">
        <el-card class="account-card">
            <template #header><h1>员工注册</h1></template>
            <el-alert
                v-if="useMock"
                title="当前为演示模式；真实注册需在真实接口模式使用。"
                type="info"
                :closable="false"
            />
            <el-form
                ref="formRef"
                :model="form"
                :rules="registrationRules"
                label-width="100px"
                :disabled="useMock"
                @submit.prevent="submit"
            >
                <el-form-item label="账号" prop="username">
                    <el-input v-model="form.username" maxlength="32" autocomplete="username" />
                </el-form-item>
                <el-form-item label="密码" prop="password">
                    <el-input
                        v-model="form.password"
                        type="password"
                        show-password
                        autocomplete="new-password"
                        placeholder="8—128 个字符"
                    />
                </el-form-item>
                <personnel-fields :model-value="form" />
                <el-form-item class="form-actions">
                    <el-button type="primary" :loading="busy" native-type="submit">
                        提交注册
                    </el-button>
                </el-form-item>
            </el-form>
            <p><router-link to="/login">返回登录</router-link></p>
        </el-card>
    </main>
</template>
<style scoped>
.account-page {
    min-height: 100%;
    padding: 32px 16px;
    box-sizing: border-box;
    background: var(--el-bg-color-page);
}
.account-card {
    max-width: 620px;
    margin: 0 auto;
}
h1 {
    margin: 0;
    font-size: var(--swms-font-size-title);
}
.el-alert {
    margin-bottom: 20px;
}
a {
    color: var(--el-color-primary);
}
</style>
