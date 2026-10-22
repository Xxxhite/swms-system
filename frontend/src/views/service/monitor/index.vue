<script setup lang="ts">
import { projectApi } from '@/api/modules/project'
import { onMounted, reactive, ref } from 'vue'
import { useUserStore } from '@/stores/user'
import { useMock } from '@/api/config'
import { formatDateTime } from '@/utils/dateTime'
import { serviceApi } from '@/api/modules/service'
import { analysisApi } from '@/api/modules/analysis'
import type { Progress } from '@/api/business-types'
const props = defineProps<{ analysis?: boolean }>()
const store = useUserStore(),
    rows = ref<Progress[]>([]),
    total = ref(0),
    loading = ref(false),
    exporting = ref(false)
const filterTeams = ref<Array<{ id: number; name: string }>>([])
const filterProjects = ref<Array<{ id: number; name: string }>>([])
const query = reactive({
    teamId: undefined as number | undefined,
    projectId: undefined as number | undefined,
    page: 1,
    pageSize: 20,
    keyword: '',
    serviceFieldCode: '',
    serviceArea: '',
    warningLevel: '',
    asOfDate: formatDateTime(new Date()).slice(0, 10),
})
const warningLabels = { green: '已达标', yellow: '黄色预警', orange: '橙色预警', red: '红色预警' }
const warningTypes = {
    green: 'success',
    yellow: 'warning',
    orange: 'warning',
    red: 'danger',
} as const
let generation = 0
/** 监测与报表使用同一后端口径；日期按所在月份累计，预警按当天计算。 */
async function load(analysis = false) {
    if (useMock) return
    const request = ++generation
    loading.value = true
    try {
        const result = await (analysis ? analysisApi.warnings(query) : serviceApi.progress(query))
        if (request === generation) {
            rows.value = result.list
            total.value = result.total
        }
    } catch {
        /* 请求层提示 */
    } finally {
        if (request === generation) loading.value = false
    }
}
/** 新筛选回到第一页，重置保留业务今天并立即查询。 */
function search(analysis = false) {
    query.page = 1
    void load(analysis)
}
function reset(analysis = false) {
    Object.assign(query, {
        teamId: undefined,
        projectId: undefined,
        keyword: '',
        serviceFieldCode: '',
        serviceArea: '',
        warningLevel: '',
        asOfDate: formatDateTime(new Date()).slice(0, 10),
    })
    search(analysis)
}
/** 导出全部授权筛选结果，只有拿到合法 Excel 后才创建下载链接。 */
async function download() {
    if (exporting.value) return
    exporting.value = true
    try {
        const blob = await analysisApi.export(query),
            url = URL.createObjectURL(blob),
            link = document.createElement('a')
        link.href = url
        link.download = `月度指标预警_${query.asOfDate}.xlsx`
        link.click()
        URL.revokeObjectURL(url)
    } catch {
        /* 请求层提示 */
    } finally {
        exporting.value = false
    }
}
onMounted(async () => {
    await load(props.analysis)
    if (!useMock) {
        try {
            const options = await projectApi.filterOptions()
            filterTeams.value = options.organizations
            filterProjects.value = options.projects ?? []
        } catch {
            /* 请求层提示 */
        }
    }
})
</script>
<template>
    <el-card>
        <template #header>
            <div class="page-header">
                <span>{{ analysis ? '月度指标预警表' : '指标监测' }}</span>
                <el-button
                    v-if="!useMock && store.hasPermission('analysis:report:export')"
                    :loading="exporting"
                    @click="download"
                >
                    导出 Excel
                </el-button>
            </div>
        </template>
        <el-alert
            v-if="useMock"
            title="指标统计请使用真实接口模式。"
            type="info"
            :closable="false"
        />
        <template v-else>
            <el-alert
                title="按现有有效记录回算：草稿及撤销不计累计。合同与团队行分别展示，不混合求和；本人局部数据不计算团队完成率。"
                type="info"
                :closable="false"
                class="notice"
            />
            <el-form class="filter-form" @submit.prevent="search(analysis)">
                <el-form-item label="项目／指标">
                    <el-input v-model="query.keyword" clearable />
                </el-form-item>
                <el-form-item label="服务领域">
                    <el-input v-model="query.serviceFieldCode" clearable />
                </el-form-item>
                <el-form-item label="区域">
                    <el-input v-model="query.serviceArea" clearable />
                </el-form-item>
                <el-form-item label="业务日期">
                    <el-date-picker
                        v-model="query.asOfDate"
                        value-format="YYYY-MM-DD"
                        :clearable="false"
                    />
                </el-form-item>
                <el-form-item label="预警">
                    <el-select v-model="query.warningLevel" clearable>
                        <el-option
                            v-for="(label, value) in warningLabels"
                            :key="value"
                            :label="label"
                            :value="value"
                        />
                    </el-select>
                </el-form-item>
                <el-form-item label="项目">
                    <el-select v-model="query.projectId" clearable filterable>
                        <el-option
                            v-for="p in filterProjects"
                            :key="p.id"
                            :label="p.name"
                            :value="p.id"
                        />
                    </el-select>
                </el-form-item>
                <el-form-item label="团队">
                    <el-select v-model="query.teamId" clearable filterable>
                        <el-option
                            v-for="t in filterTeams"
                            :key="t.id"
                            :label="t.name"
                            :value="t.id"
                        />
                    </el-select>
                </el-form-item>
                <el-form-item class="filter-form__actions">
                    <el-button type="primary" native-type="submit">查询</el-button>
                    <el-button @click="reset(analysis)">重置</el-button>
                </el-form-item>
            </el-form>
            <el-table v-loading="loading" :data="rows">
                <!-- @vue-generic {Progress} -->
                <el-table-column
                    prop="projectName"
                    label="项目"
                    min-width="180"
                    show-overflow-tooltip
                />
                <!-- @vue-generic {Progress} -->
                <el-table-column
                    prop="indicatorName"
                    label="指标"
                    min-width="150"
                    show-overflow-tooltip
                />
                <!-- @vue-generic {Progress} -->
                <el-table-column
                    prop="definition"
                    label="统计口径"
                    min-width="160"
                    show-overflow-tooltip
                />
                <!-- @vue-generic {Progress} -->
                <el-table-column prop="teamName" label="统计范围" min-width="120" />
                <!-- @vue-generic {Progress} -->
                <el-table-column prop="unit" label="单位" width="70" />
                <!-- @vue-generic {Progress} -->
                <el-table-column prop="targetValue" label="目标" width="100" />
                <!-- @vue-generic {Progress} -->
                <el-table-column prop="monthlyValue" label="当月新增" width="110" />
                <!-- @vue-generic {Progress} -->
                <el-table-column prop="cumulative" label="累计完成" width="110" />
                <!-- @vue-generic {Progress} -->
                <el-table-column label="完成率" width="100">
                    <template #default="{ row }">
                        {{
                            row.completionRate == null
                                ? '本人局部'
                                : `${row.completionRate.toFixed(2)}%`
                        }}
                    </template>
                </el-table-column>
                <!-- @vue-generic {Progress} -->
                <el-table-column prop="endDate" label="到期日" width="120" />
                <!-- @vue-generic {Progress} -->
                <el-table-column label="预警" width="180" fixed="right">
                    <template #default="{ row }">
                        <el-tag
                            v-if="row.warningLevel"
                            :type="warningTypes[row.warningLevel]"
                            :class="{ 'warning-tag--yellow': row.warningLevel === 'yellow' }"
                        >
                            {{ warningLabels[row.warningLevel] }}
                        </el-tag>
                        <span v-else>本人局部数据</span>
                        <span v-if="row.overdue">已逾期</span>
                        <span v-if="row.notStarted">未开始</span>
                    </template>
                </el-table-column>
            </el-table>
            <el-pagination
                v-model:current-page="query.page"
                class="table-pagination"
                :total="total"
                :page-size="query.pageSize"
                layout="total, prev, pager, next"
                @current-change="load(analysis)"
            />
        </template>
    </el-card>
</template>
<style scoped>
.notice {
    margin-bottom: 20px;
}

/* 复用 ElTag 预设尺寸与外观，只覆盖黄色预警的三项颜色变量。 */
.warning-tag--yellow {
    --el-tag-text-color: var(--swms-warning-yellow-text);
    --el-tag-bg-color: var(--swms-warning-yellow-bg);
    --el-tag-border-color: var(--swms-warning-yellow-border);
}
</style>
