<script setup lang="ts">
import { ref, reactive, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useViewport } from '@/composables/useViewport'
import { projectApi } from '@/api/modules/project'
import { useMock } from '@/api/config'
import { useUserStore } from '@/stores/user'
import { managementApi } from '@/api/modules/management'
import { followupStatus, type Followup, type ManagementCandidates } from '@/api/management-types'
import FilterPanel from '@/components/FilterPanel.vue'
import ResponsiveTable from '@/components/ResponsiveTable.vue'
import ResponsivePagination from '@/components/ResponsivePagination.vue'
import FollowupEditor from './components/FollowupEditor.vue'
import FollowupDetail from './components/FollowupDetail.vue'
const store = useUserStore(),
    route = useRoute(),
    rows = ref<Followup[]>([]),
    total = ref(0),
    loading = ref(false),
    failed = ref(false),
    editing = ref(false),
    dialog = ref(false),
    selected = ref<Followup>(),
    editRow = ref<Followup>(),
    candidates = ref<ManagementCandidates>({ projects: [], teams: [], sources: [] })
const { isMobile } = useViewport()
const projects = ref<{ id: number; name: string }[]>([]),
    teams = ref<{ id: number; name: string }[]>([])
const query = reactive({
    projectId: undefined as number | undefined,
    teamId: undefined as number | undefined,
    page: 1,
    pageSize: 20,
    keyword: '',
    status: '',
    ownerId: undefined as number | undefined,
    dateFrom: '',
    dateTo: '',
})
let generation = 0
async function load() {
    const current = ++generation
    loading.value = true
    failed.value = false
    try {
        const result = await managementApi.list({
            ...query,
            status: query.status || undefined,
            dateFrom: query.dateFrom || undefined,
            dateTo: query.dateTo || undefined,
        })
        if (current === generation) {
            rows.value = result.list
            total.value = result.total
        }
    } catch {
        if (current === generation) {
            failed.value = true
            rows.value = []
            total.value = 0
        }
    } finally {
        if (current === generation) loading.value = false
    }
}
function mine() {
    query.ownerId = store.profile?.id
    search()
}
function search() {
    query.page = 1
    void load()
}
function reset() {
    Object.assign(query, {
        page: 1,
        projectId: undefined,
        teamId: undefined,
        keyword: '',
        status: '',
        ownerId: undefined,
        dateFrom: '',
        dateTo: '',
    })
    void load()
}
async function open(id: number) {
    try {
        selected.value = await managementApi.detail(id)
        dialog.value = true
    } catch {
        /* 请求层提示 */
    }
}
async function editor(row?: Followup) {
    try {
        candidates.value = await managementApi.candidates()
        editRow.value = row
        editing.value = true
    } catch {
        /* 请求层提示 */
    }
}
async function saved(id: number) {
    editing.value = false
    await open(id)
    await load()
}
async function changed() {
    if (selected.value) await open(selected.value.id)
    await load()
}
async function locate() {
    const id = Number(route.query.followupId)
    if (Number.isSafeInteger(id) && id > 0) await open(id)
}
watch(() => route.query.followupId, locate)
onMounted(async () => {
    if (!useMock)
        try {
            const options = await projectApi.filterOptions()
            projects.value = options.projects ?? []
            teams.value = options.organizations
        } catch {
            /* 请求层提示 */
        }
    await load()
    await locate()
})
</script>
<template>
    <el-card>
        <template #header>
            <div class="page-header">
                <h2>管理跟进</h2>
                <el-button
                    v-if="store.hasPermission('management:followup:manage')"
                    type="primary"
                    @click="editor()"
                >
                    建立管理问题
                </el-button>
            </div>
        </template>
        <p>记录需要持续协调的问题；日常任务、审批及资源跟进仍在原业务处理。</p>
        <FilterPanel @submit.prevent="search">
            <el-form-item label="项目">
                <el-select v-model="query.projectId" clearable filterable>
                    <el-option v-for="p in projects" :key="p.id" :label="p.name" :value="p.id" />
                </el-select>
            </el-form-item>
            <el-form-item label="团队">
                <el-select v-model="query.teamId" clearable>
                    <el-option v-for="t in teams" :key="t.id" :label="t.name" :value="t.id" />
                </el-select>
            </el-form-item>
            <el-form-item label="关键词">
                <el-input v-model="query.keyword" clearable />
            </el-form-item>
            <el-form-item label="状态">
                <el-select v-model="query.status" clearable>
                    <el-option
                        v-for="(label, key) in followupStatus"
                        :key="key"
                        :label="label"
                        :value="key"
                    />
                </el-select>
            </el-form-item>
            <el-form-item label="计划日期起">
                <el-date-picker v-model="query.dateFrom" value-format="YYYY-MM-DD" />
            </el-form-item>
            <el-form-item label="日期止">
                <el-date-picker v-model="query.dateTo" value-format="YYYY-MM-DD" />
            </el-form-item>
            <el-form-item class="filter-actions">
                <el-button type="primary" native-type="submit">查询</el-button>
                <el-button @click="reset">重置</el-button>
                <el-button @click="mine">我负责的</el-button>
            </el-form-item>
        </FilterPanel>
        <el-alert v-if="failed" title="读取失败，请重试" type="error" :closable="false" />
        <el-button v-if="failed" @click="load">重试</el-button>
        <ResponsiveTable v-loading="loading" :data="rows">
            <el-table-column prop="title" label="问题" min-width="180" />
            <el-table-column prop="projectName" label="项目" min-width="160" />
            <el-table-column prop="ownerName" label="负责人" />
            <el-table-column prop="dueDate" label="计划日期" />
            <el-table-column label="状态">
                <template #default="{ row }">
                    {{ followupStatus[row.status as keyof typeof followupStatus]
                    }}{{ row.overdue ? ' · 已逾期' : '' }}
                </template>
            </el-table-column>
            <el-table-column label="操作">
                <template #default="{ row }">
                    <el-button link type="primary" @click="open(row.id)">查看处理</el-button>
                </template>
            </el-table-column>
        </ResponsiveTable>
        <ResponsivePagination
            v-model:current-page="query.page"
            v-model:page-size="query.pageSize"
            :page-sizes="[10, 20, 50, 100]"
            :total="total"
            @current-change="load"
            @size-change="search"
        />
        <el-drawer
            v-model="editing"
            :title="editRow ? '调整管理问题' : '建立管理问题'"
            :size="isMobile ? '100%' : '600px'"
            destroy-on-close
        >
            <FollowupEditor
                :row="editRow"
                :candidates="candidates"
                @saved="saved"
                @cancel="editing = false"
            />
        </el-drawer>
        <el-drawer
            v-model="dialog"
            title="管理问题"
            :size="isMobile ? '100%' : '700px'"
            destroy-on-close
        >
            <FollowupDetail
                v-if="selected"
                :row="selected"
                @changed="changed"
                @edit="editor(selected)"
            />
        </el-drawer>
    </el-card>
</template>
