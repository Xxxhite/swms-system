<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, type FormInstance } from 'element-plus'
import 'element-plus/es/components/message/style/css'
import { authApi } from '@/api/modules/auth'
import { statusLabels, type PersonalProfile } from '@/api/types'
import { useUserStore } from '@/stores/user'
import PersonnelFields from '@/views/register/PersonnelFields.vue'
import { personnelDefaults, personnelRules, nullablePersonnel } from '@/views/register/fields'
const store = useUserStore()
const router = useRouter()
const detail = ref<PersonalProfile>()
const form = reactive(personnelDefaults())
const formRef = ref<FormInstance>()
const busy = ref(false)
/** 读取本人的审核状态及最新资料，回填可编辑的申请字段。 */
async function load() {
    try {
        detail.value = await authApi.detail()
        for (const key of Object.keys(form) as Array<keyof typeof form>)
            form[key] = detail.value[key] ?? ''
    } catch {
        /* 请求层统一提示 */
    }
}
/** 普通保存只更新资料；重新提交先保存最新资料，再将被驳回申请改回待审核。 */
async function save(resubmit = false) {
    if (busy.value || !detail.value || !(await formRef.value?.validate().catch(() => false))) return
    busy.value = true
    try {
        const saved = await authApi.updateProfile({
            ...nullablePersonnel(form),
            version: detail.value.version,
        })
        // 保存资料已递增 version，重提必须使用返回的新版本，避免触发后端版本冲突。
        if (resubmit) await authApi.resubmit(saved.version)
        await load()
        // 表单详情与登录身份分别刷新，保持页面状态、审核意见和路由分流一致。
        await store.loadProfile()
        ElMessage.success(resubmit ? '已重新提交审核' : '资料已保存')
    } catch {
        /* 请求层统一提示 */
    } finally {
        busy.value = false
    }
}
/** 退出受限会话并返回登录页，接口失败时仍完成本地清理。 */
async function logout() {
    try {
        await store.logout()
    } catch {
        /* 本地状态仍会清理 */
    } finally {
        await router.replace('/login')
    }
}
onMounted(load)
</script>
<template>
    <main class="status-page">
        <el-card class="status-card">
            <template #header><h1>注册审核状态</h1></template>
            <el-alert
                :title="`${store.profile?.name ?? ''}：${statusLabels[detail?.status ?? store.profile?.status ?? 'PENDING']}`"
                :type="detail?.status === 'REJECTED' ? 'warning' : 'info'"
                :closable="false"
            />
            <p v-if="detail?.reviewComment">审核意见：{{ detail.reviewComment }}</p>
            <p>审核通过后请重新登录。可修改下方申请资料，账号及权限由管理员审核配置。</p>
            <el-form
                v-if="detail"
                ref="formRef"
                :model="form"
                :rules="personnelRules"
                label-width="100px"
                @submit.prevent="save(false)"
            >
                <personnel-fields :model-value="form" />
                <el-form-item class="form-actions">
                    <el-button type="primary" :loading="busy" native-type="submit">
                        保存资料
                    </el-button>
                    <el-button
                        v-if="detail.status === 'REJECTED'"
                        :loading="busy"
                        @click="save(true)"
                    >
                        修改并重新提交
                    </el-button>
                </el-form-item>
            </el-form>
            <div class="actions page-actions">
                <el-button @click="load">刷新审核状态</el-button>
                <el-button @click="logout">退出登录</el-button>
            </div>
        </el-card>
    </main>
</template>
<style scoped>
.status-page {
    min-height: 100%;
    padding: 32px 16px;
    box-sizing: border-box;
    background: var(--el-bg-color-page);
}
.status-card {
    max-width: 620px;
    margin: auto;
}
h1 {
    margin: 0;
    font-size: var(--swms-font-size-title);
}
p {
    color: var(--el-text-color-regular);
}
.actions {
    margin-top: 20px;
}
</style>
