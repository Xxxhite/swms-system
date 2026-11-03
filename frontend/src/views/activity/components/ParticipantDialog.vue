<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { executionApi } from '@/api/modules/execution'
import type { ExecutionDetail, Roster, ParticipationPayload } from '@/api/execution-types'
import { toBusinessInput } from '@/api/task-types'
import EvidencePicker from './EvidencePicker.vue'
const open = defineModel<boolean>({ required: true }),
    props = defineProps<{
        detail: ExecutionDetail
        roster?: Roster
        kind: 'CONFIRM' | 'CORRECT' | 'VOID'
    }>(),
    emit = defineEmits<{ saved: []; refresh: [] }>()
const busy = ref(false),
    method = ref<'ASSISTED' | 'SUPPLEMENT'>('ASSISTED'),
    role = ref<ParticipationPayload['confirmerRole']>('STAFF'),
    relation = ref(''),
    reason = ref(''),
    time = ref(''),
    evidenceIds = ref<number[]>([]),
    pending = ref<ParticipationPayload>()
watch(open, (value) => {
    if (!value) return
    method.value = props.detail.session?.status === 'IN_PROGRESS' ? 'ASSISTED' : 'SUPPLEMENT'
    role.value = 'STAFF'
    relation.value = ''
    reason.value = ''
    const event = props.detail.participationEvents.find(
        (e) => e.id === props.roster?.participation?.currentEventId,
    )
    time.value = toBusinessInput(event?.occurredAt ?? props.detail.task.startAt)
    evidenceIds.value = []
    pending.value = undefined
})
watch(
    [method, role, relation, reason, time, evidenceIds],
    () => {
        pending.value = undefined
    },
    { deep: true },
)
async function save() {
    if (!props.roster || !reason.value.trim()) {
        ElMessage.warning('请填写辅助登记、更正或作废原因')
        return
    }
    if (
        props.detail.task.form === 'HOME_VISIT' &&
        props.kind !== 'VOID' &&
        !evidenceIds.value.length
    ) {
        ElMessage.warning('入户辅助确认至少需要一份替代凭证')
        return
    }
    if (['FAMILY', 'COMPANION'].includes(role.value) && !relation.value.trim()) {
        ElMessage.warning('请填写与对象的关系')
        return
    }
    busy.value = true
    try {
        pending.value ??= {
            requestKey: crypto.randomUUID(),
            sourceVersion: props.detail.sourceVersion,
            kind: props.kind,
            method: method.value,
            confirmerRole: role.value,
            relation: relation.value.trim(),
            reason: reason.value.trim(),
            occurredAt: time.value + '+08:00',
            evidenceIds: [...evidenceIds.value],
        }
        await executionApi.confirm(props.detail.taskId, props.roster.id, pending.value)
        open.value = false
        emit('saved')
        ElMessage.success('参与来源已保存，等待核验')
    } catch (error) {
        if ((error as { response?: { status?: number } }).response?.status === 409) {
            pending.value = undefined
            emit('refresh')
        }
    } finally {
        busy.value = false
    }
}
</script>
<template>
    <el-dialog
        v-model="open"
        :title="
            kind === 'VOID' ? '作废参与记录' : kind === 'CORRECT' ? '更正参与来源' : '辅助参与确认'
        "
        width="min(560px, calc(100vw - 24px))"
        :close-on-click-modal="false"
        :show-close="!busy"
        destroy-on-close
    >
        <p>{{ roster?.person.name }} · {{ roster?.person.code }}</p>
        <el-form label-position="top">
            <el-form-item label="记录方式">
                <el-radio-group v-model="method">
                    <el-radio value="ASSISTED" :disabled="detail.session?.status !== 'IN_PROGRESS'">
                        现场辅助
                    </el-radio>
                    <el-radio value="SUPPLEMENT">显式补录</el-radio>
                </el-radio-group>
            </el-form-item>
            <el-form-item v-if="method === 'SUPPLEMENT'" label="实际发生时间" required>
                <el-date-picker v-model="time" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss" />
            </el-form-item>
            <el-form-item label="确认人角色">
                <el-select v-model="role">
                    <el-option label="工作人员辅助" value="STAFF" />
                    <el-option label="服务对象本人" value="SELF" />
                    <el-option label="家属" value="FAMILY" />
                    <el-option label="其他陪同人" value="COMPANION" />
                </el-select>
            </el-form-item>
            <el-form-item
                v-if="role === 'FAMILY' || role === 'COMPANION'"
                label="与对象关系"
                required
            >
                <el-input v-model="relation" maxlength="200" />
            </el-form-item>
            <el-form-item label="原因" required>
                <el-input v-model="reason" type="textarea" maxlength="1000" />
            </el-form-item>
            <EvidencePicker :task-id="detail.taskId" v-model="evidenceIds" />
        </el-form>
        <template #footer>
            <el-button :disabled="busy" @click="open = false">关闭</el-button>
            <el-button type="primary" :loading="busy" @click="save">保存来源</el-button>
        </template>
    </el-dialog>
</template>
<style scoped>
.el-select,
.el-date-editor {
    width: 100%;
}
</style>
