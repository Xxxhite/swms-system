<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { planApi } from '@/api/modules/plan'
import { businessDay, type Plan, type PlanInput } from '@/api/task-types'
import PlanEditor from './PlanEditor.vue'
const open = defineModel<boolean>({ required: true })
const props = defineProps<{ plan?: Plan }>(),
    emit = defineEmits<{ saved: [id: number] }>()
const model = ref<PlanInput>({
        targetId: 0,
        mode: 'MONTHLY',
        effectiveDate: businessDay(),
        reason: '',
        periods: [],
    }),
    busy = ref(false),
    editor = ref<InstanceType<typeof PlanEditor>>()
watch(open, (value) => {
    if (value) {
        const p = props.plan
        model.value = p
            ? {
                  targetId: p.targetId,
                  mode: p.mode,
                  effectiveDate: p.effectiveDate,
                  reason: p.reason,
                  periods: p.periods.map((r) => ({
                      startDate: r.startDate,
                      endDate: r.endDate,
                      targetValue: r.targetValue,
                  })),
              }
            : {
                  targetId: 0,
                  mode: 'MONTHLY',
                  effectiveDate: businessDay(),
                  reason: '',
                  periods: [],
              }
    }
})
async function save() {
    if (!editor.value?.valid()) return
    busy.value = true
    try {
        const id = props.plan
            ? (await planApi.update(props.plan.id, model.value, props.plan.version), props.plan.id)
            : (await planApi.create(model.value)).id
        ElMessage.success('计划草稿已保存')
        open.value = false
        emit('saved', id)
    } catch {
        /* 请求层提示 */
    } finally {
        busy.value = false
    }
}
</script>
<template>
    <el-dialog
        v-model="open"
        :title="props.plan ? '编辑计划草稿' : '新增阶段计划'"
        width="850px"
        destroy-on-close
        :close-on-click-modal="false"
        :close-on-press-escape="!busy"
        :show-close="!busy"
    >
        <div v-loading="busy">
            <PlanEditor v-if="open" ref="editor" v-model="model" :locked="!!props.plan" />
        </div>
        <template #footer>
            <el-button :disabled="busy" @click="open = false">关闭</el-button>
            <el-button type="primary" :loading="busy" @click="save">保存草稿</el-button>
        </template>
    </el-dialog>
</template>
