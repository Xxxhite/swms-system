<script setup lang="ts">
import { regionText } from '@/api/region-types'
import { ref, watch } from 'vue'
import ResponsiveTable from '@/components/ResponsiveTable.vue'
import { executionApi } from '@/api/modules/execution'
import { executionFlags } from '@/api/execution-types'
import { formatDateTime } from '@/utils/dateTime'
import { useUserStore } from '@/stores/user'
import { calculationLabels, type OutcomeSource, type OutcomeDecision } from '@/api/outcome-types'
const methodLabels: Record<string, string> = {
    SELF: '本人确认',
    FAMILY: '家属确认',
    ASSISTED: '辅助登记',
    SUPPLEMENT: '补录',
    REGISTRATION: '负责人登记',
}
const props = defineProps<{
    source: OutcomeSource
    editable?: boolean
    decisions?: OutcomeDecision[]
}>()
const emit = defineEmits<{ changed: [] }>(),
    store = useUserStore()
const rows = ref<Array<{ key: string; decision: '' | 'ACCEPT' | 'EXCLUDE'; reason: string }>>([])
watch(
    () => props.source,
    (source) => {
        rows.value = source.issues.map((i) => ({
            key: i.key,
            decision: props.decisions?.find((d) => d.key === i.key)?.decision ?? '',
            reason: props.decisions?.find((d) => d.key === i.key)?.reason ?? '',
        }))
    },
    { immediate: true },
)
defineExpose({
    decisions: () => rows.value.filter((r): r is OutcomeDecision => r.decision !== ''),
    complete: () => rows.value.every((r) => r.decision && r.reason.trim()),
})
async function download(id: number, name: string) {
    try {
        const result = await executionApi.download(id)
        const url = URL.createObjectURL(result)
        const a = document.createElement('a')
        a.href = url
        a.download = name
        a.click()
        URL.revokeObjectURL(url)
    } catch {
        /* 请求层提示 */
    }
}
</script>
<template>
    <section class="outcome-review">
        <h3>{{ source.title }}</h3>
        <p v-if="source.registration">来源：负责人执行登记</p>
        <p>
            实际执行：{{ formatDateTime(source.startedAt) }} 至 {{ formatDateTime(source.endedAt) }}
        </p>
        <p v-if="source.address || source.regionPathSnapshot?.length">
            服务地点：{{ regionText(source) }} {{ source.address }}
        </p>
        <p>服务总结：{{ source.summary || '尚未填写' }}</p>
        <ResponsiveTable v-if="source.rules.length" :data="source.rules">
            <el-table-column prop="indicatorName" label="成果指标" />
            <el-table-column prop="plannedValue" label="任务计划量" />
            <el-table-column prop="unit" label="单位" />
            <el-table-column v-if="source.registration" prop="registeredValue" label="登记成果" />
            <el-table-column label="计算口径">
                <template #default="{ row }">
                    {{ calculationLabels[row.mode as keyof typeof calculationLabels] }}
                </template>
            </el-table-column>
        </ResponsiveTable>
        <el-collapse>
            <el-collapse-item v-if="source.registration" title="各指标登记依据" name="registration">
                <section v-for="rule in source.rules" :key="rule.indicatorId">
                    <h4>{{ rule.indicatorName }}：{{ rule.registeredValue }} {{ rule.unit }}</h4>
                    <template
                        v-for="entry in source.registration.indicators.filter(
                            (r) => r.indicatorId === rule.indicatorId,
                        )"
                        :key="entry.indicatorId"
                    >
                        <p v-if="rule.mode === 'PEOPLE'">
                            服务对象：{{
                                entry.participantIds
                                    .map(
                                        (id) =>
                                            source.participants.find((p) => p.id === id)?.name ??
                                            '原服务对象',
                                    )
                                    .join('、') || '名单按权限显示；0人时无名单'
                            }}
                        </p>
                        <p v-for="(interval, index) in entry.intervals" :key="index">
                            {{ source.staff.find((s) => s.id === interval.userId)?.name }}：{{
                                formatDateTime(interval.startAt)
                            }}
                            至 {{ formatDateTime(interval.endAt) }}
                        </p>
                    </template>
                </section>
            </el-collapse-item>
            <el-collapse-item v-if="!source.registration" title="工作人员与实际到离" name="staff">
                <ResponsiveTable :data="source.staff">
                    <el-table-column prop="name" label="工作人员" />
                    <el-table-column label="到岗">
                        <template #default="{ row }">{{ formatDateTime(row.startAt) }}</template>
                    </el-table-column>
                    <el-table-column label="离岗">
                        <template #default="{ row }">{{ formatDateTime(row.endAt) }}</template>
                    </el-table-column>
                    <el-table-column prop="location" label="位置检查" />
                    <el-table-column label="标记">
                        <template #default="{ row }">
                            <el-tag v-for="flag in row.flags" :key="flag" type="warning">
                                {{ executionFlags[flag] ?? flag }}
                            </el-tag>
                        </template>
                    </el-table-column>
                </ResponsiveTable>
            </el-collapse-item>
            <el-collapse-item
                v-if="!source.registration"
                :title="`参与明细（${source.participants.length}项）`"
                name="participants"
            >
                <ResponsiveTable :data="source.participants">
                    <el-table-column prop="name" label="对象称呼" />
                    <el-table-column label="方式">
                        <template #default="{ row }">
                            {{ methodLabels[row.method] ?? row.method }}
                        </template>
                    </el-table-column>
                    <el-table-column label="发生时间">
                        <template #default="{ row }">{{ formatDateTime(row.occurredAt) }}</template>
                    </el-table-column>
                    <el-table-column label="状态">
                        <template #default="{ row }">
                            {{ row.status === 'RECORDED' ? '有效参与来源' : '已作废' }}
                        </template>
                    </el-table-column>
                </ResponsiveTable>
            </el-collapse-item>
            <el-collapse-item :title="`来源凭证（${source.evidence.length}份）`" name="evidence">
                <div v-for="file in source.evidence" :key="file.id" class="outcome-review__file">
                    <span>{{ file.name }}</span>
                    <el-button
                        v-if="store.hasPermission('service:evidence:view')"
                        link
                        type="primary"
                        @click="download(file.id, file.name)"
                    >
                        下载
                    </el-button>
                </div>
            </el-collapse-item>
        </el-collapse>
        <h4>来源核验（{{ source.issues.length }}项）</h4>
        <el-alert
            v-if="!source.issues.length"
            type="success"
            :closable="false"
            title="本次来源没有待核验异常"
        />
        <el-card
            v-for="(issue, index) in source.issues"
            :key="issue.key"
            shadow="never"
            class="outcome-review__issue"
        >
            <strong>{{ executionFlags[issue.label] ?? issue.label }}</strong>
            <p>{{ issue.reason }}</p>
            <p v-for="(note, i) in issue.notes" :key="i">
                {{ formatDateTime(note.createdAt) }} · {{ note.reason }}
            </p>
            <el-form label-position="top">
                <el-form-item v-if="editable" label="核验决定" required>
                    <el-select
                        v-model="rows[index]!.decision"
                        placeholder="请选择采纳或排除"
                        @change="emit('changed')"
                    >
                        <el-option label="采纳该来源" value="ACCEPT" />
                        <el-option label="排除该来源" value="EXCLUDE" />
                    </el-select>
                </el-form-item>
                <el-form-item v-if="editable" label="核验依据" required>
                    <el-input
                        v-model="rows[index]!.reason"
                        type="textarea"
                        maxlength="1000"
                        @input="emit('changed')"
                    />
                </el-form-item>
                <p v-if="!editable && rows[index]?.decision">
                    {{ rows[index]?.decision === 'ACCEPT' ? '已采纳' : '已排除' }}：{{
                        rows[index]?.reason
                    }}
                </p>
            </el-form>
        </el-card>
    </section>
</template>
<style scoped>
.outcome-review p {
    overflow-wrap: anywhere;
    line-height: 1.7;
}
.outcome-review__issue {
    margin: 12px 0;
}
.outcome-review__file {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 8px 0;
    overflow-wrap: anywhere;
}
.outcome-review__file span {
    min-width: 0;
    flex: 1;
}
</style>
