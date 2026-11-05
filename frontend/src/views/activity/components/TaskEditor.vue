<script setup lang="ts">
import RegionSelect from '@/components/RegionSelect.vue'
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { taskApi } from '@/api/modules/task'
import {
    taskForms,
    emptyCandidates,
    taskPayload,
    type TaskInput,
    type Recurrence,
} from '@/api/task-types'
import { useMock } from '@/api/config'
const model = defineModel<TaskInput>({ required: true })
const emit = defineEmits<{ change: [] }>()
const props = defineProps<{ locked?: boolean }>()
const candidates = ref(emptyCandidates()),
    loading = ref(false)
const repeat = ref(false),
    frequency = ref<'DAILY' | 'WEEKLY'>('WEEKLY'),
    until = ref(''),
    weekdays = ref<number[]>([3])
watch([repeat, frequency, until, weekdays], () => emit('change'), { deep: true })
const teams = computed(() =>
    candidates.value.teams.filter((t) => t.projectId === model.value.projectId),
)
const targets = computed(() =>
    candidates.value.targets.filter(
        (t) => t.projectId === model.value.projectId && t.teamId === model.value.teamId,
    ),
)
let generation = 0
async function load() {
    if (useMock) return
    const seq = ++generation
    loading.value = true
    try {
        const payload = model.value.startAt && model.value.endAt ? taskPayload(model.value) : null
        const result = await taskApi.candidates({
            ...(model.value.projectId ? { projectId: model.value.projectId } : {}),
            ...(model.value.teamId ? { teamId: model.value.teamId } : {}),
            ...(payload ? { startAt: payload.startAt, endAt: payload.endAt } : {}),
        })
        if (seq === generation) candidates.value = result
    } catch {
        /* 请求层提示 */
    } finally {
        if (seq === generation) loading.value = false
    }
}
watch(
    () => [model.value.projectId, model.value.teamId, model.value.startAt, model.value.endAt],
    () => {
        void load()
    },
    { immediate: true },
)
function projectChange() {
    model.value.teamId = 0
    model.value.pointId = null
    model.value.staffIds = []
    model.value.leaderId = 0
    model.value.indicators = []
}
function teamChange() {
    model.value.staffIds = []
    model.value.leaderId = 0
    model.value.indicators = []
}
function pointChange() {
    const p = candidates.value.points.find((p) => p.id === model.value.pointId)
    if (p) {
        model.value.location = p.name
        model.value.address = p.address ?? ''
        model.value.regionCode = p.regionCode ?? null
        model.value.regionPathSnapshot = p.regionPathSnapshot
    }
}
function valid() {
    const m = model.value
    if (
        !m.projectId ||
        !m.teamId ||
        !m.title.trim() ||
        !m.location.trim() ||
        !m.startAt ||
        !m.endAt ||
        !m.staffIds.length ||
        !m.staffIds.includes(m.leaderId)
    ) {
        ElMessage.warning('请补齐项目、团队、标题、地点、时间及负责人和工作人员')
        return false
    }
    if (
        m.kind === 'INDICATOR' &&
        (!m.indicators.length ||
            m.indicators.some(
                (i) =>
                    !i.indicatorId ||
                    !/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/.test(i.plannedValue) ||
                    Number(i.plannedValue) <= 0,
            ))
    ) {
        ElMessage.warning('请选择指标并填写正数计划量，最多两位小数')
        return false
    }
    if (m.resources.some((r) => !r.resourceId || !r.collaboration.trim())) {
        ElMessage.warning('请补齐资源及协作说明')
        return false
    }
    if (
        repeat.value &&
        (!until.value || (frequency.value === 'WEEKLY' && !weekdays.value.length))
    ) {
        ElMessage.warning('请补齐周期截止日及重复星期')
        return false
    }
    return true
}
defineExpose({
    valid,
    recurrence: (): Recurrence | undefined =>
        repeat.value
            ? { frequency: frequency.value, until: until.value, weekdays: weekdays.value }
            : undefined,
})
</script>
<template>
    <el-form v-loading="loading" label-width="100px" class="task-editor">
        <el-form-item label="合同包项目" required>
            <el-select
                :model-value="model.projectId || undefined"
                @update:model-value="model.projectId = $event"
                :disabled="props.locked"
                @change="projectChange"
            >
                <el-option
                    v-for="p in candidates.projects"
                    :key="p.id"
                    :label="p.name"
                    :value="p.id"
                />
            </el-select>
        </el-form-item>
        <el-form-item label="服务团队" required>
            <el-select
                :model-value="model.teamId || undefined"
                @update:model-value="model.teamId = $event"
                :disabled="props.locked"
                @change="teamChange"
            >
                <el-option v-for="t in teams" :key="t.teamId" :label="t.name" :value="t.teamId" />
            </el-select>
        </el-form-item>
        <el-form-item label="任务标题" required>
            <el-input v-model="model.title" maxlength="150" />
        </el-form-item>
        <el-form-item label="服务形式" required>
            <el-select v-model="model.form">
                <el-option v-for="(name, key) in taskForms" :key="key" :label="name" :value="key" />
            </el-select>
        </el-form-item>
        <el-form-item label="任务类别">
            <el-radio-group v-model="model.kind" @change="model.indicators = []">
                <el-radio value="INDICATOR">指标任务</el-radio>
                <el-radio value="OTHER">指标外任务</el-radio>
            </el-radio-group>
        </el-form-item>
        <el-form-item label="项目服务点">
            <el-select
                v-model="model.pointId"
                clearable
                placeholder="选择服务点或填写临时地点"
                @change="pointChange"
            >
                <el-option
                    v-for="p in candidates.points.filter((p) => p.projectId === model.projectId)"
                    :key="p.id"
                    :label="p.name"
                    :value="p.id"
                />
            </el-select>
        </el-form-item>
        <el-form-item label="地点名称" required>
            <el-input v-model="model.location" maxlength="150" />
        </el-form-item>
        <el-form-item label="地区" required>
            <RegionSelect
                v-model="model.regionCode"
                :disabled="!!model.pointId"
                terminal
                :legacy="model.address"
            />
        </el-form-item>
        <el-form-item label="详细地址" required>
            <el-input v-model="model.address" :disabled="!!model.pointId" maxlength="255" />
        </el-form-item>
        <el-form-item label="开始时间" required>
            <el-date-picker
                v-model="model.startAt"
                type="datetime"
                value-format="YYYY-MM-DDTHH:mm:ss"
                placeholder="北京时间"
            />
        </el-form-item>
        <el-form-item label="结束时间" required>
            <el-date-picker
                v-model="model.endAt"
                type="datetime"
                value-format="YYYY-MM-DDTHH:mm:ss"
                placeholder="北京时间"
            />
        </el-form-item>
        <el-form-item label="工作人员" required>
            <el-select v-model="model.staffIds" multiple filterable>
                <el-option
                    v-for="u in candidates.staff"
                    :key="u.id"
                    :label="u.name"
                    :value="u.id"
                />
            </el-select>
        </el-form-item>
        <el-form-item label="负责人" required>
            <el-select
                :model-value="model.leaderId || undefined"
                @update:model-value="model.leaderId = $event"
            >
                <el-option
                    v-for="u in candidates.staff.filter((u) => model.staffIds.includes(u.id))"
                    :key="u.id"
                    :label="u.name"
                    :value="u.id"
                />
            </el-select>
        </el-form-item>
        <el-form-item label="预计人数">
            <el-input-number
                v-model="model.expectedPeople"
                :min="0"
                :max="1000000"
                :precision="0"
            />
        </el-form-item>
        <el-form-item label="服务说明">
            <el-input v-model="model.description" type="textarea" maxlength="10000" />
        </el-form-item>
        <el-form-item label="凭证要求">
            <el-input
                v-model="model.evidence"
                type="textarea"
                maxlength="1000"
                placeholder="如服务照片、签到记录等"
            />
        </el-form-item>
        <template v-if="model.kind === 'INDICATOR'">
            <el-divider content-position="left">关联指标及计划量</el-divider>
            <div v-for="(i, index) in model.indicators" :key="index" class="task-editor__row">
                <el-select
                    :model-value="i.indicatorId || undefined"
                    @update:model-value="i.indicatorId = $event"
                    placeholder="选择团队指标"
                >
                    <el-option
                        v-for="t in targets"
                        :key="t.id"
                        :label="`${t.name}（${t.unit}）${t.plan ? '' : ' · 待发布计划'}`"
                        :value="t.indicatorId"
                    />
                </el-select>
                <el-input v-model="i.plannedValue" placeholder="计划量" />
                <el-button @click="model.indicators.splice(index, 1)">移除</el-button>
            </div>
            <el-button @click="model.indicators.push({ indicatorId: 0, plannedValue: '' })">
                添加指标
            </el-button>
        </template>
        <el-divider content-position="left">协作资源</el-divider>
        <div v-for="(r, index) in model.resources" :key="index" class="task-editor__resource">
            <div class="task-editor__row">
                <el-select
                    :model-value="r.resourceId || undefined"
                    @update:model-value="r.resourceId = $event"
                    filterable
                    placeholder="选择单位资源"
                    @change="r.contactId = null"
                >
                    <el-option
                        v-for="u in candidates.resources"
                        :key="u.id"
                        :label="u.name"
                        :value="u.id"
                    />
                </el-select>
                <el-select v-model="r.contactId" clearable placeholder="联系人（可选）">
                    <el-option
                        v-for="c in candidates.resources.find((u) => u.id === r.resourceId)
                            ?.contacts ?? []"
                        :key="c.id"
                        :label="c.name"
                        :value="c.id"
                    />
                </el-select>
                <el-button @click="model.resources.splice(index, 1)">移除</el-button>
            </div>
            <el-input
                v-model="r.collaboration"
                maxlength="1000"
                placeholder="协作内容与场地档期确认说明"
            />
        </div>
        <el-button
            @click="model.resources.push({ resourceId: 0, contactId: null, collaboration: '' })"
        >
            添加协作资源
        </el-button>
        <template v-if="!props.locked">
            <el-divider content-position="left">周期生成</el-divider>
            <el-form-item label="重复安排"><el-switch v-model="repeat" /></el-form-item>
            <template v-if="repeat">
                <el-form-item label="频率">
                    <el-radio-group v-model="frequency">
                        <el-radio value="DAILY">每天</el-radio>
                        <el-radio value="WEEKLY">每周</el-radio>
                    </el-radio-group>
                </el-form-item>
                <el-form-item v-if="frequency === 'WEEKLY'" label="重复星期">
                    <el-checkbox-group v-model="weekdays">
                        <el-checkbox
                            v-for="(label, index) in ['日', '一', '二', '三', '四', '五', '六']"
                            :key="index"
                            :value="index"
                        >
                            周{{ label }}
                        </el-checkbox>
                    </el-checkbox-group>
                </el-form-item>
                <el-form-item label="截止日期">
                    <el-date-picker v-model="until" value-format="YYYY-MM-DD" />
                </el-form-item>
            </template>
        </template>
    </el-form>
</template>
<style scoped>
.task-editor__row {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
    align-items: center;
}
.task-editor__resource {
    margin-bottom: 16px;
}
.task-editor :deep(.el-select),
.task-editor :deep(.el-date-editor) {
    width: 100%;
}
@media (max-width: 767px) {
    .task-editor__row {
        flex-direction: column;
        align-items: stretch;
    }
    .task-editor__row > * {
        width: 100%;
    }
}
</style>
