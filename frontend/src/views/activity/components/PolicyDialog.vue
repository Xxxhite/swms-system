<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { executionApi } from '@/api/modules/execution'
import { captureLocation } from '@/utils/geolocation'
import type { ExecutionDetail, ExecutionPolicy } from '@/api/execution-types'
const open = defineModel<boolean>({ required: true }),
    props = defineProps<{ detail: ExecutionDetail }>(),
    emit = defineEmits<{ saved: [] }>(),
    model = ref<ExecutionPolicy>({ ...props.detail.policy }),
    reason = ref(''),
    busy = ref(false)
watch(open, (value) => {
    if (value) {
        model.value = { ...props.detail.policy }
        reason.value = ''
    }
})
async function locate() {
    busy.value = true
    try {
        const geo = await captureLocation()
        if (geo.status === 'OK') {
            model.value.latitude = geo.latitude!
            model.value.longitude = geo.longitude!
            ElMessage.success(`已采集参考点，当前精度约${Math.round(geo.accuracy ?? 0)}米`)
        } else ElMessage.warning('未取得参考点，请核对定位权限或填写WGS84坐标')
    } finally {
        busy.value = false
    }
}
async function save() {
    if (!reason.value.trim()) {
        ElMessage.warning('请填写规则调整原因')
        return
    }
    busy.value = true
    try {
        await executionApi.policy(
            props.detail,
            {
                ...model.value,
                latitude: model.value.latitude ?? null,
                longitude: model.value.longitude ?? null,
            },
            reason.value,
        )
        open.value = false
        emit('saved')
        ElMessage.success('规则已保存')
    } catch {
        /* 请求层提示 */
    } finally {
        busy.value = false
    }
}
</script>
<template>
    <el-dialog
        v-model="open"
        title="现场规则"
        width="min(620px, calc(100vw - 24px))"
        :close-on-click-modal="false"
        destroy-on-close
    >
        <el-alert
            title="参考点使用WGS84；服务开始后保存快照。缺少参考点时，现场记录需填写说明并等待核验。"
            type="info"
            :closable="false"
        />
        <el-form label-position="top">
            <el-form-item label="参考点纬度">
                <el-input-number v-model="model.latitude" :min="-90" :max="90" :precision="6" />
            </el-form-item>
            <el-form-item label="参考点经度">
                <el-input-number v-model="model.longitude" :min="-180" :max="180" :precision="6" />
            </el-form-item>
            <el-button :loading="busy" @click="locate">采集当前位置作为参考点</el-button>
            <el-form-item label="范围半径（米）">
                <el-input-number v-model="model.radius" :min="50" :max="5000" />
            </el-form-item>
            <el-form-item label="允许定位精度（米）">
                <el-input-number v-model="model.accuracyLimit" :min="10" :max="1000" />
            </el-form-item>
            <el-form-item label="开始前开放（分钟）">
                <el-input-number v-model="model.beforeMinutes" :min="0" :max="120" />
            </el-form-item>
            <el-form-item label="结束后收尾（分钟）">
                <el-input-number v-model="model.afterMinutes" :min="0" :max="360" />
            </el-form-item>
            <el-form-item label="迟到／早退容差（分钟）">
                <el-input-number v-model="model.toleranceMinutes" :min="0" :max="120" />
            </el-form-item>
            <el-form-item label="参与凭证有效期（分钟）">
                <el-input-number v-model="model.credentialMinutes" :min="5" :max="60" />
            </el-form-item>
            <el-form-item label="补录期限（小时）">
                <el-input-number v-model="model.supplementHours" :min="1" :max="72" />
            </el-form-item>
            <el-form-item label="调整原因" required>
                <el-input v-model="reason" type="textarea" maxlength="1000" />
            </el-form-item>
        </el-form>
        <template #footer>
            <el-button @click="open = false">关闭</el-button>
            <el-button type="primary" :loading="busy" @click="save">保存规则</el-button>
        </template>
    </el-dialog>
</template>
