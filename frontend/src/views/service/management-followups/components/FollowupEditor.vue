<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import 'element-plus/es/components/message/style/css'
import { managementApi } from '@/api/modules/management'
import { emptyFollowup, type Followup, type ManagementCandidates } from '@/api/management-types'
const props = defineProps<{
        row?: Followup
        candidates: ManagementCandidates
        initialTaskId?: number
    }>(),
    emit = defineEmits<{ saved: [id: number]; cancel: [] }>()
const model = reactive(emptyFollowup()),
    busy = ref(false),
    reason = ref('')
watch(
    () => props.row,
    (row) => {
        Object.assign(model, emptyFollowup(), row ?? {})
        if (!row && props.initialTaskId) {
            const s = props.candidates.sources.find(
                (s) => s.sourceType === 'TASK' && s.sourceId === props.initialTaskId,
            )
            if (s)
                Object.assign(model, {
                    projectId: s.projectId,
                    teamId: s.teamId,
                    sourceId: s.sourceId,
                    sourceType: 'TASK',
                })
        }
        reason.value = ''
    },
    { immediate: true },
)
const sources = computed(() =>
        props.candidates.sources.filter((s) => s.projectId === model.projectId),
    ),
    sourceKey = computed({
        get: () => `${model.sourceType}-${model.sourceId}-${model.teamId ?? 0}`,
        set: (key: string) => {
            const s = sources.value.find(
                (s) => `${s.sourceType}-${s.sourceId}-${s.teamId ?? 0}` === key,
            )
            if (s) {
                Object.assign(model, {
                    sourceType: s.sourceType,
                    sourceId: s.sourceId,
                    teamId: s.teamId,
                    ownerId: 0,
                })
            }
        },
    })
const owners = computed(
    () =>
        sources.value.find(
            (s) =>
                s.sourceType === model.sourceType &&
                s.sourceId === model.sourceId &&
                s.teamId === model.teamId,
        )?.owners ?? [],
)
function chooseProject() {
    model.sourceId = 0
    model.ownerId = 0
}
let lastContent = ''
async function save() {
    if (busy.value) return
    if (
        !model.title.trim() ||
        !model.description.trim() ||
        !model.projectId ||
        !model.sourceId ||
        !model.ownerId ||
        !model.dueDate
    ) {
        ElMessage.warning('请完整填写来源、问题、负责人和计划日期')
        return
    }
    if (props.row && !reason.value.trim()) {
        ElMessage.warning('请填写变更原因')
        return
    }
    busy.value = true
    try {
        const content = JSON.stringify({ ...model, requestKey: undefined, reason: reason.value })
        if (lastContent && content !== lastContent) model.requestKey = crypto.randomUUID()
        lastContent = content
        const result = props.row
            ? await managementApi.update(props.row.id, {
                  title: model.title,
                  description: model.description,
                  ownerId: model.ownerId,
                  dueDate: model.dueDate,
                  requestKey: model.requestKey,
                  version: props.row.version,
                  reason: reason.value,
              })
            : await managementApi.create({ ...model })
        emit('saved', result.id)
    } catch {
        /* 请求层提示；相同请求可重试 */
    } finally {
        busy.value = false
    }
}
</script>
<template>
    <el-form label-position="top" @submit.prevent="save">
        <el-form-item label="项目" required>
            <el-select
                v-model="model.projectId"
                :disabled="!!row"
                filterable
                @change="chooseProject"
            >
                <el-option
                    v-for="p in candidates.projects"
                    :key="p.id"
                    :label="p.name"
                    :value="p.id"
                />
            </el-select>
        </el-form-item>
        <el-form-item label="原业务来源" required>
            <el-select v-model="sourceKey" :disabled="!!row" filterable>
                <el-option
                    v-for="s in sources"
                    :key="`${s.sourceType}-${s.sourceId}-${s.teamId ?? 0}`"
                    :label="`${s.name} · ${s.sourceType === 'PROJECT' ? '项目' : s.sourceType === 'INDICATOR' ? '指标' : s.sourceType === 'PLAN' ? '阶段计划' : s.sourceType === 'TASK' ? '任务' : '档案'} · ${s.teamId ? (candidates.teams.find((t) => t.id === s.teamId)?.name ?? '团队') : '项目级'}`"
                    :value="`${s.sourceType}-${s.sourceId}-${s.teamId ?? 0}`"
                />
            </el-select>
        </el-form-item>
        <el-form-item label="问题标题" required>
            <el-input v-model="model.title" maxlength="150" />
        </el-form-item>
        <el-form-item label="问题描述" required>
            <el-input
                v-model="model.description"
                type="textarea"
                :rows="3"
                maxlength="2000"
                show-word-limit
            />
        </el-form-item>
        <el-form-item label="负责人" required>
            <el-select v-model="model.ownerId" filterable>
                <el-option v-for="u in owners" :key="u.id" :label="u.name" :value="u.id" />
            </el-select>
        </el-form-item>
        <el-form-item label="计划日期" required>
            <el-date-picker v-model="model.dueDate" value-format="YYYY-MM-DD" />
        </el-form-item>
        <el-form-item v-if="row" label="变更原因" required>
            <el-input v-model="reason" type="textarea" maxlength="1000" />
        </el-form-item>
        <div class="page-actions">
            <el-button type="primary" native-type="submit" :loading="busy">保存</el-button>
            <el-button :disabled="busy" @click="emit('cancel')">取消</el-button>
        </div>
    </el-form>
</template>
