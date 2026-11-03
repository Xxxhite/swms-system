<script setup lang="ts">
import ResponsiveTable from '@/components/ResponsiveTable.vue'
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { taskApi } from '@/api/modules/task'
import { emptyCandidates, splitAmount, type PlanInput } from '@/api/task-types'
import { useMock } from '@/api/config'
const model = defineModel<PlanInput>({ required: true })
const props = defineProps<{ locked?: boolean }>()
const candidates = ref(emptyCandidates())
const target = computed(() => candidates.value.targets.find((t) => t.id === model.value.targetId))
function monthly() {
    const t = target.value
    if (!t) return
    const periods: Array<{ startDate: string; endDate: string; targetValue: string }> = []
    let day = t.contract.startDate
    while (day <= t.contract.endDate) {
        const last = new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)), 0))
                .toISOString()
                .slice(0, 10),
            end = last < t.contract.endDate ? last : t.contract.endDate
        periods.push({ startDate: day, endDate: end, targetValue: '0.00' })
        day = new Date(Date.parse(end) + 86400000).toISOString().slice(0, 10)
    }
    model.value.periods = periods
    split()
}
function split() {
    if (!target.value || !model.value.periods?.length) return
    const amounts = splitAmount(target.value.targetValue, model.value.periods.length)
    model.value.periods.forEach((p, i) => (p.targetValue = amounts[i]!))
}
function targetChange() {
    model.value.periods = []
    if (model.value.mode === 'MONTHLY') monthly()
}
function valid() {
    const m = model.value
    if (!m.targetId || !m.effectiveDate || !m.reason.trim() || !m.periods?.length) {
        ElMessage.warning('请填写团队指标、生效日、原因及阶段明细')
        return false
    }
    if (
        m.periods.some(
            (p) =>
                !p.startDate || !p.endDate || !/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/.test(p.targetValue),
        )
    ) {
        ElMessage.warning('请填写完整区间和非负计划量，最多两位小数')
        return false
    }
    return true
}
defineExpose({ valid })
onMounted(async () => {
    if (!useMock)
        try {
            candidates.value = await taskApi.candidates()
        } catch {
            /* 请求层提示 */
        }
})
</script>
<template>
    <el-form label-width="100px">
        <el-form-item label="团队指标" required>
            <el-select
                :model-value="model.targetId || undefined"
                @update:model-value="model.targetId = $event"
                :disabled="props.locked"
                filterable
                @change="targetChange"
            >
                <el-option
                    v-for="t in candidates.targets"
                    :key="t.id"
                    :label="`${candidates.projects.find((p) => p.id === t.projectId)?.name} / ${candidates.teams.find((x) => x.teamId === t.teamId)?.name} / ${t.name}`"
                    :value="t.id"
                />
            </el-select>
        </el-form-item>
        <el-form-item v-if="target" label="团队目标">
            {{ target.targetValue }} {{ target.unit }}（{{ target.contract.startDate }}至{{
                target.contract.endDate
            }}）
        </el-form-item>
        <el-form-item label="分解方式">
            <el-radio-group v-model="model.mode" @change="targetChange">
                <el-radio value="MONTHLY">月度</el-radio>
                <el-radio value="MILESTONE">里程碑</el-radio>
            </el-radio-group>
        </el-form-item>
        <el-form-item label="生效日期" required>
            <el-date-picker v-model="model.effectiveDate" value-format="YYYY-MM-DD" />
        </el-form-item>
        <el-form-item label="计划原因" required>
            <el-input v-model="model.reason" type="textarea" maxlength="1000" />
        </el-form-item>
        <el-alert
            title="阶段区间须连续覆盖合同期间，合计等于团队目标。发布后通过新版本调整，已结束阶段保留原计划量。"
            type="info"
            :closable="false"
        />
        <div class="plan-editor__actions">
            <el-button v-if="model.mode === 'MONTHLY'" @click="monthly">按月生成并均分</el-button>
            <el-button
                v-else
                @click="
                    (model.periods ??= []).push({ startDate: '', endDate: '', targetValue: '' })
                "
            >
                添加阶段
            </el-button>
            <el-button @click="split">均分目标</el-button>
        </div>
        <ResponsiveTable :mobile-cards="false" :data="model.periods">
            <el-table-column type="index" width="55" />
            <el-table-column label="开始日期" min-width="175">
                <template #default="{ row }">
                    <el-date-picker
                        v-model="row.startDate"
                        :disabled="model.mode === 'MONTHLY'"
                        value-format="YYYY-MM-DD"
                    />
                </template>
            </el-table-column>
            <el-table-column label="结束日期" min-width="175">
                <template #default="{ row }">
                    <el-date-picker
                        v-model="row.endDate"
                        :disabled="model.mode === 'MONTHLY'"
                        value-format="YYYY-MM-DD"
                    />
                </template>
            </el-table-column>
            <el-table-column label="计划量" min-width="110">
                <template #default="{ row }"><el-input v-model="row.targetValue" /></template>
            </el-table-column>
            <el-table-column v-if="model.mode === 'MILESTONE'" width="70">
                <template #default="{ $index }">
                    <el-button link type="danger" @click="model.periods?.splice($index, 1)">
                        移除
                    </el-button>
                </template>
            </el-table-column>
        </ResponsiveTable>
    </el-form>
</template>
<style scoped>
.plan-editor__actions {
    display: flex;
    gap: 8px;
    margin: 16px 0;
}
.el-select,
.el-date-editor {
    width: 100%;
}
@media (max-width: 767px) {
    .plan-editor__actions {
        flex-wrap: wrap;
    }
}
</style>
