<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { executionApi } from '@/api/modules/execution'
import { captureLocation } from '@/utils/geolocation'
import { toBusinessInput } from '@/api/task-types'
import { useUserStore } from '@/stores/user'
import type {
    ExecutionDetail,
    AttendancePayload,
    LifecyclePayload,
    GeoSample,
} from '@/api/execution-types'
import EvidencePicker from './EvidencePicker.vue'
const open = defineModel<boolean>({ required: true }),
    props = defineProps<{
        detail: ExecutionDetail
        action: 'start' | 'end' | 'attendance' | 'supplement' | 'correction'
        kind?: 'CHECK_IN' | 'CHECK_OUT'
    }>(),
    emit = defineEmits<{ saved: []; refresh: [] }>(),
    store = useUserStore()
const busy = ref(false),
    reason = ref(''),
    time = ref(''),
    eventKind = ref<'CHECK_IN' | 'CHECK_OUT'>('CHECK_IN'),
    evidenceIds = ref<number[]>([]),
    supersedesId = ref<number>(),
    sample = ref<GeoSample>(),
    pending = ref<AttendancePayload | LifecyclePayload>()
const historical = computed(() => props.action === 'supplement' || props.action === 'correction'),
    own = computed(() =>
        props.detail.attendance.filter((e) => e.userId === store.profile?.id && e.current),
    )
const title = computed(
    () =>
        ({
            start: '到岗并开始服务',
            end: '签退并结束服务',
            attendance: props.kind === 'CHECK_OUT' ? '离岗签退' : '到岗签到',
            supplement: '补录到离',
            correction: '更正本人到离',
        })[props.action],
)
watch(open, (value) => {
    if (!value) return
    reason.value = ''
    eventKind.value = props.kind ?? 'CHECK_IN'
    time.value = toBusinessInput(props.detail.task.startAt)
    evidenceIds.value = []
    supersedesId.value = undefined
    sample.value = undefined
    pending.value = undefined
})
watch(
    [reason, time, eventKind, supersedesId, evidenceIds],
    () => {
        pending.value = undefined
    },
    { deep: true },
)
function selectOriginal() {
    const old = own.value.find((e) => e.id === supersedesId.value)
    if (old) {
        eventKind.value = old.kind
        time.value = toBusinessInput(old.occurredAt)
    }
}
async function submit() {
    if (historical.value && (!reason.value.trim() || !time.value)) {
        ElMessage.warning('请填写实际发生时间及原因')
        return
    }
    if (props.action === 'correction' && !supersedesId.value) {
        ElMessage.warning('请选择本人当前来源')
        return
    }
    busy.value = true
    try {
        if (!pending.value) {
            const geo =
                props.detail.policy.locationCheckEnabled === false
                    ? { status: 'NOT_REQUESTED' as const }
                    : historical.value
                      ? { status: 'UNAVAILABLE' as const }
                      : (sample.value ?? (await captureLocation()))
            sample.value = geo
            if (
                props.detail.policy.locationCheckEnabled !== false &&
                (geo.status !== 'OK' || props.detail.policy.latitude === null) &&
                !reason.value.trim()
            ) {
                ElMessage.warning('定位缺失或未设参考点，请补充现场说明')
                return
            }
            const fields = {
                requestKey: crypto.randomUUID(),
                sourceVersion: props.detail.sourceVersion,
                declaredAt: historical.value ? time.value + '+08:00' : new Date().toISOString(),
                geo,
                reason: reason.value.trim(),
                evidenceIds: [...evidenceIds.value],
            }
            pending.value =
                props.action === 'start' || props.action === 'end'
                    ? fields
                    : {
                          ...fields,
                          kind: eventKind.value,
                          method:
                              props.action === 'correction'
                                  ? 'CORRECTION'
                                  : historical.value
                                    ? 'SUPPLEMENT'
                                    : 'NORMAL',
                          ...(supersedesId.value ? { supersedesId: supersedesId.value } : {}),
                      }
        }
        if (props.action === 'start' || props.action === 'end')
            await executionApi.lifecycle(props.detail.taskId, props.action, pending.value)
        else await executionApi.attendance(props.detail.taskId, pending.value as AttendancePayload)
        ElMessage.success(historical.value ? '来源已保存，等待核验' : '现场记录已保存')
        open.value = false
        emit('saved')
    } catch (error) {
        const status = (error as { response?: { status?: number } }).response?.status
        if (status === 409) {
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
        :title="title"
        width="min(560px, calc(100vw - 24px))"
        :close-on-click-modal="false"
        :show-close="!busy"
        :close-on-press-escape="!busy"
        destroy-on-close
    >
        <el-alert
            v-if="historical"
            title="补录／更正保留实际发生时间、当前提交时间及原因，作为待核验来源。"
            type="info"
            :closable="false"
        />
        <el-alert
            v-else
            :title="
                detail.policy.locationCheckEnabled === false
                    ? '按任务安排的服务地点登记本次记录，无需获取定位。'
                    : '点击提交时获取本次位置，仅用于现场记录。'
            "
            type="info"
            :closable="false"
        />
        <el-form label-position="top">
            <el-form-item v-if="action === 'correction'" label="原始来源" required>
                <el-select v-model="supersedesId" @change="selectOriginal">
                    <el-option
                        v-for="e in own"
                        :key="e.id"
                        :label="`${e.kind === 'CHECK_IN' ? '到岗' : '离岗'} ${toBusinessInput(e.occurredAt).replace('T', ' ')}`"
                        :value="e.id"
                    />
                </el-select>
            </el-form-item>
            <el-form-item v-if="action === 'supplement'" label="记录类型">
                <el-radio-group v-model="eventKind">
                    <el-radio value="CHECK_IN">到岗</el-radio>
                    <el-radio value="CHECK_OUT">离岗</el-radio>
                </el-radio-group>
            </el-form-item>
            <el-form-item v-if="historical" label="实际发生时间" required>
                <el-date-picker v-model="time" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss" />
            </el-form-item>
            <el-form-item
                label="现场说明／原因"
                :required="
                    historical ||
                    (detail.policy.locationCheckEnabled !== false &&
                        detail.policy.latitude === null) ||
                    (detail.policy.locationCheckEnabled !== false &&
                        !!sample &&
                        sample.status !== 'OK')
                "
            >
                <el-input
                    v-model="reason"
                    type="textarea"
                    maxlength="1000"
                    :placeholder="
                        detail.policy.locationCheckEnabled === false
                            ? '可补充现场说明；补录或更正时填写原因'
                            : '定位异常、补录或更正时填写'
                    "
                />
            </el-form-item>
            <p v-if="sample && sample.status !== 'NOT_REQUESTED'">
                {{
                    sample.status === 'OK'
                        ? `已获取本次位置，精度约${Math.round(sample.accuracy ?? 0)}米`
                        : '未取得定位，请填写说明后提交'
                }}
            </p>
            <EvidencePicker :task-id="detail.taskId" v-model="evidenceIds" />
        </el-form>
        <template #footer>
            <el-button :disabled="busy" @click="open = false">关闭</el-button>
            <el-button type="primary" :loading="busy" @click="submit">确认提交</el-button>
        </template>
    </el-dialog>
</template>
<style scoped>
.el-select,
.el-date-editor {
    width: 100%;
}
</style>
