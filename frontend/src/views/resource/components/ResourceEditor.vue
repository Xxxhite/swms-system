<script setup lang="ts">
import RegionSelect from '@/components/RegionSelect.vue'
import { computed, ref } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import type { ResourceInput, ResourceCandidates } from '@/api/resource-types'
import { validateForm } from '@/utils/businessValidation'
const model = defineModel<ResourceInput>({ required: true })
const props = defineProps<{
    candidates: ResourceCandidates
    disabled?: boolean
    resourceId?: number
}>()
const form = ref<FormInstance>()
const duplicates = computed(() =>
    props.candidates.resources.filter(
        (r) => r.id !== props.resourceId && r.name.trim() === model.value.name.trim(),
    ),
)
const users = computed(() =>
    props.candidates.users.filter((u) => u.orgId === model.value.ownerOrgId),
)
const rules: FormRules = Object.fromEntries(
    ['name', 'unitType', 'region', 'ownerOrgId', 'maintainerId'].map((key) => [
        key,
        [
            { required: true, message: '请填写或选择此项', trigger: 'change' },
            ...(key.endsWith('Id')
                ? [
                      {
                          type: 'number' as const,
                          min: 1,
                          message: '请选择有效选项',
                          trigger: 'change',
                      },
                  ]
                : []),
        ],
    ]),
)
defineExpose({ validate: () => validateForm(form.value) })
</script>
<template>
    <el-form
        ref="form"
        :model="model"
        :rules="rules"
        :disabled="disabled"
        label-width="110px"
        class="business-form"
        scroll-to-error
    >
        <el-form-item label="单位名称" prop="name">
            <el-input v-model="model.name" maxlength="150" />
        </el-form-item>
        <el-alert
            v-if="duplicates.length"
            :title="`已有同名资源：${duplicates.map((r) => r.region).join('、')}，请核对单位身份后保存`"
            type="warning"
            :closable="false"
        />
        <el-form-item label="信用代码">
            <el-input v-model="model.creditCode" maxlength="32" />
        </el-form-item>
        <el-form-item label="单位类型" prop="unitType">
            <el-input
                v-model="model.unitType"
                maxlength="50"
                placeholder="如社区、社会组织、企业"
            />
        </el-form-item>
        <el-form-item label="区域" prop="region">
            <RegionSelect
                v-model="model.regionCode"
                :legacy="model.region"
                :disabled="disabled"
                terminal
                @change="model.region = $event ?? ''"
            />
        </el-form-item>
        <el-form-item label="地址">
            <el-input v-model="model.address" maxlength="255" />
        </el-form-item>
        <el-form-item label="来源">
            <el-input v-model="model.source" maxlength="100" />
        </el-form-item>
        <el-form-item label="归属组织" prop="ownerOrgId">
            <el-select v-model="model.ownerOrgId" @change="model.maintainerId = 0">
                <el-option
                    v-for="o in candidates.organizations"
                    :key="o.id"
                    :value="o.id"
                    :label="o.name"
                />
            </el-select>
        </el-form-item>
        <el-form-item label="维护负责人" prop="maintainerId">
            <el-select v-model="model.maintainerId" filterable>
                <el-option v-for="u in users" :key="u.id" :value="u.id" :label="u.name" />
            </el-select>
        </el-form-item>
        <el-form-item label="可提供资源">
            <el-select
                v-model="model.capabilityCodes"
                multiple
                filterable
                allow-create
                default-first-option
            >
                <el-option
                    v-for="v in ['场地', '资金', '物资', '专业服务', '宣传渠道']"
                    :key="v"
                    :label="v"
                    :value="v"
                />
            </el-select>
        </el-form-item>
        <el-form-item label="服务领域">
            <el-select v-model="model.serviceFieldCodes" multiple filterable>
                <el-option
                    v-for="v in candidates.serviceFields ?? []"
                    :key="v.code"
                    :value="v.code"
                    :label="v.name"
                />
            </el-select>
        </el-form-item>
        <el-form-item label="单位简介">
            <el-input v-model="model.description" type="textarea" maxlength="5000" />
        </el-form-item>
        <el-form-item label="合作意向">
            <el-input v-model="model.intention" type="textarea" maxlength="1000" />
        </el-form-item>
    </el-form>
</template>
