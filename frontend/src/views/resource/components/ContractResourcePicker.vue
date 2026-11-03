<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useUserStore } from '@/stores/user'
import { resourceApi } from '@/api/modules/resource'
import type { ContractInput } from '@/api/business-types'
import {
    emptyResource,
    type ResourceInput,
    type ResourceCandidates,
    type ResourceContact,
} from '@/api/resource-types'
import ResourceEditor from './ResourceEditor.vue'
const model = defineModel<ContractInput>({ required: true })
const store = useUserStore(),
    candidates = ref<ResourceCandidates>({ resources: [], organizations: [], users: [] })
const contacts = ref<ResourceContact[]>([]),
    dialog = ref(false),
    quick = ref<ResourceInput>(emptyResource()),
    editor = ref<InstanceType<typeof ResourceEditor>>()
async function load() {
    if (store.hasPermission('resource:view')) {
        try {
            candidates.value = await resourceApi.candidates()
        } catch {
            /* 请求层提示 */
        }
    }
}
async function selectResource() {
    model.value.quickResource = undefined
    model.value.contactId = null
    const selected = candidates.value.resources.find((r) => r.id === model.value.resourceId)
    if (selected) model.value.partnerName = selected.name
    contacts.value = []
    if (selected && store.hasPermission('resource:contact:view')) {
        try {
            contacts.value = (await resourceApi.detail(selected.id)).contacts.filter(
                (c) => c.status === 'ACTIVE',
            )
        } catch {
            /* 请求层提示 */
        }
    }
}
function openQuick() {
    quick.value = {
        ...emptyResource(),
        ownerOrgId: store.profile?.orgId ?? 0,
        maintainerId: store.profile?.id ?? 0,
        requestKey: crypto.randomUUID(),
    }
    dialog.value = true
}
async function applyQuick() {
    if (!(await editor.value?.validate())) return
    model.value.quickResource = { ...quick.value }
    model.value.resourceId = undefined
    model.value.contactId = null
    model.value.partnerName = quick.value.name
    contacts.value = []
    dialog.value = false
}
onMounted(load)
</script>
<template>
    <div class="contract-resource-picker">
        <el-select
            v-if="store.hasPermission('resource:view')"
            v-model="model.resourceId"
            filterable
            placeholder="选择单位资源"
            @visible-change="(visible: boolean) => visible && load()"
            @change="selectResource"
        >
            <el-option
                v-for="r in candidates.resources"
                :key="r.id"
                :value="r.id"
                :label="`${r.name}（${r.region}）`"
            />
        </el-select>
        <el-button v-if="store.hasPermission('resource:record:create')" @click="openQuick">
            快捷建档
        </el-button>
        <p v-if="model.quickResource">
            待新建单位：{{ model.quickResource.name }}，随合同一起保存。
        </p>
        <p v-else-if="!model.resourceId">历史合同可保留原签约名称，核对后再关联单位。</p>
        <el-select
            v-if="contacts.length"
            v-model="model.contactId"
            clearable
            placeholder="签约联系人"
        >
            <el-option
                v-for="c in contacts"
                :key="c.id"
                :value="c.id"
                :label="`${c.name}（${c.position}）`"
            />
        </el-select>
        <el-input
            v-model="model.snapshotReason"
            placeholder="变更已关联合同方或签约快照时填写原因"
            maxlength="1000"
        />
        <el-dialog
            v-model="dialog"
            title="快捷建立单位资源"
            width="680px"
            append-to-body
            :close-on-click-modal="false"
        >
            <ResourceEditor ref="editor" v-model="quick" :candidates="candidates" />
            <template #footer>
                <el-button @click="dialog = false">取消</el-button>
                <el-button type="primary" @click="applyQuick">带入合同</el-button>
            </template>
        </el-dialog>
    </div>
</template>
<style scoped>
.contract-resource-picker {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    width: 100%;
}
p {
    margin: 0;
    color: var(--el-text-color-secondary);
}
</style>
