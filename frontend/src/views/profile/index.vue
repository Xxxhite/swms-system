<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import 'element-plus/es/components/message/style/css'
import { useMock } from '@/api/config'
import { authApi } from '@/api/modules/auth'
import type { PersonalProfile } from '@/api/types'
import { useUserStore } from '@/stores/user'
const router = useRouter()
const store = useUserStore()
const detail = ref<PersonalProfile>()
const form = reactive({ phone: '', socialWorkerNo: '' })
const passwords = reactive({ oldPassword: '', newPassword: '', confirm: '' })
const busy = ref(false)
/** 加载本人资料及版本，回填个人中心可编辑的联系信息。 */
async function load() {
    if (useMock) return
    try {
        detail.value = await authApi.detail()
        form.phone = detail.value.phone
        form.socialWorkerNo = detail.value.socialWorkerNo ?? ''
    } catch {
        /* 请求层统一提示 */
    }
}
/** 提交本人联系资料并刷新版本，避免后续保存沿用旧版本。 */
async function save() {
    if (busy.value || !detail.value) return
    if (!form.phone.trim()) {
        ElMessage.warning('请填写联系电话')
        return
    }
    busy.value = true
    try {
        await authApi.updateProfile({
            phone: form.phone,
            socialWorkerNo: form.socialWorkerNo || null,
            version: detail.value.version,
        })
        await load()
        ElMessage.success('资料已保存')
    } catch {
        /* 请求层统一提示 */
    } finally {
        busy.value = false
    }
}
/** 校验两次新密码后申请改密，成功即清理本地会话并返回登录页。 */
async function changePassword() {
    if (busy.value) return
    if (
        !passwords.oldPassword ||
        passwords.newPassword.length < 8 ||
        passwords.newPassword.length > 128 ||
        passwords.newPassword !== passwords.confirm
    ) {
        ElMessage.warning('请填写原密码，并确认两次新密码一致且为 8—128 字符')
        return
    }
    busy.value = true
    try {
        await authApi.changePassword(passwords.oldPassword, passwords.newPassword)
        store.resetSession()
        ElMessage.success('密码已修改，请重新登录')
        await router.replace('/login')
    } catch {
        /* 请求层统一提示 */
    } finally {
        busy.value = false
    }
}
onMounted(load)
</script>
<template>
    <el-card>
        <template #header>个人中心</template>
        <el-descriptions :column="2" border>
            <el-descriptions-item label="姓名">{{ store.profile?.name }}</el-descriptions-item>
            <el-descriptions-item label="所属组织">
                {{ store.profile?.orgName ?? '未分配' }}
            </el-descriptions-item>
            <el-descriptions-item label="角色">
                {{ store.profile?.roleNames.join('、') }}
            </el-descriptions-item>
            <el-descriptions-item label="数据范围">{{ store.dataScopeText }}</el-descriptions-item>
        </el-descriptions>
        <el-alert
            v-if="useMock"
            class="notice"
            title="演示模式仅展示身份，资料维护请使用真实接口模式。"
            type="info"
            :closable="false"
        />
        <div v-else class="forms">
            <el-form label-width="110px" @submit.prevent="save">
                <h2>个人资料</h2>
                <el-form-item label="联系电话">
                    <el-input v-model="form.phone" maxlength="32" />
                </el-form-item>
                <el-form-item label="社工号">
                    <el-input v-model="form.socialWorkerNo" maxlength="100" />
                </el-form-item>
                <el-form-item class="form-actions">
                    <el-button
                        type="primary"
                        native-type="submit"
                        :disabled="!detail"
                        :loading="busy"
                    >
                        保存资料
                    </el-button>
                </el-form-item>
            </el-form>
            <el-form label-width="110px" @submit.prevent="changePassword">
                <h2>修改密码</h2>
                <el-form-item label="原密码">
                    <el-input v-model="passwords.oldPassword" type="password" show-password />
                </el-form-item>
                <el-form-item label="新密码">
                    <el-input v-model="passwords.newPassword" type="password" show-password />
                </el-form-item>
                <el-form-item label="确认新密码">
                    <el-input v-model="passwords.confirm" type="password" show-password />
                </el-form-item>
                <el-form-item class="form-actions">
                    <el-button type="primary" native-type="submit" :loading="busy">
                        修改密码
                    </el-button>
                </el-form-item>
            </el-form>
        </div>
    </el-card>
</template>
<style scoped>
.forms {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 40px;
    margin-top: 24px;
}
h2 {
    font-size: 16px;
    margin: 0 0 20px;
}
.notice {
    margin-top: 20px;
}
</style>
