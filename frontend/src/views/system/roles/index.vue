<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/message-box/style/css'
import { useMock } from '@/api/config'
import { identityApi } from '@/api/modules/identity'
import type { Permission, Role } from '@/api/types'
const rows = ref<Role[]>([])
const permissions = ref<Permission[]>([])
const groups = computed(() =>
    [...new Set(permissions.value.map((item) => item.module))].map((module) => ({
        module,
        items: permissions.value.filter((item) => item.module === module),
    })),
)
const dialog = ref(false)
const permissionDialog = ref(false)
const selected = ref<Role | null>(null)
const busy = ref(false)
const form = reactive({ code: '', name: '', description: '', status: 'ACTIVE' as Role['status'] })
const codes = ref<string[]>([])
/** 并行加载角色与权限目录，供角色列表和权限分组表单使用。 */
async function load() {
    if (useMock) return
    try {
        ;[rows.value, permissions.value] = await Promise.all([
            identityApi.roles(),
            identityApi.permissions(),
        ])
    } catch {
        /* 请求层统一提示 */
    }
}
/** 打开角色资料弹窗，新增时使用空表单，编辑时复制所选角色字段。 */
function edit(row: Role | null) {
    selected.value = row
    Object.assign(
        form,
        row
            ? { code: row.code, name: row.name, description: row.description, status: row.status }
            : { code: '', name: '', description: '', status: 'ACTIVE' },
    )
    dialog.value = true
}
/** 复制角色权限到独立选中集合，取消编辑时不影响列表原数据。 */
function editPermissions(row: Role) {
    selected.value = row
    codes.value = [...row.permissionCodes]
    permissionDialog.value = true
}
/**
 * 保存角色资料或完整权限集合，成功后重新读取最新版本。
 * @param permissionMode 为 true 时保存权限集合，否则保存角色基本资料。
 */
async function save(permissionMode = false) {
    if (busy.value) return
    if (!permissionMode && (!/^[a-z][a-z0-9_-]{0,31}$/.test(form.code) || !form.name.trim())) {
        ElMessage.warning('请填写角色名称和有效英文编码')
        return
    }
    busy.value = true
    try {
        if (permissionMode && selected.value)
            await identityApi.rolePermissions(
                selected.value.id,
                selected.value.version,
                codes.value,
            )
        else
            await identityApi.saveRole(selected.value?.id ?? null, {
                ...form,
                ...(selected.value ? { version: selected.value.version } : {}),
            })
        dialog.value = false
        permissionDialog.value = false
        await load()
        ElMessage.success('角色已保存')
    } catch {
        /* 请求层统一提示 */
    } finally {
        busy.value = false
    }
}
/** 确认删除角色，并由后端校验内建角色及人员引用约束。 */
async function remove(row: Role) {
    try {
        await ElMessageBox.confirm(`删除角色“${row.name}”？已分配角色需先解除关联。`, '删除角色', {
            type: 'warning',
        })
        await identityApi.deleteRole(row.id, row.version)
        await load()
        ElMessage.success('角色已删除')
    } catch {
        /* 取消或请求错误 */
    }
}
onMounted(load)
</script>
<template>
    <el-card
        ><template #header>
            <div class="page-header">
                <span>角色与权限</span>
                <div v-if="!useMock" class="page-actions">
                    <el-button type="primary" @click="edit(null)">新增角色</el-button>
                    <el-button @click="load">刷新</el-button>
                </div>
            </div>
        </template>
        <el-alert
            v-if="useMock"
            title="当前为演示模式；角色维护需使用真实接口模式。"
            type="info"
            :closable="false"
        />
        <template v-else>
            <el-table :data="rows"
                ><!-- @vue-generic {Role} -->
                <el-table-column
                    prop="name"
                    label="角色名称"
                    min-width="140"
                /><!-- @vue-generic {Role} -->
                <el-table-column
                    prop="code"
                    label="编码"
                    min-width="120"
                /><!-- @vue-generic {Role} -->
                <el-table-column
                    prop="description"
                    label="说明"
                    min-width="160"
                /><!-- @vue-generic {Role} -->
                <el-table-column label="状态" width="100"
                    ><template #default="{ row }">{{
                        row.status === 'ACTIVE' ? '启用' : '停用'
                    }}</template></el-table-column
                ><!-- @vue-generic {Role} -->
                <el-table-column label="操作" fixed="right" width="230"
                    ><template #default="{ row }"
                        ><el-button link type="primary" @click="edit(row)">编辑</el-button
                        ><el-button link type="primary" @click="editPermissions(row)"
                            >权限</el-button
                        ><el-button v-if="!row.builtIn" link type="danger" @click="remove(row)"
                            >删除</el-button
                        ></template
                    ></el-table-column
                ></el-table
            ></template
        >
        <el-dialog v-model="dialog" :title="selected ? '编辑角色' : '新增角色'" width="520px"
            ><el-form label-width="90px"
                ><el-form-item label="编码" required
                    ><el-input
                        v-model="form.code"
                        :disabled="Boolean(selected?.builtIn)"
                        maxlength="32" /></el-form-item
                ><el-form-item label="名称" required
                    ><el-input v-model="form.name" maxlength="100" /></el-form-item
                ><el-form-item label="说明"
                    ><el-input
                        v-model="form.description"
                        type="textarea"
                        maxlength="1000" /></el-form-item
                ><el-form-item label="状态"
                    ><el-select v-model="form.status" :disabled="selected?.code === 'admin'"
                        ><el-option label="启用" value="ACTIVE" /><el-option
                            label="停用"
                            value="DISABLED" /></el-select></el-form-item></el-form
            ><template #footer
                ><el-button @click="dialog = false">取消</el-button
                ><el-button type="primary" :loading="busy" @click="save(false)"
                    >保存</el-button
                ></template
            ></el-dialog
        >
        <el-dialog
            v-model="permissionDialog"
            :title="`${selected?.name ?? ''}：动作权限`"
            width="700px"
            ><el-alert
                v-if="selected?.code === 'admin'"
                title="内建管理员保留完整系统权限。"
                type="info"
                :closable="false"
            /><el-checkbox-group v-model="codes" :disabled="selected?.code === 'admin'"
                ><section v-for="group in groups" :key="group.module">
                    <h3>{{ group.module }}</h3>
                    <el-checkbox
                        v-for="permission in group.items"
                        :key="permission.code"
                        :value="permission.code"
                        >{{ permission.name }}</el-checkbox
                    >
                </section></el-checkbox-group
            ><template #footer
                ><el-button @click="permissionDialog = false">关闭</el-button
                ><el-button
                    v-if="selected?.code !== 'admin'"
                    type="primary"
                    :loading="busy"
                    @click="save(true)"
                    >保存权限</el-button
                ></template
            ></el-dialog
        >
    </el-card>
</template>
<style scoped>
h3 {
    font-size: 14px;
    margin-bottom: 8px;
}
</style>
