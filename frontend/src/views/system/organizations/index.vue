<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/message-box/style/css'
import { useMock } from '@/api/config'
import { identityApi } from '@/api/modules/identity'
import type { Organization } from '@/api/types'
import { organizationTree } from '../shared'
const rows = ref<Organization[]>([])
const tree = computed(() => organizationTree(rows.value))
const dialog = ref(false)
const busy = ref(false)
const selectedId = ref<number | null>(null)
const form = reactive({
    code: '',
    name: '',
    parentId: null as number | null,
    type: 'DEPARTMENT' as Organization['type'],
    status: 'ACTIVE' as Organization['status'],
    sortOrder: 0,
    version: 1,
})
const typeNames = { HEADQUARTERS: '总部', DEPARTMENT: '部门', TEAM: '团队' }
/** 读取可见组织列表，树形展示由计算属性统一转换。 */
async function load() {
    if (useMock) return
    try {
        rows.value = await identityApi.orgs()
    } catch {
        /* 请求层统一提示 */
    }
}
/** 打开组织新增或编辑弹窗，复制字段并保留修改所需的版本。 */
function edit(row?: Organization) {
    selectedId.value = row?.id ?? null
    Object.assign(
        form,
        row
            ? {
                  code: row.code,
                  name: row.name,
                  parentId: row.parentId,
                  type: row.type,
                  status: row.status,
                  sortOrder: row.sortOrder,
                  version: row.version,
              }
            : {
                  code: '',
                  name: '',
                  parentId: null,
                  type: 'DEPARTMENT',
                  status: 'ACTIVE',
                  sortOrder: 0,
                  version: 1,
              },
    )
    dialog.value = true
}
/** 校验组织编码及名称，提交新增或修改后刷新组织树。 */
async function save() {
    if (busy.value) return
    if (!form.name.trim() || !/^[a-zA-Z0-9_-]{1,32}$/.test(form.code)) {
        ElMessage.warning('请填写名称和有效编码（字母、数字、下划线或连字符）')
        return
    }
    busy.value = true
    try {
        const { version, ...fields } = form
        await identityApi.saveOrg(
            selectedId.value,
            selectedId.value ? { ...fields, version } : fields,
        )
        dialog.value = false
        await load()
        ElMessage.success('组织已保存')
    } catch {
        /* 请求层统一提示 */
    } finally {
        busy.value = false
    }
}
/** 确认删除组织，提交版本并由后端检查人员和下级引用。 */
async function remove(row: Organization) {
    try {
        await ElMessageBox.confirm(
            `删除组织“${row.name}”？有人员或下级引用时需先调整。`,
            '删除组织',
            { type: 'warning' },
        )
        await identityApi.deleteOrg(row.id, row.version)
        await load()
        ElMessage.success('组织已删除')
    } catch {
        /* 取消或请求错误 */
    }
}
onMounted(load)
</script>
<template>
    <el-card>
        <template #header>
            <div class="page-header">
                <span>组织管理</span>
                <div v-if="!useMock" class="page-actions">
                    <el-button type="primary" @click="edit()">新增组织</el-button>
                    <el-button @click="load">刷新</el-button>
                </div>
            </div>
        </template>
        <el-alert
            v-if="useMock"
            title="当前为演示模式；组织维护需使用真实接口模式。"
            type="info"
            :closable="false"
        />
        <template v-else>
            <el-table :data="tree" row-key="id" default-expand-all>
                <!-- @vue-generic {Organization} -->
                <el-table-column prop="name" label="组织名称" min-width="180" />
                <!-- @vue-generic {Organization} -->
                <el-table-column prop="code" label="编码" min-width="140" />
                <!-- @vue-generic {Organization} -->
                <el-table-column label="类型" width="100">
                    <template #default="{ row }">
                        {{ typeNames[row.type as Organization['type']] }}
                    </template>
                </el-table-column>
                <!-- @vue-generic {Organization} -->
                <el-table-column label="状态" width="100">
                    <template #default="{ row }">
                        {{ row.status === 'ACTIVE' ? '启用' : '停用' }}
                    </template>
                </el-table-column>
                <!-- @vue-generic {Organization} -->
                <el-table-column label="操作" fixed="right" width="160">
                    <template #default="{ row }">
                        <el-button link type="primary" @click="edit(row)">编辑</el-button>
                        <el-button link type="danger" @click="remove(row)">删除</el-button>
                    </template>
                </el-table-column>
            </el-table>
        </template>
        <el-dialog v-model="dialog" :title="selectedId ? '编辑组织' : '新增组织'" width="520px">
            <el-form label-width="90px" @submit.prevent="save">
                <el-form-item label="组织编码" required>
                    <el-input v-model="form.code" maxlength="32" />
                </el-form-item>
                <el-form-item label="组织名称" required>
                    <el-input v-model="form.name" maxlength="100" />
                </el-form-item>
                <el-form-item label="上级组织">
                    <el-select v-model="form.parentId" clearable @clear="form.parentId = null">
                        <el-option
                            v-for="org in rows.filter(
                                (item) => item.id !== selectedId && item.status === 'ACTIVE',
                            )"
                            :key="org.id"
                            :value="org.id"
                            :label="org.name"
                        />
                    </el-select>
                </el-form-item>
                <el-form-item label="组织类型">
                    <el-select v-model="form.type">
                        <el-option
                            v-for="(label, value) in typeNames"
                            :key="value"
                            :label="label"
                            :value="value"
                        />
                    </el-select>
                </el-form-item>
                <el-form-item label="状态">
                    <el-select v-model="form.status">
                        <el-option label="启用" value="ACTIVE" />
                        <el-option label="停用" value="DISABLED" />
                    </el-select>
                </el-form-item>
                <el-form-item label="排序">
                    <el-input-number v-model="form.sortOrder" :precision="0" />
                </el-form-item>
            </el-form>
            <template #footer>
                <el-button @click="dialog = false">取消</el-button>
                <el-button type="primary" :loading="busy" @click="save">保存</el-button>
            </template>
        </el-dialog>
    </el-card>
</template>
<style scoped></style>
