<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { outcomeApi } from '@/api/modules/outcome'
import { calculationLabels, type CalculationMode, type CalculationRule } from '@/api/outcome-types'
import { businessDay } from '@/api/task-types'
const open = defineModel<boolean>({ required: true }),
    props = defineProps<{ indicator?: { id: number; name: string; unit: string } }>()
const rows = ref<CalculationRule[]>([]),
    mode = ref<CalculationMode>('MANUAL'),
    date = ref(businessDay(new Date())),
    reason = ref(''),
    busy = ref(false)
watch(open, async (value) => {
    if (value && props.indicator) {
        try {
            rows.value = await outcomeApi.rules(props.indicator.id)
            mode.value = rows.value[0]?.mode ?? 'MANUAL'
            date.value = businessDay(new Date())
            reason.value = ''
        } catch {
            open.value = false
        }
    }
})
async function save() {
    if (!props.indicator || !reason.value.trim()) {
        ElMessage.warning('请填写口径设置原因')
        return
    }
    busy.value = true
    try {
        await outcomeApi.saveRule(props.indicator.id, {
            mode: mode.value,
            effectiveDate: date.value,
            revision: rows.value[0]?.revision ?? 0,
            reason: reason.value,
        })
        ElMessage.success('计算口径已保存')
        open.value = false
    } catch {
        /* 请求层提示 */
    } finally {
        busy.value = false
    }
}
</script>
<template>
    <el-dialog v-model="open" title="成果计算口径" width="680px" :close-on-click-modal="false">
        <p>{{ indicator?.name }}（{{ indicator?.unit }}）</p>
        <el-alert
            title="旧指标默认人工口径。无身份或时间明细的旧档案不能直接切换为人数去重或工作人员小时。新规则保留版本与生效日期。"
            :closable="false"
            type="info"
        />
        <el-form label-position="top">
            <el-form-item label="计算方式" required>
                <el-select v-model="mode">
                    <el-option
                        v-for="(label, key) in calculationLabels"
                        :key="key"
                        :label="label"
                        :value="key"
                    />
                </el-select>
            </el-form-item>
            <el-form-item label="启用日期" required>
                <el-date-picker v-model="date" value-format="YYYY-MM-DD" :clearable="false" />
            </el-form-item>
            <el-form-item label="设置原因" required>
                <el-input v-model="reason" type="textarea" maxlength="1000" />
            </el-form-item>
        </el-form>
        <p>
            人数按同项目同指标去重，合同与自然月分别计算；工作人员小时按人合并实际重叠时段，汇总后保留两位小数。
        </p>
        <p v-for="row in rows" :key="row.id">
            第{{ row.revision }}版 · {{ calculationLabels[row.mode] }} ·
            {{ row.effectiveDate }}起：{{ row.reason }}
        </p>
        <template #footer>
            <el-button @click="open = false">关闭</el-button>
            <el-button type="primary" :loading="busy" @click="save">保存新版本</el-button>
        </template>
    </el-dialog>
</template>
