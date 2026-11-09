<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { feedbackApi } from '@/api/modules/feedback'
import {
    emptyFeedback,
    feedbackSources,
    qualityRequest,
    type FeedbackDetail,
} from '@/api/feedback-types'
import { auditActionLabel } from '@/constants/audit'
import { formatDateTime } from '@/utils/dateTime'
const props = defineProps<{ taskId: number }>(),
    router = useRouter()
const data = ref<FeedbackDetail>(),
    busy = ref(false),
    failed = ref(false),
    editing = ref(false)
const model = reactive(emptyFeedback()),
    request = { content: '', key: '' }
const total = computed(() => model.satisfiedCount + model.neutralCount + model.dissatisfiedCount)
let generation = 0
async function load() {
    const current = ++generation
    failed.value = false
    try {
        const result = await feedbackApi.detail(props.taskId)
        if (current === generation) {
            data.value = result
            editing.value = false
        }
    } catch {
        if (current === generation) {
            failed.value = true
            data.value = undefined
        }
    }
}
function edit() {
    const row = data.value?.feedback
    Object.assign(model, emptyFeedback(), row ?? {}, {
        reason: '',
        feedbackDate:
            row?.feedbackDate ??
            new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }),
    })
    request.content = ''
    request.key = ''
    editing.value = true
}
async function save() {
    if (busy.value) return
    if (
        !total.value ||
        total.value > 100000 ||
        (model.dissatisfiedCount > 0 && !model.suggestions.trim()) ||
        (model.source === 'OTHER' && !model.sourceNote.trim()) ||
        !model.feedbackDate ||
        (data.value?.feedback && !model.reason?.trim())
    ) {
        ElMessage.warning('请核对反馈份数、日期、来源、问题及更正原因')
        return
    }
    busy.value = true
    try {
        const { requestKey: _, ...input } = model
        void _
        await feedbackApi.save(props.taskId, {
            ...input,
            requestKey: qualityRequest(request, input),
        })
        await load()
        ElMessage.success('反馈已保存')
    } catch {
        /* 保留表单供重试 */
    } finally {
        busy.value = false
    }
}
async function voidFeedback() {
    if (busy.value || !data.value?.feedback) return
    try {
        const { value } = await ElMessageBox.prompt('填写作废原因', '作废反馈', {
            inputValidator: (v) => !!v?.trim() || '请填写原因',
        })
        busy.value = true
        const input = { version: data.value.feedback.version, reason: value }
        await feedbackApi.void(props.taskId, {
            ...input,
            requestKey: qualityRequest(request, input),
        })
        await load()
    } catch {
        /* 取消或请求层提示 */
    } finally {
        busy.value = false
    }
}
function improve() {
    void router.push({ path: '/service/management-followups', query: { taskId: props.taskId } })
}
watch(
    () => props.taskId,
    () => {
        data.value = undefined
        editing.value = false
        void load()
    },
    { immediate: true },
)
</script>
<template>
    <el-card class="task-feedback">
        <template #header>
            <div class="page-header">
                <h3>服务质量反馈</h3>
                <el-button @click="load">刷新反馈</el-button>
            </div>
        </template>
        <el-result v-if="failed" icon="error" title="反馈读取失败">
            <template #extra><el-button @click="load">重试</el-button></template>
        </el-result>
        <template v-else-if="data">
            <p v-if="!data.applicable">
                首版反馈适用于已实际结束且未取消的集体服务，可在下方回看同项目、同团队此前的建议。
            </p>
            <p v-if="data.summary">服务总结：{{ data.summary }}</p>
            <template v-if="data.feedback && !editing">
                <p>
                    {{ data.feedback.status === 'ACTIVE' ? '有效反馈' : '已作废' }} · 反馈日期
                    {{ data.feedback.feedbackDate }} · {{ feedbackSources[data.feedback.source] }}
                </p>
                <p>
                    满意 {{ data.feedback.satisfiedCount }} 份，一般
                    {{ data.feedback.neutralCount }} 份，不满意
                    {{ data.feedback.dissatisfiedCount }} 份
                </p>
                <p>建议：{{ data.feedback.suggestions || '暂无' }}</p>
                <p v-if="data.feedback.voidReason">作废原因：{{ data.feedback.voidReason }}</p>
            </template>
            <p v-else-if="!editing">尚未登记反馈</p>
            <div v-if="data.canEdit && !editing" class="form-actions">
                <el-button type="primary" @click="edit">
                    {{
                        !data.feedback
                            ? '登记反馈'
                            : data.feedback.status === 'VOID'
                              ? '恢复反馈'
                              : '更正反馈'
                    }}
                </el-button>
                <el-button
                    v-if="data.feedback?.status === 'ACTIVE'"
                    :loading="busy"
                    @click="voidFeedback"
                >
                    作废
                </el-button>
            </div>
            <el-form v-if="editing && data.canEdit" label-position="top" @submit.prevent="save">
                <el-form-item label="满意份数">
                    <el-input-number
                        v-model="model.satisfiedCount"
                        :min="0"
                        :max="100000"
                        :precision="0"
                    />
                </el-form-item>
                <el-form-item label="一般份数">
                    <el-input-number
                        v-model="model.neutralCount"
                        :min="0"
                        :max="100000"
                        :precision="0"
                    />
                </el-form-item>
                <el-form-item label="不满意份数">
                    <el-input-number
                        v-model="model.dissatisfiedCount"
                        :min="0"
                        :max="100000"
                        :precision="0"
                    />
                </el-form-item>
                <p>有效反馈合计 {{ total }} 份</p>
                <el-form-item label="反馈来源">
                    <el-select v-model="model.source">
                        <el-option
                            v-for="(label, key) in feedbackSources"
                            :key="key"
                            :value="key"
                            :label="label"
                        />
                    </el-select>
                </el-form-item>
                <el-form-item v-if="model.source === 'OTHER'" label="来源说明">
                    <el-input v-model="model.sourceNote" maxlength="500" />
                </el-form-item>
                <el-form-item label="反馈日期">
                    <el-date-picker
                        v-model="model.feedbackDate"
                        type="date"
                        value-format="YYYY-MM-DD"
                    />
                </el-form-item>
                <el-form-item label="建议／主要问题">
                    <el-input
                        v-model="model.suggestions"
                        type="textarea"
                        maxlength="2000"
                        show-word-limit
                    />
                </el-form-item>
                <el-form-item v-if="data.feedback" label="更正／恢复原因">
                    <el-input v-model="model.reason" maxlength="1000" />
                </el-form-item>
                <div class="form-actions">
                    <el-button native-type="submit" type="primary" :loading="busy">
                        保存反馈
                    </el-button>
                    <el-button :disabled="busy" @click="editing = false">取消</el-button>
                </div>
            </el-form>
            <template v-if="data.followups.length">
                <h4>相关管理跟进</h4>
                <p v-for="f in data.followups" :key="f.id">
                    <router-link :to="`/service/management-followups?followupId=${f.id}`">
                        {{ f.title }}
                    </router-link>
                    · {{ f.result || '处理中' }}
                </p>
            </template>
            <el-button v-if="data.canManage" @click="improve">查看／建立改进跟进</el-button>
            <el-collapse v-if="data.history.length">
                <el-collapse-item title="反馈历史">
                    <p v-for="h in data.history" :key="h.id">
                        {{ formatDateTime(h.createdAt) }} · {{ h.actorName }} ·
                        {{ auditActionLabel(h.action) }} · {{ h.reason }}
                    </p>
                </el-collapse-item>
            </el-collapse>
            <template v-if="data.related.length">
                <h4>此前反馈与改进结果</h4>
                <div v-for="r in data.related" :key="r.taskId">
                    <router-link :to="`/activity/${r.taskId}`">{{ r.title }}</router-link>
                    <p>{{ r.date }} · {{ r.suggestions || '暂无建议' }}</p>
                    <p v-for="f in r.followups" :key="f.id">
                        {{ f.title }}：{{ f.result || '处理中' }}
                    </p>
                </div>
            </template>
        </template>
    </el-card>
</template>
<style scoped>
.task-feedback {
    margin-top: 16px;
}
p {
    overflow-wrap: anywhere;
}
</style>
