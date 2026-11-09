<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { resourceApi } from '@/api/modules/resource'
import {
    feedbackRatings,
    qualityRequest,
    type EvaluationDetail,
    type FeedbackRating,
} from '@/api/feedback-types'
import { auditActionLabel } from '@/constants/audit'
import { formatDateTime } from '@/utils/dateTime'
const props = defineProps<{ resourceId: number; cooperationId: number }>(),
    emit = defineEmits<{ saved: []; followup: [] }>()
const data = ref<EvaluationDetail>(),
    busy = ref(false),
    failed = ref(false)
const model = reactive({
        feedbackRating: 'SATISFIED' as FeedbackRating,
        result: '',
        feedback: '',
        reason: '',
    }),
    request = { content: '', key: '' }
let generation = 0
async function load() {
    const current = ++generation
    failed.value = false
    data.value = undefined
    try {
        const r = await resourceApi.evaluation(props.resourceId, props.cooperationId)
        if (current === generation) {
            data.value = r
            Object.assign(model, {
                feedbackRating: r.cooperation.feedbackRating ?? 'SATISFIED',
                result: r.cooperation.result,
                feedback: r.cooperation.feedback,
                reason: '',
            })
            request.content = ''
            request.key = ''
        }
    } catch {
        if (current === generation) failed.value = true
    }
}
async function save() {
    if (busy.value || !data.value?.canEdit) return
    if (
        (model.feedbackRating === 'NEEDS_IMPROVEMENT' && !model.feedback.trim()) ||
        (data.value.cooperation.feedbackRating && !model.reason.trim())
    ) {
        ElMessage.warning('请填写主要问题或更正原因')
        return
    }
    busy.value = true
    try {
        const input = { ...model, version: data.value.cooperation.version }
        await resourceApi.evaluate(props.resourceId, props.cooperationId, {
            ...input,
            requestKey: qualityRequest(request, input),
        })
        await load()
        emit('saved')
        ElMessage.success('评价已保存')
    } catch {
        /* 保留表单供重试 */
    } finally {
        busy.value = false
    }
}
watch(() => [props.resourceId, props.cooperationId], load, { immediate: true })
</script>
<template>
    <el-result v-if="failed" icon="error" title="合作评价读取失败">
        <template #extra><el-button @click="load">重试</el-button></template>
    </el-result>
    <template v-else-if="data">
        <h3>{{ data.cooperation.title }}</h3>
        <p>
            原评价：{{
                data.cooperation.feedbackRating
                    ? feedbackRatings[data.cooperation.feedbackRating]
                    : '未评价'
            }}
        </p>
        <el-form label-position="top" :disabled="!data.canEdit || busy" @submit.prevent="save">
            <el-form-item label="合作评价">
                <el-select v-model="model.feedbackRating">
                    <el-option
                        v-for="(label, key) in feedbackRatings"
                        :key="key"
                        :value="key"
                        :label="label"
                    />
                </el-select>
            </el-form-item>
            <el-form-item label="合作结果">
                <el-input v-model="model.result" type="textarea" maxlength="2000" />
            </el-form-item>
            <el-form-item label="反馈／建议">
                <el-input v-model="model.feedback" type="textarea" maxlength="2000" />
            </el-form-item>
            <el-form-item v-if="data.cooperation.feedbackRating" label="更正原因">
                <el-input v-model="model.reason" maxlength="1000" />
            </el-form-item>
            <el-button v-if="data.canEdit" type="primary" native-type="submit" :loading="busy">
                保存评价
            </el-button>
        </el-form>
        <el-button @click="emit('followup')">进入合作跟进</el-button>
        <el-collapse v-if="data.history.length">
            <el-collapse-item title="评价历史">
                <p v-for="h in data.history" :key="h.id">
                    {{ formatDateTime(h.createdAt) }} · {{ h.actorName }} ·
                    {{ auditActionLabel(h.action) }} · {{ h.reason }}
                </p>
            </el-collapse-item>
        </el-collapse>
    </template>
</template>
