<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import QRCode from 'qrcode'
import { executionApi } from '@/api/modules/execution'
import { useMock } from '@/api/config'
import { useUserStore } from '@/stores/user'
import { taskStatuses } from '@/api/task-types'
import { formatDateTime } from '@/utils/dateTime'
import {
    executionFlags,
    type ExecutionDetail,
    type Participant,
    type Roster,
    type Evidence,
    type ExecutionException,
} from '@/api/execution-types'
import AttendanceDialog from './AttendanceDialog.vue'
import PolicyDialog from './PolicyDialog.vue'
import ParticipantDialog from './ParticipantDialog.vue'
import EvidencePicker from './EvidencePicker.vue'
const props = defineProps<{ taskId: number; mobile?: boolean }>(),
    emit = defineEmits<{ changed: [] }>(),
    store = useUserStore()
const data = ref<ExecutionDetail>(),
    loading = ref(false),
    busy = ref(false),
    files = ref<Evidence[]>([]),
    tab = ref('overview')
const attendanceOpen = ref(false),
    attendanceAction = ref<'start' | 'end' | 'attendance' | 'supplement' | 'correction'>(
        'attendance',
    ),
    attendanceKind = ref<'CHECK_IN' | 'CHECK_OUT'>('CHECK_IN'),
    policyOpen = ref(false)
const rosterOpen = ref(false),
    candidates = ref<Participant[]>([]),
    selectedPerson = ref<number>(),
    personName = ref(''),
    personPhone = ref(''),
    personKey = ref(''),
    participantOpen = ref(false),
    selectedRoster = ref<Roster>(),
    participationKind = ref<'CONFIRM' | 'CORRECT' | 'VOID'>('CONFIRM')
const issued = ref<{ id: number; link: string; qr: string; expiresAt: string; name: string }>(),
    credentialOpen = ref(false),
    exceptionOpen = ref(false),
    selectedException = ref<ExecutionException>(),
    explanation = ref(''),
    exceptionFiles = ref<number[]>([]),
    explanationKey = ref('')
const editPerson = ref<Participant>(),
    editPersonOpen = ref(false),
    editName = ref(''),
    editPhone = ref(''),
    editReason = ref('')
const issueRequests = new Map<
    number,
    {
        sourceVersion: number
        requestKey: string
        rosterId: number
        purpose: 'COLLECTIVE' | 'HOME_CONFIRM'
    }
>()
let generation = 0
const methodLabels: Record<string, string> = {
    SELF: '本人确认',
    FAMILY: '亲属确认',
    ASSISTED: '辅助登记',
    SUPPLEMENT: '补录',
}
const contactAllowed = computed(() => store.hasPermission('service:participant:contact'))
const canRecord = computed(() => !!data.value?.canRecord)
async function load() {
    const seq = ++generation
    if (useMock) return
    loading.value = true
    try {
        const result = await executionApi.detail(props.taskId)
        if (seq !== generation) return
        data.value = result
        if (store.hasPermission('service:evidence:view')) {
            try {
                const evidence = await executionApi.evidence(props.taskId)
                if (seq === generation) files.value = evidence
            } catch {
                files.value = []
            }
        }
    } catch {
        if (seq === generation) data.value = undefined
    } finally {
        if (seq === generation) loading.value = false
    }
}
async function refresh() {
    await load()
    emit('changed')
}
function attendance(
    action: typeof attendanceAction.value,
    kind: 'CHECK_IN' | 'CHECK_OUT' = 'CHECK_IN',
) {
    attendanceAction.value = action
    attendanceKind.value = kind
    attendanceOpen.value = true
}
async function stop() {
    if (!data.value) return
    try {
        const { value } = await ElMessageBox.prompt('中止原因（已有现场来源将保留）', '中止服务', {
            inputType: 'textarea',
            inputPattern: /\S/,
            inputErrorMessage: '请填写中止原因',
        })
        busy.value = true
        await executionApi.stop(props.taskId, {
            sourceVersion: data.value.sourceVersion,
            requestKey: crypto.randomUUID(),
            reason: value,
        })
        await refresh()
        ElMessage.success('服务已中止')
    } catch {
        /* 请求层提示或取消 */
    } finally {
        busy.value = false
    }
}
async function openRoster() {
    personName.value = ''
    personPhone.value = ''
    selectedPerson.value = undefined
    personKey.value = crypto.randomUUID()
    rosterOpen.value = true
    try {
        candidates.value = await executionApi.participants(props.taskId)
    } catch {
        /* 请求层提示 */
    }
}
watch([personName, personPhone], () => {
    personKey.value = crypto.randomUUID()
})
async function addPerson(create = false) {
    if (!data.value) return
    if (create && !personName.value.trim()) {
        ElMessage.warning('请填写姓名或称呼')
        return
    }
    if (!create && !selectedPerson.value) {
        ElMessage.warning('请选择项目内对象')
        return
    }
    busy.value = true
    try {
        if (create && candidates.value.some((p) => p.name === personName.value.trim()))
            await ElMessageBox.confirm(
                '项目中已有同名对象，请核对内部编号后再决定是否新建。',
                '核对对象',
                { confirmButtonText: '仍新建', cancelButtonText: '返回选择', type: 'warning' },
            )
        const id = create
            ? (
                  await executionApi.createParticipant({
                      taskId: props.taskId,
                      projectId: data.value.task.projectId,
                      name: personName.value.trim(),
                      ...(contactAllowed.value ? { phone: personPhone.value } : {}),
                      requestKey: personKey.value,
                  })
              ).id
            : selectedPerson.value!
        await executionApi.addParticipant(props.taskId, id)
        rosterOpen.value = false
        await refresh()
        ElMessage.success('已加入本次名单')
    } catch {
        /* 请求层提示或取消 */
    } finally {
        busy.value = false
    }
}
function participate(r: Roster, kind: typeof participationKind.value) {
    selectedRoster.value = r
    participationKind.value = kind
    participantOpen.value = true
}
async function issue(r: Roster) {
    if (!data.value) return
    busy.value = true
    try {
        const input = issueRequests.get(r.id) ?? {
            sourceVersion: data.value.sourceVersion,
            requestKey: crypto.randomUUID(),
            rosterId: r.id,
            purpose:
                data.value.task.form === 'HOME_VISIT'
                    ? ('HOME_CONFIRM' as const)
                    : ('COLLECTIVE' as const),
        }
        issueRequests.set(r.id, input)
        const result = await executionApi.issue(props.taskId, input)
        const link =
            window.location.origin +
            window.location.pathname +
            '#/participation?token=' +
            encodeURIComponent(result.token)
        issued.value = {
            id: result.id,
            link,
            qr: await QRCode.toDataURL(link, { width: 280, margin: 2 }),
            expiresAt: result.expiresAt,
            name: r.person.name,
        }
        issueRequests.delete(r.id)
        credentialOpen.value = true
    } catch (error) {
        if ((error as { response?: { status?: number } }).response?.status === 409) {
            issueRequests.delete(r.id)
            await load()
        }
    } finally {
        busy.value = false
    }
}
async function revoke() {
    if (!issued.value) return
    busy.value = true
    try {
        await executionApi.revoke(props.taskId, issued.value.id, '工作人员撤销本次参与卡')
        credentialOpen.value = false
        issued.value = undefined
        ElMessage.success('参与卡已撤销')
    } catch {
        /* 请求层提示 */
    } finally {
        busy.value = false
    }
}
async function copyLink() {
    if (!issued.value) return
    try {
        await navigator.clipboard.writeText(issued.value.link)
        ElMessage.success('链接已复制')
    } catch {
        ElMessage.info('可选择下方链接后手动复制')
    }
}
function explain(e: ExecutionException) {
    selectedException.value = e
    explanation.value = ''
    exceptionFiles.value = []
    explanationKey.value = crypto.randomUUID()
    exceptionOpen.value = true
}
watch(
    [explanation, exceptionFiles],
    () => {
        explanationKey.value = crypto.randomUUID()
    },
    { deep: true },
)
async function saveExplanation() {
    if (!selectedException.value || !explanation.value.trim()) {
        ElMessage.warning('请填写异常说明')
        return
    }
    busy.value = true
    try {
        await executionApi.explain(
            selectedException.value,
            explanation.value,
            exceptionFiles.value,
            explanationKey.value,
        )
        exceptionOpen.value = false
        await refresh()
        ElMessage.success('说明已追加，等待核验')
    } catch {
        await load()
    } finally {
        busy.value = false
    }
}
async function download(f: Pick<Evidence, 'id' | 'name'>) {
    try {
        const blob = await executionApi.download(f.id),
            url = URL.createObjectURL(blob),
            a = document.createElement('a')
        a.href = url
        a.download = f.name
        a.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
        /* 请求层提示 */
    }
}
async function remove(f: Evidence) {
    try {
        await ElMessageBox.confirm('移除这份尚未关联记录的临时凭证？', '移除凭证', {
            type: 'warning',
        })
        await executionApi.remove(f.id)
        await load()
    } catch {
        /* 请求层提示或取消 */
    }
}
async function edit(r: Roster) {
    try {
        const all = await executionApi.participants(props.taskId),
            p = all.find((p) => p.id === r.participantId)
        if (!p) return
        editPerson.value = p
        editName.value = p.name
        editPhone.value = p.phone ?? ''
        editReason.value = ''
        editPersonOpen.value = true
    } catch {
        /* 请求层提示 */
    }
}
async function savePerson(archive = false) {
    if (!editPerson.value || !editName.value.trim() || !editReason.value.trim()) {
        ElMessage.warning('请填写称呼和调整原因')
        return
    }
    busy.value = true
    try {
        if (archive)
            await executionApi.archiveParticipant(editPerson.value, props.taskId, editReason.value)
        else
            await executionApi.updateParticipant(editPerson.value.id, {
                taskId: props.taskId,
                version: editPerson.value.version,
                name: editName.value,
                ...(contactAllowed.value ? { phone: editPhone.value } : {}),
                reason: editReason.value,
            })
        editPersonOpen.value = false
        await refresh()
        ElMessage.success(archive ? '对象已归档' : '资料已更新')
    } catch {
        /* 请求层提示 */
    } finally {
        busy.value = false
    }
}
watch(
    () => props.taskId,
    () => {
        tab.value = 'overview'
        void load()
    },
)
onMounted(load)
</script>
<template>
    <section v-loading="loading" class="execution-panel" :class="{ 'is-mobile': mobile }">
        <el-alert
            v-if="useMock"
            title="现场执行使用真实接口；演示模式可查看手机与桌面入口。"
            type="info"
            :closable="false"
        />
        <template v-if="data">
            <div class="execution-panel__heading">
                <h2 v-if="mobile">{{ data.task.title }}</h2>
                <h3 v-else>现场执行</h3>
                <el-button @click="load">刷新现场</el-button>
            </div>
            <p v-if="mobile">
                {{ data.task.location }} · {{ formatDateTime(data.task.startAt) }} 至
                {{ formatDateTime(data.task.endAt) }}
            </p>
            <div class="execution-panel__summary">
                <el-tag>{{ taskStatuses[data.state] ?? data.state }}</el-tag>
                <span>现场已登记 {{ data.summary.registered }} 人</span>
                <span>参与待核验 {{ data.summary.requiresReview }} 人</span>
                <span>未解决异常 {{ data.summary.openExceptions }} 项</span>
            </div>
            <div class="execution-panel__actions">
                <el-button v-if="data.canConfigure" @click="policyOpen = true">现场规则</el-button>
                <el-button v-if="data.canStart" type="primary" @click="attendance('start')">
                    到岗并开始服务
                </el-button>
                <el-button
                    v-if="data.canCheckIn"
                    type="primary"
                    @click="attendance('attendance', 'CHECK_IN')"
                >
                    到岗签到
                </el-button>
                <el-button
                    v-if="data.canCheckOut"
                    type="primary"
                    plain
                    @click="attendance('attendance', 'CHECK_OUT')"
                >
                    离岗签退
                </el-button>
                <el-button
                    v-if="data.canEnd"
                    type="success"
                    @click="attendance('end', 'CHECK_OUT')"
                >
                    签退并结束服务
                </el-button>
                <el-button v-if="data.canStop" type="danger" plain :loading="busy" @click="stop">
                    中止服务
                </el-button>
                <el-button v-if="data.canSupplement" @click="attendance('supplement')">
                    补录到离
                </el-button>
                <el-button v-if="data.canSupplement" @click="attendance('correction')">
                    更正本人记录
                </el-button>
            </div>
            <el-alert
                v-if="data.policyStale"
                title="安排或服务点已变化，开场前请重新核对现场规则。"
                type="warning"
                :closable="false"
            />
            <el-tabs v-model="tab">
                <el-tab-pane label="执行概览" name="overview">
                    <el-descriptions :column="mobile ? 1 : 2" border>
                        <el-descriptions-item label="开始时间">
                            {{ formatDateTime(data.session?.startedAt) }}
                        </el-descriptions-item>
                        <el-descriptions-item label="结束／中止时间">
                            {{ formatDateTime(data.session?.endedAt) }}
                        </el-descriptions-item>
                        <el-descriptions-item label="位置检查">
                            半径{{ data.policy.radius }}米，精度要求{{
                                data.policy.accuracyLimit
                            }}米
                        </el-descriptions-item>
                        <el-descriptions-item label="补录期限">
                            计划结束后{{ data.policy.supplementHours }}小时
                        </el-descriptions-item>
                    </el-descriptions>
                    <p class="execution-panel__hint">
                        现场登记、待核验和正式档案数量分别记录，正式指标量沿用档案审批结果。
                    </p>
                    <el-table :data="data.attendance" stripe>
                        <el-table-column prop="userName" label="工作人员" min-width="110" />
                        <el-table-column label="类型" width="90">
                            <template #default="{ row }">
                                {{ row.kind === 'CHECK_IN' ? '到岗' : '离岗' }}
                            </template>
                        </el-table-column>
                        <el-table-column label="发生时间" min-width="170">
                            <template #default="{ row }">
                                {{ formatDateTime(row.occurredAt) }}
                            </template>
                        </el-table-column>
                        <el-table-column label="提交时间" min-width="170">
                            <template #default="{ row }">
                                {{ formatDateTime(row.receivedAt) }}
                            </template>
                        </el-table-column>
                        <el-table-column label="方式／来源" min-width="130">
                            <template #default="{ row }">
                                {{
                                    row.method === 'NORMAL'
                                        ? '现场'
                                        : row.method === 'SUPPLEMENT'
                                          ? '补录'
                                          : '更正'
                                }}
                                · {{ row.current ? '当前来源' : '历史来源' }}
                            </template>
                        </el-table-column>
                        <el-table-column label="位置／异常" min-width="200">
                            <template #default="{ row }">
                                <span v-if="row.geo?.status === 'OK'">
                                    距离{{ Math.round(row.distance ?? 0) }}米，精度{{
                                        Math.round(row.geo.accuracy ?? 0)
                                    }}米
                                </span>
                                <el-tag v-for="flag in row.flags" :key="flag" type="warning">
                                    {{ executionFlags[flag] ?? flag }}
                                </el-tag>
                            </template>
                        </el-table-column>
                        <el-table-column prop="reason" label="说明" min-width="150" />
                    </el-table>
                </el-tab-pane>
                <el-tab-pane label="参与名单" name="participants">
                    <el-button v-if="data.canManageParticipants" type="primary" @click="openRoster">
                        加入服务对象
                    </el-button>
                    <div v-if="mobile" class="execution-panel__rosters">
                        <el-card v-for="r in data.rosters" :key="r.id" shadow="never">
                            <h4>{{ r.person.name }}</h4>
                            <p>内部编号：{{ r.person.code }}</p>
                            <p v-if="contactAllowed && r.person.phone">
                                电话：{{ r.person.phone }}
                            </p>
                            <p>
                                {{
                                    r.person.status === 'ARCHIVED'
                                        ? '对象已归档'
                                        : !r.participation
                                          ? '未登记'
                                          : r.participation.status === 'VOID'
                                            ? '已作废'
                                            : r.participation.requiresReview
                                              ? '已登记·待核验'
                                              : '已登记'
                                }}
                            </p>
                            <div class="execution-panel__roster-actions">
                                <el-button
                                    v-if="data.canIssue && r.person.status === 'ACTIVE'"
                                    type="primary"
                                    :loading="busy"
                                    @click="issue(r)"
                                >
                                    发放参与卡
                                </el-button>
                                <el-button
                                    v-if="canRecord || data.canSupplement"
                                    @click="
                                        participate(
                                            r,
                                            r.participation?.status === 'RECORDED'
                                                ? 'CORRECT'
                                                : 'CONFIRM',
                                        )
                                    "
                                >
                                    {{
                                        r.participation?.status === 'RECORDED'
                                            ? '更正来源'
                                            : '辅助确认'
                                    }}
                                </el-button>
                                <el-button
                                    v-if="
                                        r.participation?.status === 'RECORDED' &&
                                        (canRecord || data.canSupplement)
                                    "
                                    type="danger"
                                    plain
                                    @click="participate(r, 'VOID')"
                                >
                                    作废
                                </el-button>
                                <el-button v-if="data.canManageParticipants" @click="edit(r)">
                                    对象资料
                                </el-button>
                            </div>
                        </el-card>
                        <el-empty v-if="!data.rosters.length" description="尚未加入服务对象" />
                    </div>
                    <el-table v-else :data="data.rosters" stripe>
                        <el-table-column prop="person.name" label="姓名／称呼" min-width="120" />
                        <el-table-column label="内部编号" min-width="150">
                            <template #default="{ row }">{{ row.person.code }}</template>
                        </el-table-column>
                        <el-table-column
                            v-if="contactAllowed"
                            prop="person.phone"
                            label="联系电话"
                            min-width="140"
                        />
                        <el-table-column label="登记状态" min-width="140">
                            <template #default="{ row }">
                                {{
                                    row.person.status === 'ARCHIVED'
                                        ? '对象已归档'
                                        : !row.participation
                                          ? '未登记'
                                          : row.participation.status === 'VOID'
                                            ? '已作废'
                                            : row.participation.requiresReview
                                              ? '已登记·待核验'
                                              : '已登记'
                                }}
                            </template>
                        </el-table-column>
                        <el-table-column label="操作" min-width="300">
                            <template #default="{ row }">
                                <el-button
                                    v-if="data.canIssue && row.person.status === 'ACTIVE'"
                                    link
                                    type="primary"
                                    :loading="busy"
                                    @click="issue(row as Roster)"
                                >
                                    发放参与卡
                                </el-button>
                                <el-button
                                    v-if="canRecord || data.canSupplement"
                                    link
                                    type="primary"
                                    @click="
                                        participate(
                                            row as Roster,
                                            row.participation?.status === 'RECORDED'
                                                ? 'CORRECT'
                                                : 'CONFIRM',
                                        )
                                    "
                                >
                                    {{
                                        row.participation?.status === 'RECORDED'
                                            ? '更正来源'
                                            : '辅助确认'
                                    }}
                                </el-button>
                                <el-button
                                    v-if="
                                        row.participation?.status === 'RECORDED' &&
                                        (canRecord || data.canSupplement)
                                    "
                                    link
                                    type="danger"
                                    @click="participate(row as Roster, 'VOID')"
                                >
                                    作废
                                </el-button>
                                <el-button
                                    v-if="data.canManageParticipants"
                                    link
                                    @click="edit(row as Roster)"
                                >
                                    对象资料
                                </el-button>
                            </template>
                        </el-table-column>
                    </el-table>
                    <h4>参与来源历史</h4>
                    <el-table :data="data.participationEvents">
                        <el-table-column label="对象" min-width="120">
                            <template #default="{ row }">
                                {{ data.rosters.find((r) => r.id === row.rosterId)?.person.name }}
                            </template>
                        </el-table-column>
                        <el-table-column label="方式" min-width="120">
                            <template #default="{ row }">{{ methodLabels[row.method] }}</template>
                        </el-table-column>
                        <el-table-column label="发生时间" min-width="170">
                            <template #default="{ row }">
                                {{ formatDateTime(row.occurredAt) }}
                            </template>
                        </el-table-column>
                        <el-table-column prop="relation" label="关系说明" min-width="130" />
                        <el-table-column prop="reason" label="记录原因" min-width="160" />
                    </el-table>
                </el-tab-pane>
                <el-tab-pane label="现场凭证" name="evidence">
                    <el-table :data="files">
                        <el-table-column prop="name" label="文件" min-width="190" />
                        <el-table-column label="归属" min-width="120">
                            <template #default="{ row }">
                                {{ row.boundKind ? '已绑定来源' : '本人待绑定' }}
                            </template>
                        </el-table-column>
                        <el-table-column label="上传时间" min-width="170">
                            <template #default="{ row }">
                                {{ formatDateTime(row.createdAt) }}
                            </template>
                        </el-table-column>
                        <el-table-column label="操作" width="150">
                            <template #default="{ row }">
                                <el-button link type="primary" @click="download(row as Evidence)">
                                    下载
                                </el-button>
                                <el-button
                                    v-if="!row.boundKind && row.uploadedBy === store.profile?.id"
                                    link
                                    type="danger"
                                    @click="remove(row as Evidence)"
                                >
                                    移除
                                </el-button>
                            </template>
                        </el-table-column>
                    </el-table>
                </el-tab-pane>
                <el-tab-pane label="异常与说明" name="exceptions">
                    <el-table :data="data.exceptions">
                        <el-table-column prop="label" label="异常" min-width="160" />
                        <el-table-column label="状态" min-width="130">
                            <template #default="{ row }">
                                {{
                                    row.status === 'RESOLVED'
                                        ? '已由后续记录解决'
                                        : row.status === 'EXPLAINED'
                                          ? '已说明·待核验'
                                          : '待说明／核验'
                                }}
                            </template>
                        </el-table-column>
                        <el-table-column label="操作" width="130">
                            <template #default="{ row }">
                                <el-button
                                    v-if="
                                        row.ownerId === store.profile?.id &&
                                        row.status !== 'RESOLVED' &&
                                        store.hasPermission('service:exception:explain')
                                    "
                                    link
                                    type="primary"
                                    @click="explain(row as ExecutionException)"
                                >
                                    补充说明
                                </el-button>
                            </template>
                        </el-table-column>
                        <el-table-column type="expand">
                            <template #default="{ row }">
                                <p v-for="(note, index) in row.notes" :key="index">
                                    {{ formatDateTime(note.createdAt) }} · {{ note.reason }}
                                </p>
                                <p v-if="!row.notes.length">尚未补充说明</p>
                            </template>
                        </el-table-column>
                    </el-table>
                </el-tab-pane>
            </el-tabs>
            <AttendanceDialog
                v-model="attendanceOpen"
                :detail="data"
                :action="attendanceAction"
                :kind="attendanceKind"
                @saved="refresh"
                @refresh="load"
            />
            <PolicyDialog v-model="policyOpen" :detail="data" @saved="refresh" />
            <ParticipantDialog
                v-model="participantOpen"
                :detail="data"
                :roster="selectedRoster"
                :kind="participationKind"
                @saved="refresh"
                @refresh="load"
            />
            <el-dialog
                v-model="rosterOpen"
                title="加入服务对象"
                width="min(560px, calc(100vw - 24px))"
                :close-on-click-modal="false"
            >
                <el-form label-position="top">
                    <el-form-item label="选择项目内已有对象">
                        <el-select v-model="selectedPerson" filterable clearable>
                            <el-option
                                v-for="p in candidates.filter((p) => p.status === 'ACTIVE')"
                                :key="p.id"
                                :label="`${p.name} · ${p.code}`"
                                :value="p.id"
                            />
                        </el-select>
                    </el-form-item>
                    <el-button :loading="busy" @click="addPerson()">加入已有对象</el-button>
                    <el-divider>或登记新的项目内对象</el-divider>
                    <el-form-item label="姓名或称呼">
                        <el-input v-model="personName" maxlength="100" />
                    </el-form-item>
                    <el-form-item v-if="contactAllowed" label="联系电话（可选）">
                        <el-input v-model="personPhone" maxlength="50" />
                    </el-form-item>
                </el-form>
                <template #footer>
                    <el-button @click="rosterOpen = false">关闭</el-button>
                    <el-button type="primary" :loading="busy" @click="addPerson(true)">
                        登记并加入
                    </el-button>
                </template>
            </el-dialog>
            <el-dialog
                v-model="credentialOpen"
                title="个人参与卡"
                width="min(440px, calc(100vw - 24px))"
                @closed="issued = undefined"
            >
                <template v-if="issued">
                    <p>{{ issued.name }} · 有效至 {{ formatDateTime(issued.expiresAt) }}</p>
                    <img
                        :src="issued.qr"
                        alt="本次个人参与确认二维码"
                        class="execution-panel__qr"
                    />
                    <el-input :model-value="issued.link" readonly aria-label="个人参与链接" />
                    <p class="execution-panel__hint">
                        本人或家属打开参与卡确认本次服务；重新发放、结束或中止会使旧卡失效。
                    </p>
                </template>
                <template #footer>
                    <el-button @click="copyLink">复制链接</el-button>
                    <el-button type="danger" plain :loading="busy" @click="revoke">
                        撤销参与卡
                    </el-button>
                </template>
            </el-dialog>
            <el-dialog
                v-model="exceptionOpen"
                title="补充异常说明"
                width="min(560px, calc(100vw - 24px))"
                :close-on-click-modal="false"
                destroy-on-close
            >
                <p>{{ selectedException?.label }}</p>
                <el-input
                    v-model="explanation"
                    type="textarea"
                    maxlength="1000"
                    placeholder="实际情况、原因与补充依据"
                />
                <EvidencePicker v-if="exceptionOpen" :task-id="taskId" v-model="exceptionFiles" />
                <template #footer>
                    <el-button @click="exceptionOpen = false">关闭</el-button>
                    <el-button type="primary" :loading="busy" @click="saveExplanation">
                        追加说明
                    </el-button>
                </template>
            </el-dialog>
            <el-dialog
                v-model="editPersonOpen"
                title="对象资料"
                width="min(500px, calc(100vw - 24px))"
                :close-on-click-modal="false"
            >
                <el-form label-position="top">
                    <el-form-item label="姓名或称呼">
                        <el-input v-model="editName" maxlength="100" />
                    </el-form-item>
                    <el-form-item v-if="contactAllowed" label="联系电话">
                        <el-input v-model="editPhone" maxlength="50" />
                    </el-form-item>
                    <el-form-item label="调整原因" required>
                        <el-input v-model="editReason" type="textarea" maxlength="1000" />
                    </el-form-item>
                </el-form>
                <template #footer>
                    <el-button :loading="busy" @click="savePerson(true)">归档对象</el-button>
                    <el-button type="primary" :loading="busy" @click="savePerson()">
                        保存资料
                    </el-button>
                </template>
            </el-dialog>
        </template>
        <el-empty v-else-if="!loading && !useMock" description="现场执行不可访问" />
    </section>
</template>
<style scoped>
.execution-panel__heading,
.execution-panel__summary,
.execution-panel__actions {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    margin: 16px 0;
}
.execution-panel__heading {
    justify-content: space-between;
}
.execution-panel__hint {
    color: var(--el-text-color-secondary);
    font-size: 14px;
}
.execution-panel__qr {
    display: block;
    max-width: 100%;
    margin: 16px auto;
}
.execution-panel :deep(.el-select) {
    width: 100%;
}
.execution-panel :deep(.el-tag) {
    margin: 2px;
}
.is-mobile .execution-panel__actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
}
.is-mobile .execution-panel__actions :deep(.el-button) {
    margin: 0;
    height: auto;
    min-height: 44px;
    white-space: normal;
    padding: 12px;
}
.is-mobile h2 {
    font-size: 18px;
    overflow-wrap: anywhere;
}
.execution-panel__rosters {
    display: grid;
    gap: 12px;
    margin: 16px 0;
}
.execution-panel__rosters p {
    overflow-wrap: anywhere;
    color: var(--el-text-color-secondary);
}
.execution-panel__roster-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
}
.execution-panel__roster-actions :deep(.el-button) {
    margin: 0;
    min-height: 44px;
    white-space: normal;
}
.execution-panel {
    min-width: 0;
}
</style>
