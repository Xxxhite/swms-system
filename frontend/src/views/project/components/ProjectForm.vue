<script setup lang="ts">
import { canSupervise } from '@/constants/personnel'
import { ref } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { fieldRule, textIssue, validateForm } from '@/utils/businessValidation'
import type { Candidates, ProjectInput } from '@/api/business-types'
import { projectCategories } from '@/api/business-types'
const model = defineModel<ProjectInput>({ required: true })
defineProps<{ candidates: Candidates; disabled?: boolean }>()
const formRef = ref<FormInstance>()
const rules: FormRules = {
    code: [
        fieldRule((value) =>
            typeof value === 'string' && /^[a-zA-Z0-9_-]{1,32}$/.test(value)
                ? undefined
                : '项目编码须为 1—32 位字母、数字、下划线或连字符',
        ),
    ],
    name: [fieldRule((value) => textIssue(value, '项目名称', 150))],
    category: [{ required: true, message: '请选择项目分类', trigger: 'change' }],
    ownerOrgId: [fieldRule((value) => (Number(value) > 0 ? undefined : '请选择归属组织'))],
    directorId: [fieldRule((value) => (Number(value) > 0 ? undefined : '请选择项目总监'))],
    seniorDirectorId: [fieldRule((value) => (Number(value) > 0 ? undefined : '请选择高级主任'))],
    serviceFieldCode: [{ required: true, message: '请选择主服务领域', trigger: 'change' }],
}
/** 新建和详情共用校验，保存前由父页面调用。 */
defineExpose({ validate: () => validateForm(formRef.value) })
</script>
<template>
    <el-form
        ref="formRef"
        class="business-form"
        :model="model"
        :rules="rules"
        label-width="140px"
        :disabled="disabled"
        scroll-to-error
    >
        <el-form-item label="项目编码" prop="code" required>
            <el-input
                v-model="model.code"
                maxlength="32"
                placeholder="字母、数字、下划线或连字符"
            />
        </el-form-item>
        <el-form-item label="项目名称" prop="name" required>
            <el-input v-model="model.name" maxlength="150" />
        </el-form-item>
        <el-form-item label="项目分类" prop="category" required>
            <el-select v-model="model.category">
                <el-option
                    v-for="(label, value) in projectCategories"
                    :key="value"
                    :label="label"
                    :value="value"
                />
            </el-select>
        </el-form-item>
        <el-form-item label="归属组织" prop="ownerOrgId" required>
            <el-select v-model="model.ownerOrgId">
                <el-option
                    v-for="o in candidates.organizations"
                    :key="o.id"
                    :label="o.name"
                    :value="o.id"
                />
            </el-select>
        </el-form-item>
        <el-form-item label="项目总监" prop="directorId" required>
            <el-select v-model="model.directorId" filterable>
                <el-option
                    v-for="u in candidates.users.filter((u) =>
                        canSupervise(u.positionCode ?? null),
                    )"
                    :key="u.id"
                    :label="`${u.name}（${u.username}）`"
                    :value="u.id"
                />
            </el-select>
        </el-form-item>
        <el-form-item label="高级主任" prop="seniorDirectorId" required>
            <el-select v-model="model.seniorDirectorId" filterable>
                <el-option
                    v-for="u in candidates.users.filter((u) =>
                        canSupervise(u.positionCode ?? null),
                    )"
                    :key="u.id"
                    :label="`${u.name}（${u.username}）`"
                    :value="u.id"
                />
            </el-select>
        </el-form-item>
        <el-form-item label="督导" prop="supervisorId">
            <el-select
                v-model="model.supervisorId"
                clearable
                filterable
                @clear="model.supervisorId = null"
            >
                <el-option
                    v-for="u in candidates.users.filter(
                        (u) => u.isSupervisor && canSupervise(u.positionCode ?? null),
                    )"
                    :key="u.id"
                    :label="`${u.name}（${u.username}）`"
                    :value="u.id"
                />
            </el-select>
        </el-form-item>
        <el-form-item label="细分领域">
            <el-select v-model="model.subFieldCodes" multiple clearable>
                <el-option
                    v-for="f in candidates.subFields ?? []"
                    :key="f.code"
                    :label="f.name"
                    :value="f.code"
                />
            </el-select>
        </el-form-item>
        <el-form-item label="机构品牌归属">
            <el-select v-model="model.brandCodes" multiple clearable>
                <el-option
                    v-for="f in candidates.brands ?? []"
                    :key="f.code"
                    :label="f.name"
                    :value="f.code"
                />
            </el-select>
        </el-form-item>
        <el-form-item label="主服务领域" prop="serviceFieldCode" required>
            <el-select v-model="model.serviceFieldCode">
                <el-option
                    v-for="f in candidates.serviceFields"
                    :key="f.code"
                    :label="f.name"
                    :value="f.code"
                />
            </el-select>
        </el-form-item>
    </el-form>
</template>
