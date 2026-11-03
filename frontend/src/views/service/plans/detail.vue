<script setup lang="ts">
defineOptions({ name: 'ServicePlanDetail' })
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { planApi } from '@/api/modules/plan'
import { businessDay, type Plan } from '@/api/task-types'
import { formatDateTime } from '@/utils/dateTime'
import { useMock } from '@/api/config'
import PlanDialog from './components/PlanDialog.vue'
const route = useRoute(),
    router = useRouter(),
    plan = ref<Plan>(),
    loading = ref(false),
    busy = ref(false),
    dialog = ref(false),
    copyDialog = ref(false),
    effectiveDate = ref(businessDay()),
    reason = ref('')
async function load() {
    if (useMock) return
    loading.value = true
    try {
        plan.value = await planApi.detail(Number(route.params.id))
    } catch {
        plan.value = undefined
    } finally {
        loading.value = false
    }
}
async function publish() {
    if (!plan.value) return
    try {
        await ElMessageBox.confirm('发布后本版保持不变，后续调整请复制新版本。', '发布阶段计划', {
            type: 'warning',
        })
        busy.value = true
        await planApi.publish(plan.value.id, plan.value.version)
        ElMessage.success('计划已发布')
        await load()
    } catch {
        /* 请求层提示或取消 */
    } finally {
        busy.value = false
    }
}
function openCopy() {
    effectiveDate.value = businessDay()
    reason.value = ''
    copyDialog.value = true
}
async function copy() {
    if (!plan.value || !reason.value.trim() || !effectiveDate.value) {
        ElMessage.warning('请填写生效日和调整原因')
        return
    }
    busy.value = true
    try {
        const result = await planApi.copy(plan.value.id, effectiveDate.value, reason.value)
        copyDialog.value = false
        await router.push(`/service/plans/${result.id}`)
    } catch {
        /* 请求层提示 */
    } finally {
        busy.value = false
    }
}
watch(() => route.params.id, load)
onMounted(load)
</script>
<template>
    <section v-loading="loading">
        <div class="plan-detail__header">
            <el-button @click="router.push('/service/plans')">返回阶段计划</el-button>
            <div v-if="plan?.canManage">
                <el-button v-if="plan.status === 'DRAFT'" @click="dialog = true">
                    编辑草稿
                </el-button>
                <el-button
                    v-if="plan.status === 'DRAFT'"
                    type="primary"
                    :loading="busy"
                    :disabled="plan.stale"
                    @click="publish"
                >
                    发布计划
                </el-button>
                <el-button @click="openCopy">复制调整版</el-button>
            </div>
        </div>
        <template v-if="plan">
            <h2>{{ plan.indicatorName }} · 第{{ plan.revision }}版</h2>
            <el-alert
                v-if="plan.stale"
                title="指标或团队目标已变更，请核对并重新分解计划。"
                type="warning"
                :closable="false"
            />
            <el-descriptions :column="2" border>
                <el-descriptions-item label="合同包">{{ plan.projectName }}</el-descriptions-item>
                <el-descriptions-item label="团队">{{ plan.teamName }}</el-descriptions-item>
                <el-descriptions-item label="目标">
                    {{ plan.targetValue }} {{ plan.unit }}
                </el-descriptions-item>
                <el-descriptions-item label="分解方式">
                    {{ plan.mode === 'MONTHLY' ? '月度' : '里程碑' }}
                </el-descriptions-item>
                <el-descriptions-item label="状态">
                    {{ plan.status === 'PUBLISHED' ? '已发布' : '草稿' }}
                </el-descriptions-item>
                <el-descriptions-item label="生效日">{{ plan.effectiveDate }}</el-descriptions-item>
                <el-descriptions-item label="发布时间">
                    {{ formatDateTime(plan.publishedAt) }}
                </el-descriptions-item>
                <el-descriptions-item label="目标版本">
                    指标{{ plan.indicatorVersion }} / 团队{{ plan.targetVersion }}
                </el-descriptions-item>
                <el-descriptions-item label="计划原因" :span="2">
                    {{ plan.reason }}
                </el-descriptions-item>
            </el-descriptions>
            <h3>阶段目标</h3>
            <el-table :data="plan.periods">
                <el-table-column type="index" width="65" />
                <el-table-column prop="startDate" label="开始日期" />
                <el-table-column prop="endDate" label="结束日期" />
                <el-table-column prop="targetValue" label="计划量" />
            </el-table>
            <PlanDialog v-model="dialog" :plan="plan" @saved="load" />
        </template>
        <el-empty v-else-if="!loading" description="计划不存在或无权访问" />
        <el-dialog
            v-model="copyDialog"
            title="复制计划调整版"
            width="480px"
            :close-on-click-modal="false"
        >
            <el-form label-width="90px">
                <el-form-item label="生效日期" required>
                    <el-date-picker v-model="effectiveDate" value-format="YYYY-MM-DD" />
                </el-form-item>
                <el-form-item label="调整原因" required>
                    <el-input v-model="reason" type="textarea" maxlength="1000" />
                </el-form-item>
            </el-form>
            <template #footer>
                <el-button :disabled="busy" @click="copyDialog = false">关闭</el-button>
                <el-button type="primary" :loading="busy" @click="copy">创建调整草稿</el-button>
            </template>
        </el-dialog>
    </section>
</template>
<style scoped>
.plan-detail__header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 16px;
}
</style>
