<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import 'element-plus/es/components/message/style/css'
import { managementApi } from '@/api/modules/management'
import { followupStatus, followupAction, type Followup } from '@/api/management-types'
import { formatDateTime } from '@/utils/dateTime'
const props = defineProps<{ row: Followup }>(),
    emit = defineEmits<{ changed: []; edit: [] }>(),
    router = useRouter(),
    note = ref(''),
    busy = ref(false)
let requestKey = crypto.randomUUID(),
    lastContent = ''
watch(
    () => props.row.version,
    () => {
        requestKey = crypto.randomUUID()
        lastContent = ''
        note.value = ''
    },
)
async function action(action: 'START' | 'NOTE' | 'COMPLETE' | 'REOPEN') {
    if (busy.value) return
    if (!note.value.trim()) {
        ElMessage.warning('请填写处理说明／结果')
        return
    }
    const content = JSON.stringify({ action, note: note.value, version: props.row.version })
    if (lastContent && content !== lastContent) requestKey = crypto.randomUUID()
    lastContent = content
    busy.value = true
    try {
        await managementApi.transition(props.row.id, {
            action,
            note: note.value,
            version: props.row.version,
            requestKey,
        })
        ElMessage.success('处理已保存')
        emit('changed')
    } catch {
        /* 请求层提示 */
    } finally {
        busy.value = false
    }
}
</script>
<template>
    <div>
        <h3>{{ row.title }}</h3>
        <el-alert
            v-if="row.needsReassignment"
            title="负责人资格已变化，请由管理人员重新分派"
            type="warning"
            :closable="false"
        />
        <el-descriptions :column="1" border>
            <el-descriptions-item label="项目／团队">
                {{ row.projectName }}／{{ row.teamName }}
            </el-descriptions-item>
            <el-descriptions-item label="负责人">{{ row.ownerName }}</el-descriptions-item>
            <el-descriptions-item label="计划日期">
                {{ row.dueDate }} {{ row.overdue ? '（已逾期）' : '' }}
            </el-descriptions-item>
            <el-descriptions-item label="状态">
                {{ followupStatus[row.status] }}
            </el-descriptions-item>
            <el-descriptions-item label="问题">{{ row.description }}</el-descriptions-item>
            <el-descriptions-item label="结果">{{ row.result || '—' }}</el-descriptions-item>
        </el-descriptions>
        <div class="page-actions">
            <el-button @click="router.push(row.href)">查看原业务</el-button>
            <el-button v-if="row.canManage && row.status !== 'COMPLETED'" @click="emit('edit')">
                调整责任／期限
            </el-button>
        </div>
        <template
            v-if="
                (row.canProcess && row.status !== 'COMPLETED') ||
                (row.canManage && row.status === 'COMPLETED')
            "
        >
            <el-input
                v-model="note"
                type="textarea"
                :rows="3"
                maxlength="2000"
                show-word-limit
                placeholder="填写进展、结果或重开原因"
            />
            <div class="page-actions">
                <el-button
                    v-if="row.canProcess && row.status === 'OPEN'"
                    :loading="busy"
                    @click="action('START')"
                >
                    开始处理
                </el-button>
                <el-button
                    v-if="row.canProcess && row.status !== 'COMPLETED'"
                    :loading="busy"
                    @click="action('NOTE')"
                >
                    追加进展
                </el-button>
                <el-button
                    v-if="row.canProcess && row.status !== 'COMPLETED'"
                    type="primary"
                    :loading="busy"
                    @click="action('COMPLETE')"
                >
                    完成处理
                </el-button>
                <el-button
                    v-if="row.canManage && row.status === 'COMPLETED'"
                    :loading="busy"
                    @click="action('REOPEN')"
                >
                    重新打开
                </el-button>
            </div>
        </template>
        <h3>处理历史</h3>
        <el-timeline>
            <el-timeline-item
                v-for="e in row.events"
                :key="e.id"
                :timestamp="formatDateTime(e.createdAt)"
            >
                <strong>
                    {{ followupAction[e.action as keyof typeof followupAction] ?? e.action }} ·
                    {{ e.actorName }}
                </strong>
                <p>{{ e.note }}</p>
                <p v-if="e.beforeData?.dueDate !== e.afterData?.dueDate && e.beforeData">
                    计划日期：{{ e.beforeData.dueDate }} → {{ e.afterData?.dueDate }}
                </p>
            </el-timeline-item>
        </el-timeline>
    </div>
</template>
