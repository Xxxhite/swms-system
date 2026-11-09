<script setup lang="ts">
import ResponsiveTable from '@/components/ResponsiveTable.vue'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useUserStore } from '@/stores/user'
import { resourceApi } from '@/api/modules/resource'
import {
    emptyResource,
    resourceStatus,
    resourceRelationship,
    cooperationStatus,
    type ResourceDetail,
    type ResourceInput,
    type ResourceCandidates,
    type ResourceContact,
    type ResourceCooperation,
    type ResourceFollowup,
} from '@/api/resource-types'
import { formatDateTime } from '@/utils/dateTime'
import { auditActionLabel } from '@/constants/audit'
import CooperationEvaluation from './components/CooperationEvaluation.vue'
import { feedbackRatings } from '@/api/feedback-types'
import ResourceEditor from './components/ResourceEditor.vue'
defineOptions({ name: 'ResourceDetail' })
const route = useRoute(),
    router = useRouter(),
    store = useUserStore()
const resource = ref<ResourceDetail>(),
    busy = ref(false),
    tab = ref('base')
const candidates = ref<ResourceCandidates>({ resources: [], organizations: [], users: [] })
const model = ref<ResourceInput>(emptyResource()),
    editor = ref<InstanceType<typeof ResourceEditor>>()
const evaluatedCooperation = computed(
    () => !!resource.value?.cooperations.find((c) => c.id === selected.value)?.feedbackRating,
)
const evaluationId = ref(0)
function evaluationFollowup() {
    const id = evaluationId.value
    evaluationId.value = 0
    tab.value = 'followups'
    openFollowup()
    followup.cooperationId = id
}
const active = computed(() => resource.value?.status === 'ACTIVE')
const has = (p: string) => active.value && store.hasPermission(p)
const dialog = ref<'contacts' | 'cooperations' | 'followups' | ''>('')
const selected = ref(0),
    selectedVersion = ref(0)
const contact = reactive({
    name: '',
    position: '',
    phone: '',
    email: '',
    note: '',
    isPrimary: false,
    status: 'ACTIVE',
})
const cooperation = reactive({
    title: '',
    ownerId: 0,
    status: 'TO_CONTACT',
    startDate: null as string | null,
    endDate: null as string | null,
    basis: '',
    result: '',
    feedback: '',
    reason: '',
})
const followup = reactive({
    cooperationId: null as number | null,
    contactId: null as number | null,
    occurredAt: '',
    method: '电话',
    content: '',
    result: '',
    nextAction: '',
    nextOwnerId: null as number | null,
    nextDueDate: null as string | null,
    completed: false,
})
const mergeDialog = ref(false),
    mergeTarget = ref(0),
    mergeReason = ref(''),
    mergeSummary = ref<Record<string, string | number>>()
let mergePayload:
    | {
          sourceId: number
          targetId: number
          sourceVersion: number
          targetVersion: number
          reason: string
      }
    | undefined
async function load() {
    try {
        const d = await resourceApi.detail(Number(route.params.id))
        if (d.id !== Number(route.params.id)) return
        resource.value = d
        model.value = Object.fromEntries(
            Object.keys(emptyResource()).map((k) => [
                k,
                d[k as keyof ResourceDetail] ?? emptyResource()[k as keyof ResourceInput],
            ]),
        ) as unknown as ResourceInput
        model.value.regionCode = d.regionCode ?? null
        model.value.regionPathSnapshot = d.regionPathSnapshot
        candidates.value = await resourceApi.candidates()
        const cooperationId = Number(route.query.cooperationId)
        if (d.cooperations.some((c) => c.id === cooperationId)) {
            tab.value = 'cooperations'
            evaluationId.value = cooperationId
        }
        const id = Number(route.query.followupId)
        if (Number.isSafeInteger(id) && id > 0) {
            const row = d.followups.find((f) => f.id === id)
            if (row) {
                tab.value = 'followups'
                if (has('resource:followup:manage')) openFollowup(row)
            }
        }
    } catch {
        /* 请求层提示 */
    }
}
async function operate(work: () => Promise<unknown>) {
    if (busy.value) return
    busy.value = true
    try {
        await work()
        dialog.value = ''
        mergeDialog.value = false
        await load()
        ElMessage.success('已保存')
    } catch {
        /* 请求层提示 */
    } finally {
        busy.value = false
    }
}
async function saveBase() {
    if (await editor.value?.validate())
        await operate(() =>
            resourceApi.update(resource.value!.id, model.value, resource.value!.version),
        )
}
function openContact(row?: ResourceContact) {
    Object.assign(
        contact,
        {
            name: '',
            position: '',
            phone: '',
            email: '',
            note: '',
            isPrimary: false,
            status: 'ACTIVE',
        },
        row ? { ...row, isPrimary: !!row.isPrimary } : {},
    )
    selected.value = row?.id ?? 0
    selectedVersion.value = row?.version ?? 0
    dialog.value = 'contacts'
}
function openCooperation(row?: ResourceCooperation) {
    Object.assign(
        cooperation,
        {
            title: '',
            ownerId: store.profile?.id ?? 0,
            status: 'TO_CONTACT',
            startDate: null,
            endDate: null,
            basis: '',
            result: '',
            feedback: '',
            reason: '',
        },
        row ?? {},
    )
    selected.value = row?.id ?? 0
    selectedVersion.value = row?.version ?? 0
    dialog.value = 'cooperations'
}
function openFollowup(row?: ResourceFollowup) {
    Object.assign(
        followup,
        {
            cooperationId: null,
            contactId: null,
            occurredAt: new Date().toISOString(),
            method: '电话',
            content: '',
            result: '',
            nextAction: '',
            nextOwnerId: null,
            nextDueDate: null,
            completed: false,
        },
        row
            ? {
                  ...row,
                  occurredAt: new Date(row.occurredAt).toISOString(),
                  completed: !!row.completed,
              }
            : {},
    )
    selected.value = row?.id ?? 0
    selectedVersion.value = row?.version ?? 0
    dialog.value = 'followups'
}
async function saveChild() {
    const kind = dialog.value
    if (!kind) return
    const source = kind === 'contacts' ? contact : kind === 'cooperations' ? cooperation : followup
    const keys =
        kind === 'contacts'
            ? ['name', 'position', 'phone', 'email', 'note', 'isPrimary', 'status']
            : kind === 'cooperations'
              ? [
                    'title',
                    'ownerId',
                    'status',
                    'startDate',
                    'endDate',
                    'basis',
                    'result',
                    'feedback',
                    'reason',
                ]
              : [
                    'cooperationId',
                    'contactId',
                    'occurredAt',
                    'method',
                    'content',
                    'result',
                    'nextAction',
                    'nextOwnerId',
                    'nextDueDate',
                    'completed',
                ]
    const input = Object.fromEntries(
        keys.map((k) => [k, (source as unknown as Record<string, unknown>)[k]]),
    )
    if (selected.value) input.version = selectedVersion.value
    await operate(() =>
        resourceApi.saveChild(resource.value!.id, kind, input, selected.value || undefined),
    )
}
async function archive() {
    try {
        const { value } = await ElMessageBox.prompt('填写归档原因，历史资料将保留', '归档资源', {
            inputValidator: (v) => !!v?.trim() || '请填写原因',
        })
        await operate(() => resourceApi.archive(resource.value!.id, resource.value!.version, value))
    } catch {
        /* 取消或请求层提示 */
    }
}
function openMerge() {
    mergeTarget.value = 0
    mergeReason.value = ''
    mergeSummary.value = undefined
    mergePayload = undefined
    mergeDialog.value = true
}
async function previewMerge() {
    if (!mergeTarget.value || !mergeReason.value.trim())
        return void ElMessage.warning('请选择目标资源并填写原因')
    if (busy.value) return
    busy.value = true
    try {
        const target = await resourceApi.detail(mergeTarget.value)
        mergePayload = {
            sourceId: resource.value!.id,
            targetId: target.id,
            sourceVersion: resource.value!.version,
            targetVersion: target.version,
            reason: mergeReason.value,
        }
        mergeSummary.value = await resourceApi.merge(mergePayload, true)
    } catch {
        /* 请求层提示 */
    } finally {
        busy.value = false
    }
}
async function confirmMerge() {
    if (mergePayload && mergeSummary.value) await operate(() => resourceApi.merge(mergePayload!))
}
watch(
    () => route.params.id,
    () => {
        resource.value = undefined
        void load()
    },
)
watch(
    () => route.query.followupId,
    () => {
        void load()
    },
)
onMounted(load)
</script>
<template>
    <div v-if="resource" class="resource-detail">
        <div class="resource-actions">
            <el-button @click="router.push('/resource')">返回资源列表</el-button>
            <h2>{{ resource.name }}</h2>
            <el-tag>{{ resourceStatus[resource.status] }}</el-tag>
            <el-tag type="info">{{ resourceRelationship[resource.relationship] }}</el-tag>
            <el-button v-if="has('resource:record:archive')" :disabled="busy" @click="archive">
                归档
            </el-button>
            <el-button
                v-if="has('resource:record:merge') && has('resource:record:update')"
                :disabled="busy"
                @click="openMerge"
            >
                合并到其他资源
            </el-button>
        </div>
        <el-alert
            v-if="resource.mergedIntoId"
            :title="`此档案已合并，目标资源编号：${resource.mergedIntoId}`"
            type="info"
            :closable="false"
        />
        <el-tabs v-model="tab">
            <el-tab-pane label="基础资料" name="base">
                <ResourceEditor
                    ref="editor"
                    v-model="model"
                    :candidates="candidates"
                    :resource-id="resource.id"
                    :disabled="!has('resource:record:update') || busy"
                />
                <el-button
                    v-if="has('resource:record:update')"
                    type="primary"
                    :loading="busy"
                    @click="saveBase"
                >
                    保存资料
                </el-button>
            </el-tab-pane>
            <el-tab-pane label="联系人" name="contacts">
                <el-alert
                    v-if="!resource.canViewContacts"
                    title="需要联系方式查看权限"
                    type="info"
                    :closable="false"
                />
                <template v-else>
                    <el-button
                        v-if="has('resource:contact:manage')"
                        type="primary"
                        @click="openContact()"
                    >
                        新增联系人
                    </el-button>
                    <!-- @vue-generic {ResourceContact} -->
                    <ResponsiveTable :data="resource.contacts">
                        <el-table-column prop="name" label="姓名" />
                        <el-table-column prop="position" label="职务" />
                        <el-table-column prop="phone" label="电话" />
                        <el-table-column prop="email" label="邮箱" />
                        <el-table-column label="主要联系人">
                            <template #default="{ row }">
                                {{ row.isPrimary ? '是' : '否' }}
                            </template>
                        </el-table-column>
                        <el-table-column label="状态">
                            <template #default="{ row }">
                                {{ row.status === 'ACTIVE' ? '有效' : '已归档' }}
                            </template>
                        </el-table-column>
                        <el-table-column v-if="has('resource:contact:manage')" label="操作">
                            <template #default="{ row }">
                                <el-button
                                    link
                                    type="primary"
                                    @click="openContact(row as ResourceContact)"
                                >
                                    编辑
                                </el-button>
                            </template>
                        </el-table-column>
                    </ResponsiveTable>
                </template>
            </el-tab-pane>
            <el-tab-pane label="合作事项" name="cooperations">
                <el-button
                    v-if="has('resource:cooperation:manage')"
                    type="primary"
                    @click="openCooperation()"
                >
                    新增合作事项
                </el-button>
                <!-- @vue-generic {ResourceCooperation} -->
                <ResponsiveTable :data="resource.cooperations">
                    <el-table-column prop="title" label="事项" min-width="180" />
                    <el-table-column label="来源">
                        <template #default="{ row }">
                            {{ row.type === 'CONTRACT' ? '合同关联' : '手工记录' }}
                        </template>
                    </el-table-column>
                    <el-table-column label="进展">
                        <template #default="{ row }">{{ cooperationStatus[row.status] }}</template>
                    </el-table-column>
                    <el-table-column prop="startDate" label="开始日期" />
                    <el-table-column prop="endDate" label="结束日期" />
                    <el-table-column prop="feedback" label="合作反馈" />
                    <el-table-column label="合作评价">
                        <template #default="{ row }">
                            {{
                                row.feedbackRating
                                    ? feedbackRatings[
                                          row.feedbackRating as keyof typeof feedbackRatings
                                      ]
                                    : '未评价'
                            }}
                        </template>
                    </el-table-column>
                    <el-table-column label="评价">
                        <template #default="{ row }">
                            <el-button link type="primary" @click="evaluationId = row.id">
                                查看／评价
                            </el-button>
                        </template>
                    </el-table-column>
                    <el-table-column v-if="has('resource:cooperation:manage')" label="操作">
                        <template #default="{ row }">
                            <el-button
                                v-if="row.type === 'MANUAL'"
                                link
                                type="primary"
                                @click="openCooperation(row as ResourceCooperation)"
                            >
                                编辑
                            </el-button>
                            <el-button
                                v-else
                                link
                                @click="
                                    router.push(
                                        `/service/contract-package-projects/${row.projectId}`,
                                    )
                                "
                            >
                                查看合同
                            </el-button>
                        </template>
                    </el-table-column>
                </ResponsiveTable>
            </el-tab-pane>
            <el-tab-pane label="跟进记录" name="followups">
                <el-button
                    v-if="has('resource:followup:manage')"
                    type="primary"
                    @click="openFollowup()"
                >
                    新增跟进
                </el-button>
                <!-- @vue-generic {ResourceFollowup} -->
                <ResponsiveTable :data="resource.followups">
                    <el-table-column label="联系时间" min-width="175">
                        <template #default="{ row }">{{ formatDateTime(row.occurredAt) }}</template>
                    </el-table-column>
                    <el-table-column prop="method" label="方式" />
                    <el-table-column prop="content" label="沟通内容" min-width="180" />
                    <el-table-column prop="result" label="结果" />
                    <el-table-column prop="nextAction" label="下一步" />
                    <el-table-column prop="nextDueDate" label="跟进日期" />
                    <el-table-column label="状态">
                        <template #default="{ row }">
                            {{ row.completed ? '已处理' : '待处理' }}
                        </template>
                    </el-table-column>
                    <el-table-column v-if="has('resource:followup:manage')" label="操作">
                        <template #default="{ row }">
                            <el-button
                                link
                                type="primary"
                                @click="openFollowup(row as ResourceFollowup)"
                            >
                                编辑
                            </el-button>
                        </template>
                    </el-table-column>
                </ResponsiveTable>
            </el-tab-pane>
            <el-tab-pane label="关联合同" name="contracts">
                <ResponsiveTable :data="resource.contracts">
                    <el-table-column prop="projectName" label="合同包" />
                    <el-table-column prop="contractNo" label="合同编号" />
                    <el-table-column prop="partnerName" label="签约名称" />
                    <el-table-column prop="startDate" label="开始日期" />
                    <el-table-column prop="endDate" label="结束日期" />
                    <el-table-column label="操作">
                        <template #default="{ row }">
                            <el-button
                                link
                                type="primary"
                                @click="
                                    router.push(
                                        `/service/contract-package-projects/${row.projectId}`,
                                    )
                                "
                            >
                                查看项目
                            </el-button>
                        </template>
                    </el-table-column>
                </ResponsiveTable>
            </el-tab-pane>
            <el-tab-pane label="操作历史" name="events">
                <ResponsiveTable :data="resource.events">
                    <el-table-column label="操作">
                        <template #default="{ row }">{{ auditActionLabel(row.action) }}</template>
                    </el-table-column>
                    <el-table-column prop="actorName" label="操作人" />
                    <el-table-column label="时间">
                        <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
                    </el-table-column>
                </ResponsiveTable>
            </el-tab-pane>
            <el-tab-pane label="合并历史" name="history">
                <ResponsiveTable :data="resource.merges">
                    <el-table-column prop="sourceId" label="来源编号" />
                    <el-table-column prop="targetId" label="目标编号" />
                    <el-table-column prop="reason" label="原因" />
                    <el-table-column label="时间">
                        <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
                    </el-table-column>
                </ResponsiveTable>
            </el-tab-pane>
        </el-tabs>
        <el-dialog
            :model-value="!!dialog"
            :title="
                dialog === 'contacts'
                    ? '维护联系人'
                    : dialog === 'cooperations'
                      ? '维护合作事项'
                      : '维护跟进记录'
            "
            width="650px"
            :close-on-click-modal="false"
            @update:model-value="dialog = ''"
        >
            <el-form label-width="110px" :disabled="busy">
                <template v-if="dialog === 'contacts'">
                    <el-form-item
                        v-for="(label, key) in {
                            name: '姓名',
                            position: '职务',
                            phone: '电话',
                            email: '邮箱',
                            note: '备注',
                        }"
                        :key="key"
                        :label="label"
                        :required="key === 'name'"
                    >
                        <el-input v-model="contact[key]" />
                    </el-form-item>
                    <el-form-item label="主要联系人">
                        <el-switch v-model="contact.isPrimary" />
                    </el-form-item>
                    <el-form-item label="状态">
                        <el-select v-model="contact.status">
                            <el-option label="有效" value="ACTIVE" />
                            <el-option label="归档" value="ARCHIVED" />
                        </el-select>
                    </el-form-item>
                </template>
                <template v-else-if="dialog === 'cooperations'">
                    <el-form-item label="合作事项" required>
                        <el-input v-model="cooperation.title" maxlength="150" />
                    </el-form-item>
                    <el-form-item label="负责人" required>
                        <el-select v-model="cooperation.ownerId" filterable>
                            <el-option
                                v-for="u in candidates.users"
                                :key="u.id"
                                :value="u.id"
                                :label="u.name"
                            />
                        </el-select>
                    </el-form-item>
                    <el-form-item label="进展">
                        <el-select v-model="cooperation.status">
                            <el-option
                                v-for="(label, value) in cooperationStatus"
                                :key="value"
                                :label="label"
                                :value="value"
                            />
                        </el-select>
                    </el-form-item>
                    <el-form-item label="开始日期">
                        <el-date-picker v-model="cooperation.startDate" value-format="YYYY-MM-DD" />
                    </el-form-item>
                    <el-form-item label="结束日期">
                        <el-date-picker v-model="cooperation.endDate" value-format="YYYY-MM-DD" />
                    </el-form-item>
                    <el-form-item
                        v-for="(label, key) in {
                            basis: '合作依据',
                            result: '合作结果',
                            feedback: '合作反馈',
                            reason: '变更原因',
                        }"
                        :key="key"
                        :label="label"
                    >
                        <el-input
                            v-model="cooperation[key]"
                            type="textarea"
                            :disabled="
                                evaluatedCooperation && (key === 'result' || key === 'feedback')
                            "
                        />
                    </el-form-item>
                </template>
                <template v-else>
                    <el-form-item label="关联事项">
                        <el-select v-model="followup.cooperationId" clearable>
                            <el-option
                                v-for="c in resource.cooperations"
                                :key="c.id"
                                :value="c.id"
                                :label="c.title"
                            />
                        </el-select>
                    </el-form-item>
                    <el-form-item v-if="resource.canViewContacts" label="联系人">
                        <el-select v-model="followup.contactId" clearable>
                            <el-option
                                v-for="c in resource.contacts.filter((c) => c.status === 'ACTIVE')"
                                :key="c.id"
                                :value="c.id"
                                :label="c.name"
                            />
                        </el-select>
                    </el-form-item>
                    <el-form-item label="联系时间" required>
                        <el-date-picker
                            v-model="followup.occurredAt"
                            type="datetime"
                            value-format="YYYY-MM-DDTHH:mm:ssZ"
                        />
                    </el-form-item>
                    <el-form-item label="联系方法" required>
                        <el-input v-model="followup.method" />
                    </el-form-item>
                    <el-form-item
                        v-for="(label, key) in {
                            content: '沟通内容',
                            result: '本次结果',
                            nextAction: '下一步',
                        }"
                        :key="key"
                        :label="label"
                        :required="key === 'content'"
                    >
                        <el-input v-model="followup[key]" type="textarea" />
                    </el-form-item>
                    <el-form-item label="下一步负责人">
                        <el-select v-model="followup.nextOwnerId" clearable>
                            <el-option
                                v-for="u in candidates.users"
                                :key="u.id"
                                :value="u.id"
                                :label="u.name"
                            />
                        </el-select>
                    </el-form-item>
                    <el-form-item label="预计日期">
                        <el-date-picker v-model="followup.nextDueDate" value-format="YYYY-MM-DD" />
                    </el-form-item>
                    <el-form-item label="后续事项已处理">
                        <el-switch v-model="followup.completed" />
                    </el-form-item>
                </template>
            </el-form>
            <template #footer>
                <el-button :disabled="busy" @click="dialog = ''">取消</el-button>
                <el-button type="primary" :loading="busy" @click="saveChild">保存</el-button>
            </template>
        </el-dialog>
        <el-dialog
            v-model="mergeDialog"
            title="合并资源"
            width="600px"
            :close-on-click-modal="false"
        >
            <el-alert
                title="合并转移引用并保留原合同签约快照，请先预览"
                type="info"
                :closable="false"
            />
            <el-form label-width="100px">
                <el-form-item label="目标资源">
                    <el-select v-model="mergeTarget" filterable @change="mergeSummary = undefined">
                        <el-option
                            v-for="r in candidates.resources.filter((r) => r.id !== resource?.id)"
                            :key="r.id"
                            :value="r.id"
                            :label="`${r.name}（${r.region}）`"
                        />
                    </el-select>
                </el-form-item>
                <el-form-item label="合并原因">
                    <el-input
                        v-model="mergeReason"
                        type="textarea"
                        maxlength="1000"
                        @input="mergeSummary = undefined"
                    />
                </el-form-item>
            </el-form>
            <el-descriptions v-if="mergeSummary" :column="1" border>
                <el-descriptions-item
                    v-for="(value, key) in mergeSummary"
                    :key="key"
                    :label="
                        (
                            {
                                contacts: '联系人',
                                cooperations: '合作事项',
                                followups: '跟进记录',
                                contracts: '合同',
                                source: '来源单位',
                                target: '目标单位',
                            } as Record<string, string>
                        )[key]
                    "
                >
                    {{ value }}
                </el-descriptions-item>
            </el-descriptions>
            <template #footer>
                <el-button :loading="busy" @click="previewMerge">预览引用</el-button>
                <el-button
                    type="primary"
                    :disabled="!mergeSummary"
                    :loading="busy"
                    @click="confirmMerge"
                >
                    确认合并
                </el-button>
            </template>
        </el-dialog>
    </div>
    <el-empty v-else description="资源资料暂未加载，请返回列表或刷新重试" />
    <el-dialog
        :model-value="!!evaluationId"
        title="合作评价"
        width="640px"
        destroy-on-close
        @close="evaluationId = 0"
    >
        <CooperationEvaluation
            v-if="evaluationId && resource"
            :resource-id="resource.id"
            :cooperation-id="evaluationId"
            @saved="load"
            @followup="evaluationFollowup"
        />
    </el-dialog>
</template>
<style scoped>
.resource-detail {
    padding: 20px;
}
.resource-actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 16px;
}
h2 {
    margin: 0;
    font-size: 18px;
}
@media (max-width: 767px) {
    .resource-detail {
        padding: 0;
    }
}
</style>
