<script setup lang="ts">
import ResponsiveTable from '@/components/ResponsiveTable.vue'
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { taskApi } from '@/api/modules/task'
import {
    emptyTask,
    taskPayload,
    toBusinessInput,
    type Task,
    type TaskPreview,
} from '@/api/task-types'
import { formatDateTime } from '@/utils/dateTime'
import TaskEditor from './TaskEditor.vue'
const open = defineModel<boolean>({ required: true })
const props = defineProps<{ task?: Task; copy?: boolean; projectId?: number }>()
const emit = defineEmits<{ saved: [id: number] }>()
const model = ref(emptyTask()),
    editor = ref<InstanceType<typeof TaskEditor>>(),
    preview = ref<TaskPreview>(),
    busy = ref(false),
    reason = ref(''),
    conflictReason = ref(''),
    requestKey = ref('')
watch(open, (value) => {
    if (!value) return
    const t = props.task
    model.value = t
        ? {
              projectId: t.projectId,
              teamId: t.teamId,
              title: t.title,
              form: t.form,
              kind: t.kind,
              pointId: t.pointId,
              location: t.location,
              address: t.address,
              startAt: toBusinessInput(t.startAt),
              endAt: toBusinessInput(t.endAt),
              leaderId: t.leaderId,
              staffIds: [...t.staffIds],
              expectedPeople: t.expectedPeople,
              description: t.description,
              evidence: t.evidence,
              indicators: t.indicators.map((i) => ({
                  indicatorId: i.indicatorId,
                  plannedValue: i.plannedValue,
              })),
              resources: t.resources.map((r) => ({
                  resourceId: r.resourceId ?? 0,
                  contactId: r.contactId,
                  collaboration: r.collaboration,
              })),
          }
        : { ...emptyTask(), projectId: props.projectId ?? 0 }
    preview.value = undefined
    reason.value = ''
    conflictReason.value = ''
    requestKey.value = crypto.randomUUID()
})
watch(
    model,
    () => {
        preview.value = undefined
        requestKey.value = crypto.randomUUID()
    },
    { deep: true },
)
function invalidate() {
    preview.value = undefined
    requestKey.value = crypto.randomUUID()
}
async function review() {
    if (!editor.value?.valid()) return
    busy.value = true
    try {
        preview.value = await taskApi.preview({
            ...taskPayload(model.value),
            recurrence: editor.value.recurrence(),
            ...(props.task && !props.copy ? { excludeId: props.task.id } : {}),
        })
    } catch {
        /* 请求层提示 */
    } finally {
        busy.value = false
    }
}
async function save() {
    if (!editor.value?.valid()) return
    if (!preview.value) {
        ElMessage.warning('请先预览安排')
        return
    }
    if (props.task && !props.copy && !reason.value.trim()) {
        ElMessage.warning('请填写变更原因')
        return
    }
    if (
        (preview.value.conflicts.length || preview.value.warnings.length) &&
        !conflictReason.value.trim()
    ) {
        ElMessage.warning('请填写冲突或超量处理说明')
        return
    }
    busy.value = true
    try {
        const fields = {
            ...taskPayload(model.value),
            previewToken: preview.value.previewToken,
            conflictReason: conflictReason.value,
        }
        const id =
            props.task && !props.copy
                ? (await taskApi.update(props.task.id, {
                      ...fields,
                      version: props.task.version,
                      reason: reason.value,
                  }),
                  props.task.id)
                : (
                      await taskApi.create(
                          {
                              ...fields,
                              requestKey: requestKey.value,
                              recurrence: editor.value.recurrence(),
                          },
                          props.copy ? props.task?.id : undefined,
                      )
                  ).id
        ElMessage.success('安排已保存')
        open.value = false
        emit('saved', id)
    } catch {
        preview.value = undefined
    } finally {
        busy.value = false
    }
}
</script>
<template>
    <el-dialog
        v-model="open"
        :title="props.task ? (props.copy ? '复制服务任务' : '修改任务安排') : '新增服务任务'"
        width="820px"
        destroy-on-close
        :close-on-click-modal="false"
        :close-on-press-escape="!busy"
        :show-close="!busy"
    >
        <div v-loading="busy">
            <TaskEditor
                v-if="open"
                ref="editor"
                v-model="model"
                :locked="!!props.task && !props.copy"
                @change="invalidate"
            />
            <el-form v-if="props.task && !props.copy" label-width="100px">
                <el-form-item label="变更原因" required>
                    <el-input v-model="reason" type="textarea" maxlength="1000" />
                </el-form-item>
            </el-form>
            <template v-if="preview">
                <el-divider>安排预览（{{ preview.instances.length }}项）</el-divider>
                <ResponsiveTable :data="preview.instances" max-height="240">
                    <el-table-column type="index" width="55" />
                    <el-table-column label="开始时间">
                        <template #default="{ row }">{{ formatDateTime(row.startAt) }}</template>
                    </el-table-column>
                    <el-table-column label="结束时间">
                        <template #default="{ row }">{{ formatDateTime(row.endAt) }}</template>
                    </el-table-column>
                </ResponsiveTable>
                <el-alert
                    v-for="(c, index) in preview.conflicts"
                    :key="`c${index}`"
                    type="warning"
                    :closable="false"
                    :title="`第${c.instance + 1}项：${c.staffNames.join('、')} ${c.title}（${formatDateTime(c.startAt)}至${formatDateTime(c.endAt)}）`"
                />
                <el-alert
                    v-for="(w, index) in preview.warnings"
                    :key="`w${index}`"
                    type="warning"
                    :closable="false"
                    :title="w"
                />
                <el-input
                    v-if="preview.conflicts.length || preview.warnings.length"
                    v-model="conflictReason"
                    type="textarea"
                    maxlength="1000"
                    placeholder="填写冲突或超量处理说明，确认后继续安排"
                />
            </template>
        </div>
        <template #footer>
            <el-button :disabled="busy" @click="open = false">关闭</el-button>
            <el-button :loading="busy" @click="review">预览安排</el-button>
            <el-button type="primary" :loading="busy" :disabled="!preview" @click="save">
                确认保存
            </el-button>
        </template>
    </el-dialog>
</template>
