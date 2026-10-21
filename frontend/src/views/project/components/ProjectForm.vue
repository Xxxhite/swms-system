<script setup lang="ts">
import type { Candidates, ProjectInput } from '@/api/business-types'
import { projectCategories } from '@/api/business-types'
const model = defineModel<ProjectInput>({ required: true })
defineProps<{ candidates: Candidates; disabled?: boolean }>()
</script>
<template>
    <el-form label-width="140px" :disabled="disabled">
        <el-form-item label="项目编码" required
            ><el-input v-model="model.code" maxlength="32" placeholder="字母、数字、下划线或连字符"
        /></el-form-item>
        <el-form-item label="项目名称" required
            ><el-input v-model="model.name" maxlength="150"
        /></el-form-item>
        <el-form-item label="项目分类" required
            ><el-select v-model="model.category"
                ><el-option
                    v-for="(label, value) in projectCategories"
                    :key="value"
                    :label="label"
                    :value="value" /></el-select
        ></el-form-item>
        <el-form-item label="归属组织" required
            ><el-select v-model="model.ownerOrgId"
                ><el-option
                    v-for="o in candidates.organizations"
                    :key="o.id"
                    :label="o.name"
                    :value="o.id" /></el-select
        ></el-form-item>
        <el-form-item label="项目总监" required
            ><el-select v-model="model.directorId" filterable
                ><el-option
                    v-for="u in candidates.users"
                    :key="u.id"
                    :label="`${u.name}（${u.username}）`"
                    :value="u.id" /></el-select
        ></el-form-item>
        <el-form-item label="高级主任 / 督导" required
            ><el-select v-model="model.supervisorId" filterable
                ><el-option
                    v-for="u in candidates.users"
                    :key="u.id"
                    :label="`${u.name}（${u.username}）`"
                    :value="u.id" /></el-select
        ></el-form-item>
        <el-form-item label="主服务领域" required
            ><el-select v-model="model.serviceFieldCode"
                ><el-option
                    v-for="f in candidates.serviceFields"
                    :key="f.code"
                    :label="f.name"
                    :value="f.code" /></el-select
        ></el-form-item>
    </el-form>
</template>
