<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { participationApi } from '@/api/modules/participation'
import type { ParticipationPage } from '@/api/execution-types'
import { formatDateTime } from '@/utils/dateTime'
import { useMock } from '@/api/config'
const route = useRoute(),
    data = ref<ParticipationPage>(),
    loading = ref(false),
    busy = ref(false),
    error = ref(''),
    role = ref<'SELF' | 'FAMILY' | 'COMPANION'>('SELF'),
    relation = ref(''),
    requestKey = ref(''),
    now = ref(Date.now())
const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : '')),
    expired = computed(() => !!data.value && Date.parse(data.value.expiresAt) <= now.value)
const timer = setInterval(() => {
    now.value = Date.now()
}, 1000)
onUnmounted(() => clearInterval(timer))
let generation = 0
async function load() {
    const seq = ++generation
    data.value = undefined
    error.value = ''
    requestKey.value = crypto.randomUUID()
    role.value = 'SELF'
    relation.value = ''
    if (useMock) {
        error.value = '参与确认使用真实服务凭证'
        return
    }
    if (!/^[A-Za-z0-9_-]{43}$/.test(token.value)) {
        error.value = '参与凭证无效或已失效，请联系现场工作人员'
        return
    }
    loading.value = true
    try {
        const result = await participationApi.resolve(token.value)
        if (seq === generation) data.value = result
    } catch {
        if (seq === generation) error.value = '参与凭证无效或已失效，请联系现场工作人员'
    } finally {
        if (seq === generation) loading.value = false
    }
}
async function confirm() {
    if (!data.value || busy.value || expired.value) return
    if (role.value !== 'SELF' && !relation.value.trim()) {
        ElMessage.warning('请填写与服务对象的关系')
        return
    }
    const current = token.value
    busy.value = true
    try {
        await participationApi.confirm(current, role.value, relation.value.trim(), requestKey.value)
        if (current === token.value && data.value) {
            data.value.recorded = true
            data.value.canConfirm = false
            ElMessage.success('本次参与已登记')
        }
    } catch {
        /* 公开客户端提示，不修改工作人员会话 */
    } finally {
        busy.value = false
    }
}
watch(token, load, { immediate: true })
watch([role, relation], () => {
    requestKey.value = crypto.randomUUID()
})
</script>
<template>
    <main class="participation-page" v-loading="loading">
        <el-card shadow="never">
            <h1>本次服务参与确认</h1>
            <el-alert v-if="error" :title="error" type="warning" :closable="false" />
            <template v-if="data">
                <h2>{{ data.title }}</h2>
                <p>服务时间：{{ formatDateTime(data.date) }}</p>
                <p>对象称呼：{{ data.name }}</p>
                <p>凭证有效至：{{ formatDateTime(data.expiresAt) }}</p>
                <el-result
                    v-if="data.recorded"
                    icon="success"
                    title="本次参与已登记"
                    sub-title="感谢配合，可关闭本页。"
                />
                <el-alert
                    v-else-if="expired"
                    title="参与凭证已过期，请联系现场工作人员"
                    type="warning"
                    :closable="false"
                />
                <el-form v-else-if="data.canConfirm" label-position="top">
                    <template v-if="data.purpose === 'HOME_CONFIRM'">
                        <el-form-item label="确认人角色">
                            <el-radio-group v-model="role">
                                <el-radio value="SELF">本人</el-radio>
                                <el-radio value="FAMILY">家属</el-radio>
                                <el-radio value="COMPANION">陪同人</el-radio>
                            </el-radio-group>
                        </el-form-item>
                        <el-form-item v-if="role !== 'SELF'" label="与服务对象关系" required>
                            <el-input v-model="relation" maxlength="200" />
                        </el-form-item>
                    </template>
                    <p>
                        {{
                            data.purpose === 'HOME_CONFIRM'
                                ? '请确认本次入户服务已经发生。'
                                : '请确认本人已参与本次服务。'
                        }}
                    </p>
                    <el-button
                        type="primary"
                        :loading="busy"
                        class="participation-page__confirm"
                        @click="confirm"
                    >
                        确认本次参与
                    </el-button>
                </el-form>
            </template>
        </el-card>
    </main>
</template>
<style scoped>
.participation-page {
    max-width: 560px;
    margin: 0 auto;
    padding: 24px 16px;
    box-sizing: border-box;
}
.participation-page h1 {
    font-size: 20px;
}
.participation-page h2 {
    font-size: 18px;
    overflow-wrap: anywhere;
}
.participation-page p {
    line-height: 1.8;
    color: var(--el-text-color-secondary);
}
.participation-page__confirm {
    width: 100%;
    min-height: 48px;
    margin-top: 16px;
}
</style>
