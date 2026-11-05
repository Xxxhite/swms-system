<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { executionApi } from '@/api/modules/execution'
import { outcomeApi } from '@/api/modules/outcome'
import { useUserStore } from '@/stores/user'
import { regionText } from '@/api/region-types'
import { toBusinessInput } from '@/api/task-types'
import { calculationLabels } from '@/api/outcome-types'
import { formatDateTime } from '@/utils/dateTime'
import type {
    RegistrationDetail,
    RegistrationInput,
    RegistrationMetric,
    Evidence,
} from '@/api/execution-types'
import OutcomePanel from './OutcomePanel.vue'
const props = defineProps<{ taskId: number }>(),
    emit = defineEmits<{ changed: [] }>(),
    store = useUserStore()
const data = ref<RegistrationDetail>(),
    loading = ref(false),
    busy = ref(false),
    startAt = ref(''),
    endAt = ref(''),
    summary = ref(''),
    reason = ref('')
const metrics = ref<RegistrationMetric[]>([]),
    evidence = ref<Evidence[]>([]),
    evidenceIds = ref<number[]>([]),
    fileInput = ref<HTMLInputElement>(),
    pendingFiles = ref<Array<{ file: File; key: string }>>([])
const pendingSave = ref<RegistrationInput>(),
    pendingSubmit = ref<Parameters<typeof outcomeApi.submit>[1]>(),
    revision = ref(0)
const personOpen = ref(false),
    personName = ref(''),
    personKey = ref('')
const rulesBusy = ref(false),
    rulesFailed = ref(false),
    loadFailed = ref(false)
let generation = 0,
    ruleGeneration = 0
const stateLabels: Record<string, string> = {
    SCHEDULED: '待登记',
    TO_REGISTER: '待登记',
    TO_SUBMIT: '待提交',
    REJECTED: '已退回',
    NEEDS_CORRECTION: '待更正',
    TO_ORGANIZE: '待提交',
    IN_REVIEW: '待审批',
    COMPLETED: '已完成',
    CANCELED: '已取消',
    IN_PROGRESS: '进行中',
}
async function changed() {
    await load()
    emit('changed')
}
async function load() {
    const seq = ++generation
    ++ruleGeneration
    rulesBusy.value = false
    rulesFailed.value = false
    loadFailed.value = false
    loading.value = true
    try {
        const d = await executionApi.registration(props.taskId)
        if (seq !== generation) return
        data.value = d
        startAt.value = toBusinessInput(d.startAt)
        endAt.value = toBusinessInput(d.endAt)
        summary.value = d.summary
        reason.value = ''
        metrics.value = d.rules.map((rule) => {
            const saved = d.source?.registration?.indicators.find(
                (i) => i.indicatorId === rule.indicatorId,
            )
            return saved
                ? JSON.parse(JSON.stringify(saved))
                : {
                      indicatorId: rule.indicatorId,
                      value: rule.mode === 'SCENES' ? '1' : '0',
                      participantIds: [],
                      intervals: [],
                  }
        })
        evidenceIds.value = d.source?.evidence.map((f) => f.id) ?? []
        if (store.hasPermission('service:evidence:view')) {
            const files = await executionApi.evidence(props.taskId)
            if (seq !== generation) return
            evidence.value = files
        }
        pendingSave.value = undefined
        revision.value++
        return true
    } catch {
        if (seq === generation) {
            loadFailed.value = true
        }
        return false
    } finally {
        if (seq === generation) loading.value = false
    }
}
watch(
    [startAt, endAt, summary, reason, metrics, evidenceIds],
    () => {
        pendingSave.value = undefined
    },
    { deep: true, flush: 'sync' },
)
watch(
    () => props.taskId,
    () => {
        data.value = undefined
        pendingSubmit.value = undefined
        pendingFiles.value = []
        void load()
    },
)
onMounted(load)
async function rulesChanged() {
    if (!data.value || data.value.registered || !startAt.value) return
    const seq = ++ruleGeneration,
        id = props.taskId
    rulesBusy.value = true
    rulesFailed.value = false
    try {
        const fresh = await executionApi.registration(id, startAt.value + '+08:00')
        if (seq !== ruleGeneration) return
        const prior = data.value.rules
        metrics.value = fresh.rules.map((rule) => {
            const old = metrics.value.find((m) => m.indicatorId === rule.indicatorId)
            return old && prior.find((r) => r.indicatorId === rule.indicatorId)?.mode === rule.mode
                ? old
                : {
                      indicatorId: rule.indicatorId,
                      value: rule.mode === 'SCENES' ? '1' : '0',
                      participantIds: [],
                      intervals: [],
                  }
        })
        data.value.rules = fresh.rules
    } catch {
        if (seq === ruleGeneration) rulesFailed.value = true
    } finally {
        if (seq === ruleGeneration) rulesBusy.value = false
    }
}
function addInterval(metric: RegistrationMetric) {
    metric.intervals.push({
        userId: data.value!.staff[0]?.userId ?? 0,
        startAt: startAt.value + '+08:00',
        endAt: endAt.value + '+08:00',
    })
}
function copyPeople(metric: RegistrationMetric) {
    const other = metrics.value.find((m) => m !== metric && m.participantIds.length)
    if (other) metric.participantIds = [...other.participantIds]
    else ElMessage.info('暂无可复用的名单')
}
function copyIntervals(metric: RegistrationMetric) {
    const other = metrics.value.find((m) => m !== metric && m.intervals.length)
    if (other) metric.intervals = other.intervals.map((i) => ({ ...i }))
    else ElMessage.info('暂无可复用的时段')
}
async function persist() {
    const d = data.value!
    if (rulesBusy.value || rulesFailed.value)
        throw Object.assign(new Error('请重新核对实际开始日期对应的指标口径'), {
            name: 'RegistrationValidation',
        })
    if (!startAt.value || !endAt.value || !summary.value.trim())
        throw Object.assign(new Error('请填写实际起止时间和服务总结'), {
            name: 'RegistrationValidation',
        })
    if (pendingFiles.value.length)
        throw Object.assign(new Error('请先重试未完成的附件上传'), {
            name: 'RegistrationValidation',
        })
    pendingSave.value ??= {
        taskVersion: d.taskVersion,
        sourceVersion: d.sourceVersion,
        outcomeVersion: d.outcomeVersion,
        requestKey: crypto.randomUUID(),
        startAt: startAt.value + '+08:00',
        endAt: endAt.value + '+08:00',
        summary: summary.value.trim(),
        reason: reason.value.trim(),
        indicators: JSON.parse(JSON.stringify(metrics.value)),
        evidenceIds: [...evidenceIds.value],
    }
    await executionApi.saveRegistration(props.taskId, pendingSave.value)
    const refreshed = await load()
    emit('changed')
    if (!refreshed) {
        ElMessage.info('登记已保存，页面刷新失败，可刷新登记或重试保存')
        return false
    }
    return true
}
async function save(submit = false) {
    busy.value = true
    let saved = false
    try {
        if (!pendingSubmit.value) {
            if (!(await persist())) return
            saved = true
            if (submit) {
                const d = await outcomeApi.detail(props.taskId)
                pendingSubmit.value = {
                    version: d.outcome!.version,
                    sourceVersion: d.sourceVersion,
                    requestKey: crypto.randomUUID(),
                    recordIds: d.records
                        .filter(
                            (r) =>
                                ['DRAFT', 'REJECTED'].includes(r.record.status) &&
                                !r.record.submittedAt,
                        )
                        .map((r) => r.recordId),
                }
            }
        }
        if (submit && pendingSubmit.value) {
            await outcomeApi.submit(props.taskId, pendingSubmit.value)
            pendingSubmit.value = undefined
            await load()
            emit('changed')
        }
        ElMessage.success(submit ? '已提交直接主管审批' : '执行登记已保存')
    } catch (error) {
        if (error instanceof Error && error.name === 'RegistrationValidation')
            ElMessage.warning(error.message)
        if (submit && saved) ElMessage.info('登记已保存，审批尚未提交成功，请重试提交')
    } finally {
        busy.value = false
    }
}
async function upload() {
    busy.value = true
    try {
        while (pendingFiles.value.length) {
            const f = pendingFiles.value[0]!,
                result = await outcomeApi.upload(props.taskId, f.file, f.key)
            evidence.value.push(result)
            evidenceIds.value.push(result.id)
            pendingFiles.value.shift()
        }
        ElMessage.success('附件已上传，保存登记时关联')
    } catch {
        /* 请求层提示，保留文件和请求标识用于重试 */
    } finally {
        busy.value = false
    }
}
function files(event: Event) {
    const target = event.target as HTMLInputElement
    for (const file of Array.from(target.files ?? []))
        pendingFiles.value.push({ file, key: crypto.randomUUID() })
    target.value = ''
    void upload()
}
function rotatePersonKey() {
    personKey.value = crypto.randomUUID()
}
function newPerson() {
    personName.value = ''
    personKey.value = crypto.randomUUID()
    personOpen.value = true
}
async function addPerson() {
    if (!personName.value.trim()) return ElMessage.warning('请填写姓名或称呼')
    try {
        if (data.value?.participants.some((p) => p.name === personName.value.trim()))
            await ElMessageBox.confirm('存在同名对象，请核对内部编号。', '同名提醒', {
                confirmButtonText: '仍新建',
                cancelButtonText: '返回选择',
            })
        busy.value = true
        const result = await executionApi.createParticipant({
            taskId: props.taskId,
            projectId: data.value!.task.projectId,
            name: personName.value.trim(),
            requestKey: personKey.value,
        })
        const refreshed = await executionApi.registration(props.taskId)
        data.value!.participants = refreshed.participants
        ElMessage.success(`对象已建档，请在对应指标选择（${result.id}）`)
        personOpen.value = false
    } catch {
        /* 取消或请求层已提示 */
    } finally {
        busy.value = false
    }
}
</script>
<template>
    <section v-loading="loading" class="execution-registration">
        <div class="page-actions">
            <h3>执行登记</h3>
            <el-button :disabled="busy || !!pendingSubmit" @click="load">刷新登记</el-button>
        </div>
        <el-alert
            v-if="loadFailed"
            title="执行登记加载失败，请点击刷新登记重试。"
            type="error"
            :closable="false"
        />
        <el-alert
            v-if="rulesFailed"
            title="实际日期对应的指标口径加载失败，请重新选择日期或刷新。"
            type="error"
            :closable="false"
        />
        <template v-if="data">
            <h3>{{ data.task.title }}</h3>
            <el-descriptions :column="1" border>
                <el-descriptions-item label="项目／团队">
                    {{ data.task.projectName }}／{{ data.task.teamName }}
                </el-descriptions-item>
                <el-descriptions-item label="负责人">
                    {{ data.task.leaderName }}
                </el-descriptions-item>
                <el-descriptions-item label="服务地点">
                    {{ regionText(data.task) }} {{ data.task.address }}
                </el-descriptions-item>
                <el-descriptions-item label="计划时间">
                    {{ formatDateTime(data.task.startAt) }} 至 {{ formatDateTime(data.task.endAt) }}
                </el-descriptions-item>
                <el-descriptions-item label="状态">
                    {{ stateLabels[data.registrationState ?? data.state] ?? data.state }}
                </el-descriptions-item>
            </el-descriptions>
            <el-alert
                v-if="data.inReview"
                title="登记已提交审批，需修改时先撤回对应记录。"
                type="info"
                :closable="false"
            />
            <el-alert
                v-else-if="!data.canEdit"
                title="可查看执行登记，结果由实际任务负责人填写。"
                type="info"
                :closable="false"
            />
            <p v-else>请核实实际时间及成果。普通执行无需定位、签到或参与卡，批准后计入正式量。</p>
            <el-form
                label-position="top"
                :disabled="busy || rulesBusy || !data.canEdit || !!pendingSubmit"
            >
                <div class="registration-times">
                    <el-form-item label="实际开始时间" required>
                        <el-date-picker
                            v-model="startAt"
                            @change="rulesChanged"
                            type="datetime"
                            value-format="YYYY-MM-DDTHH:mm:ss"
                        />
                    </el-form-item>
                    <el-form-item label="实际结束时间" required>
                        <el-date-picker
                            v-model="endAt"
                            type="datetime"
                            value-format="YYYY-MM-DDTHH:mm:ss"
                        />
                    </el-form-item>
                </div>
                <el-card
                    v-for="(rule, index) in data.rules"
                    :key="rule.indicatorId"
                    class="registration-metric"
                    shadow="never"
                >
                    <h4>{{ rule.indicatorName }}（{{ rule.unit }}）</h4>
                    <p>计划量：{{ rule.plannedValue }} · {{ calculationLabels[rule.mode] }}</p>
                    <p v-if="rule.mode === 'SCENES'">
                        正常完成本任务计1场；取消或中止不计正常场次。
                    </p>
                    <el-form-item
                        v-if="rule.mode === 'VISITS' || rule.mode === 'MANUAL'"
                        :label="rule.mode === 'VISITS' ? '实际服务人次' : '实际完成量'"
                        required
                    >
                        <el-input
                            v-model="metrics[index]!.value"
                            :inputmode="rule.mode === 'VISITS' ? 'numeric' : 'decimal'"
                            :placeholder="
                                rule.mode === 'VISITS' ? '填写非负整数' : '非负数，最多两位小数'
                            "
                        />
                    </el-form-item>
                    <template v-if="rule.mode === 'PEOPLE'">
                        <el-form-item label="本指标实际服务对象" required>
                            <el-select
                                v-model="metrics[index]!.participantIds"
                                multiple
                                filterable
                                clearable
                                placeholder="按项目内编号选择，可登记0人"
                            >
                                <el-option
                                    v-for="p in data.participants"
                                    :key="p.id"
                                    :label="`${p.name}（${p.code}）${p.status === 'ARCHIVED' ? '已归档' : ''}`"
                                    :value="p.id"
                                    :disabled="
                                        p.status === 'ARCHIVED' &&
                                        !metrics[index]!.participantIds.includes(p.id)
                                    "
                                />
                            </el-select>
                        </el-form-item>
                        <div class="page-actions">
                            <el-button @click="copyPeople(metrics[index]!)">复用已选名单</el-button>
                            <el-button
                                v-if="store.hasPermission('service:participant:manage')"
                                @click="newPerson"
                            >
                                新增服务对象
                            </el-button>
                        </div>
                        <p>
                            本次{{
                                metrics[index]!.participantIds.length
                            }}人，正式统计按对象编号去重。
                        </p>
                    </template>
                    <template v-if="rule.mode === 'STAFF_HOURS'">
                        <div
                            v-for="(interval, n) in metrics[index]!.intervals"
                            :key="n"
                            class="registration-interval"
                        >
                            <el-form-item label="实际工作人员" required>
                                <el-select v-model="interval.userId">
                                    <el-option
                                        v-for="person in data.staff"
                                        :key="person.userId"
                                        :label="person.name"
                                        :value="person.userId"
                                    />
                                </el-select>
                            </el-form-item>
                            <el-form-item label="服务开始" required>
                                <el-date-picker
                                    :model-value="toBusinessInput(interval.startAt)"
                                    type="datetime"
                                    value-format="YYYY-MM-DDTHH:mm:ss"
                                    @update:model-value="
                                        interval.startAt = $event ? String($event) + '+08:00' : ''
                                    "
                                />
                            </el-form-item>
                            <el-form-item label="服务结束" required>
                                <el-date-picker
                                    :model-value="toBusinessInput(interval.endAt)"
                                    type="datetime"
                                    value-format="YYYY-MM-DDTHH:mm:ss"
                                    @update:model-value="
                                        interval.endAt = $event ? String($event) + '+08:00' : ''
                                    "
                                />
                            </el-form-item>
                            <el-button @click="metrics[index]!.intervals.splice(n, 1)">
                                移除时段
                            </el-button>
                        </div>
                        <div class="page-actions">
                            <el-button @click="addInterval(metrics[index]!)">
                                添加人员时段
                            </el-button>
                            <el-button @click="copyIntervals(metrics[index]!)">
                                复用已填时段
                            </el-button>
                        </div>
                        <p>仅填写实际参与人员；同一人员重叠时段按并集合计，没有实际工时可保留0。</p>
                    </template>
                </el-card>
                <el-form-item label="服务总结" required>
                    <el-input
                        v-model="summary"
                        type="textarea"
                        :rows="4"
                        maxlength="4000"
                        show-word-limit
                    />
                </el-form-item>
                <el-form-item v-if="data.needsCorrection" label="登记更正原因" required>
                    <el-input v-model="reason" type="textarea" maxlength="1000" />
                </el-form-item>
                <el-form-item label="业务附件">
                    <el-checkbox-group v-model="evidenceIds">
                        <el-checkbox
                            v-for="file in evidence"
                            :key="file.id"
                            :value="file.id"
                            :disabled="!!file.boundKind"
                        >
                            {{ file.name }}
                        </el-checkbox>
                    </el-checkbox-group>
                    <el-button
                        v-if="store.hasPermission('service:evidence:upload')"
                        @click="fileInput?.click()"
                    >
                        上传附件
                    </el-button>
                    <el-button v-if="pendingFiles.length" type="warning" @click="upload">
                        重试上传（{{ pendingFiles.length }}）
                    </el-button>
                </el-form-item>
            </el-form>
            <div v-if="data.canEdit" class="page-actions">
                <el-button :loading="busy" :disabled="rulesBusy || !!pendingSubmit" @click="save()">
                    保存登记
                </el-button>
                <el-button
                    v-if="data.canSubmit || pendingSubmit"
                    type="primary"
                    :disabled="rulesBusy"
                    :loading="busy"
                    @click="save(true)"
                >
                    {{ pendingSubmit ? '重试提交审批' : '提交审批' }}
                </el-button>
                <el-button v-if="pendingSubmit" @click="pendingSubmit = undefined">
                    返回编辑
                </el-button>
            </div>
            <input
                ref="fileInput"
                type="file"
                accept=".jpg,.jpeg,.png,.pdf"
                multiple
                hidden
                @change="files"
            />
            <OutcomePanel
                v-if="data.registered"
                :key="revision"
                :task-id="taskId"
                ended
                simple
                @changed="changed"
            />
        </template>
        <el-dialog v-model="personOpen" title="新增服务对象" width="min(460px, calc(100vw - 24px))">
            <el-form label-position="top">
                <el-form-item label="姓名或称呼" required>
                    <el-input v-model="personName" maxlength="100" @input="rotatePersonKey" />
                </el-form-item>
            </el-form>
            <template #footer>
                <el-button @click="personOpen = false">取消</el-button>
                <el-button type="primary" :loading="busy" @click="addPerson">保存对象</el-button>
            </template>
        </el-dialog>
    </section>
</template>
<style scoped>
.execution-registration {
    min-width: 0;
    overflow-wrap: anywhere;
}
.execution-registration .el-form {
    margin-top: 20px;
}
.execution-registration :deep(.el-select),
.execution-registration :deep(.el-date-editor) {
    width: 100%;
}
.execution-registration .el-alert {
    margin: 16px 0;
}
.execution-registration p {
    color: var(--el-text-color-regular);
    line-height: 1.7;
}
.registration-metric {
    margin: 16px 0;
}
.registration-metric h4 {
    margin: 0;
}
.registration-times {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
}
.registration-interval {
    display: grid;
    grid-template-columns: minmax(110px, 1fr) minmax(180px, 2fr) minmax(180px, 2fr) auto;
    gap: 12px;
    align-items: end;
    border-bottom: 1px solid var(--el-border-color-light);
    margin-bottom: 12px;
}
.registration-interval > .el-button {
    margin-bottom: 18px;
}
@media (max-width: 1000px) {
    .registration-interval {
        grid-template-columns: 1fr;
    }
    .registration-interval > .el-button {
        justify-self: start;
    }
}
@media (max-width: 767px) {
    .registration-times {
        grid-template-columns: 1fr;
        gap: 0;
    }
}
</style>
