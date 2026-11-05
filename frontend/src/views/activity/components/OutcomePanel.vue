<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { outcomeApi } from '@/api/modules/outcome'
import { serviceApi } from '@/api/modules/service'
import { businessStatus } from '@/api/business-types'
import { calculationLabels, type OutcomeDetail, type OutcomeRecord } from '@/api/outcome-types'
import { useUserStore } from '@/stores/user'
import ResponsiveTable from '@/components/ResponsiveTable.vue'
import OutcomeReview from './OutcomeReview.vue'
const props = defineProps<{ taskId: number; ended?: boolean; simple?: boolean }>(),
    emit = defineEmits<{ changed: [] }>(),
    store = useUserStore()
const data = ref<OutcomeDetail>(),
    busy = ref(false),
    summary = ref(''),
    manualValues = ref<Record<string, string>>({}),
    fileInput = ref<HTMLInputElement>(),
    pendingSubmission = ref<Parameters<typeof outcomeApi.submit>[1]>(),
    evidenceIds = ref<number[]>([]),
    pending = ref<Array<{ file: File; key: string }>>([])
const historyOpen = ref(false),
    history = ref<Awaited<ReturnType<typeof outcomeApi.snapshot>>>()
const canSubmit = computed(
    () =>
        !!pendingSubmission.value ||
        (!!data.value &&
            (data.value.records.some(
                (r) => ['DRAFT', 'REJECTED'].includes(r.record.status) && !r.record.submittedAt,
            ) ||
                (!data.value.source?.rules.length &&
                    ['DRAFT', 'REJECTED'].includes(data.value.outcome?.summaryStatus ?? '')))),
)
async function load() {
    try {
        data.value = await outcomeApi.detail(props.taskId)
        summary.value = data.value.outcome?.summary ?? ''
        manualValues.value = Object.fromEntries(
            (data.value.source?.rules ?? [])
                .filter((r) => r.mode === 'MANUAL')
                .map((r) => [String(r.indicatorId), r.manualValue]),
        )
        evidenceIds.value = []
    } catch {
        /* 请求层提示 */
    }
}
async function execute(work: () => Promise<unknown>) {
    if (busy.value) return
    busy.value = true
    try {
        await work()
        await load()
        emit('changed')
    } catch {
        /* 请求层提示 */
    } finally {
        busy.value = false
    }
}
function withdrawSummary() {
    void execute(() => outcomeApi.withdrawSummary(props.taskId))
}
function withdrawRecord(row: OutcomeRecord) {
    void execute(() => serviceApi.withdrawSubmission(row.recordId))
}
function withdrawChange(row: OutcomeRecord) {
    if (row.pendingChange) void execute(() => serviceApi.withdraw(row.pendingChange!.id))
}
function generate() {
    void execute(() => outcomeApi.generate(props.taskId))
}
async function save() {
    const current = data.value
    if (!current?.outcome) return
    await outcomeApi.save(props.taskId, {
        version: current.outcome.version,
        sourceVersion: current.sourceVersion,
        summary: summary.value,
        manualValues: manualValues.value,
        evidenceIds: evidenceIds.value,
    })
}
function saveClicked() {
    void execute(save)
}
async function submit() {
    if (!pendingSubmission.value) {
        await save()
        await load()
        const current = data.value
        if (!current?.outcome) return
        pendingSubmission.value = {
            version: current.outcome.version,
            sourceVersion: current.sourceVersion,
            recordIds: current.records
                .filter(
                    (r) => ['DRAFT', 'REJECTED'].includes(r.record.status) && !r.record.submittedAt,
                )
                .map((r) => r.recordId),
            requestKey: crypto.randomUUID(),
        }
    }
    await outcomeApi.submit(props.taskId, pendingSubmission.value)
    pendingSubmission.value = undefined
    ElMessage.success('已提交直接主管审批')
}
async function change(row: OutcomeRecord, operation: 'CORRECT' | 'DELETE' | 'RESTORE') {
    try {
        const { value } = await ElMessageBox.prompt(
            '请说明此次更正、撤销或恢复的原因',
            '来源档案变更',
            { inputType: 'textarea', inputPattern: /\S/, inputErrorMessage: '请填写原因' },
        )
        await execute(async () => {
            if (!props.simple) await save()
            await load()
            const record = data.value!.records.find((r) => r.recordId === row.recordId)!.record
            await serviceApi.change(
                { id: record.id, version: record.version } as Parameters<
                    typeof serviceApi.change
                >[0],
                { operation, reason: value },
            )
            ElMessage.success('变更已提交主管确认')
        })
    } catch {
        /* 取消或请求层提示 */
    }
}
async function upload() {
    busy.value = true
    try {
        while (pending.value.length) {
            const p = pending.value[0]!
            const file = await outcomeApi.upload(props.taskId, p.file, p.key)
            evidenceIds.value = [...new Set([...evidenceIds.value, file.id])]
            pending.value.shift()
        }
        await save()
        await load()
        emit('changed')
    } catch {
        /* 保留原文件与请求键以供重试 */
    } finally {
        busy.value = false
    }
}
function files(event: Event) {
    const input = event.target as HTMLInputElement
    for (const file of Array.from(input.files ?? []))
        pending.value.push({ file, key: crypto.randomUUID() })
    input.value = ''
    void upload()
}
async function openHistory(id: number) {
    try {
        history.value = await outcomeApi.snapshot(id)
        historyOpen.value = true
    } catch {
        /* 请求层提示 */
    }
}
onMounted(load)
</script>
<template>
    <section v-loading="busy" class="outcome-panel">
        <div class="page-actions">
            <h3>{{ simple ? '档案与审批状态' : '服务档案整理' }}</h3>
            <el-button @click="load">刷新整理</el-button>
        </div>
        <el-alert
            v-if="!ended"
            title="服务结束后可整理档案，现场数据会自动带入。"
            type="info"
            :closable="false"
        />
        <el-button
            v-if="
                !simple &&
                ended &&
                !data?.outcome &&
                data?.canMaintain &&
                store.hasPermission('service:monthly:create')
            "
            type="primary"
            @click="generate"
        >
            生成来源草稿
        </el-button>
        <template v-if="data?.outcome">
            <el-alert
                v-if="data.sourceStale"
                title="现场来源已变化，请保存并刷新来源后再提交；原已批准数量继续有效。"
                type="warning"
                :closable="false"
            />
            <el-form
                v-if="!simple"
                label-position="top"
                :disabled="!data.canMaintain || !!pendingSubmission"
            >
                <el-form-item label="服务总结" required>
                    <el-input
                        v-model="summary"
                        type="textarea"
                        :rows="4"
                        maxlength="4000"
                        show-word-limit
                    />
                </el-form-item>
                <el-form-item
                    v-for="rule in data.source?.rules.filter((r) => r.mode === 'MANUAL') ?? []"
                    :key="rule.indicatorId"
                    :label="`${rule.indicatorName}（${rule.unit}）`"
                    required
                >
                    <el-input
                        v-model="manualValues[String(rule.indicatorId)]"
                        placeholder="非负数，最多两位小数"
                    />
                </el-form-item>
            </el-form>
            <div class="page-actions">
                <el-button
                    v-if="!simple && data.canMaintain"
                    :disabled="busy || !!pendingSubmission"
                    @click="saveClicked"
                >
                    保存并刷新来源
                </el-button>
                <el-button
                    v-if="
                        !simple &&
                        data.canMaintain &&
                        store.hasPermission('service:evidence:upload')
                    "
                    :disabled="busy"
                    @click="fileInput?.click()"
                >
                    上传整理凭证
                </el-button>
                <el-button v-if="pending.length" type="warning" @click="upload">
                    重试上传（{{ pending.length }}）
                </el-button>
                <el-button
                    v-if="
                        !simple &&
                        data.canMaintain &&
                        canSubmit &&
                        store.hasPermission('service:monthly:submit')
                    "
                    type="primary"
                    :disabled="busy"
                    @click="execute(submit)"
                >
                    {{ pendingSubmission ? '重试提交' : '提交未生效成果' }}
                </el-button>
                <el-button v-if="pendingSubmission" @click="pendingSubmission = undefined">
                    重新整理
                </el-button>
                <el-button
                    v-if="data.outcome.summaryStatus === 'IN_REVIEW'"
                    @click="withdrawSummary"
                >
                    撤回总结
                </el-button>
            </div>
            <input
                ref="fileInput"
                type="file"
                multiple
                accept=".jpg,.jpeg,.png,.pdf"
                hidden
                @change="files"
            />
            <p>
                {{
                    simple
                        ? '更正数量前先保存上方登记，再在对应档案申请更正；原批准量保留至更正批准。'
                        : '保存保留一份来源快照；提交后由直接主管核验，批准后计入正式量。'
                }}
            </p>
            <ResponsiveTable :data="data.records">
                <el-table-column label="成果指标">
                    <template #default="{ row }">
                        {{
                            data.source?.rules.find((r) => r.indicatorId === row.indicatorId)
                                ?.indicatorName
                        }}
                    </template>
                </el-table-column>
                <el-table-column label="计算口径">
                    <template #default="{ row }">
                        {{
                            calculationLabels[
                                data.source?.rules.find((r) => r.indicatorId === row.indicatorId)
                                    ?.mode ?? 'MANUAL'
                            ]
                        }}
                    </template>
                </el-table-column>
                <el-table-column label="档案数量">
                    <template #default="{ row }">{{ row.record.actualValue }}</template>
                </el-table-column>
                <el-table-column label="状态">
                    <template #default="{ row }">
                        {{ businessStatus[row.record.status] ?? row.record.status }}
                    </template>
                </el-table-column>
                <el-table-column label="操作">
                    <template #default="{ row }">
                        <el-button
                            v-if="row.record.status === 'IN_REVIEW'"
                            link
                            @click="withdrawRecord(row as OutcomeRecord)"
                        >
                            撤回提交
                        </el-button>
                        <span v-if="row.pendingChange">变更待审</span>
                        <el-button
                            v-if="row.pendingChange?.applicantId === store.profile?.id"
                            link
                            @click="withdrawChange(row as OutcomeRecord)"
                        >
                            撤回变更
                        </el-button>
                        <template
                            v-if="
                                data.canMaintain &&
                                !row.pendingChange &&
                                row.record.status === 'SUBMITTED'
                            "
                        >
                            <el-button link @click="change(row as OutcomeRecord, 'CORRECT')">
                                申请更正
                            </el-button>
                            <el-button
                                link
                                type="danger"
                                @click="change(row as OutcomeRecord, 'DELETE')"
                            >
                                申请撤销
                            </el-button>
                        </template>
                        <el-button
                            v-if="
                                data.canMaintain &&
                                !row.pendingChange &&
                                row.record.status === 'VOID' &&
                                row.record.submittedAt
                            "
                            link
                            @click="change(row as OutcomeRecord, 'RESTORE')"
                        >
                            申请恢复
                        </el-button>
                    </template>
                </el-table-column>
            </ResponsiveTable>
            <el-collapse>
                <el-collapse-item title="登记依据与历史">
                    <OutcomeReview v-if="data.source" :source="data.source" />
                    <h4>来源历史</h4>
                    <div class="page-actions">
                        <el-button
                            v-for="snapshot in data.snapshots"
                            :key="snapshot.id"
                            @click="openHistory(snapshot.id)"
                        >
                            快照{{ snapshot.id }} · 来源版本{{ snapshot.sourceVersion }}
                        </el-button>
                    </div>
                </el-collapse-item>
            </el-collapse>
        </template>
        <el-dialog v-model="historyOpen" title="服务来源快照" width="860px">
            <OutcomeReview v-if="history" :source="history.source" />
        </el-dialog>
    </section>
</template>
<style scoped>
.outcome-panel {
    min-width: 0;
}
.outcome-panel > .el-alert {
    margin: 12px 0;
}
.outcome-panel p {
    line-height: 1.7;
    overflow-wrap: anywhere;
}
.outcome-panel .el-form {
    margin-top: 16px;
}
</style>
