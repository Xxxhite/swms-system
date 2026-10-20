<script setup lang="ts">
import type { RegistrationInput } from '@/api/types'
const model = defineModel<Omit<RegistrationInput, 'username' | 'password'>>({ required: true })
</script>
<template>
    <el-form-item label="姓名" prop="name"
        ><el-input v-model="model.name" maxlength="50"
    /></el-form-item>
    <el-form-item label="联系电话" prop="phone"
        ><el-input v-model="model.phone" maxlength="32"
    /></el-form-item>
    <el-form-item label="到岗日期" prop="arrivalDate"
        ><el-date-picker v-model="model.arrivalDate" type="date" value-format="YYYY-MM-DD"
    /></el-form-item>
    <el-form-item label="专业" prop="major"
        ><el-input v-model="model.major" maxlength="100"
    /></el-form-item>
    <el-form-item label="申请岗位" prop="proposedPosition"
        ><el-input v-model="model.proposedPosition" maxlength="100"
    /></el-form-item>
    <el-form-item label="最高学历" prop="education"
        ><el-select v-model="model.education"
            ><el-option
                v-for="item in ['博士', '硕士', '本科', '大专', '高中及以下', '其他']"
                :key="item"
                :label="item"
                :value="item" /></el-select
    ></el-form-item>
    <el-form-item label="政治面貌" prop="politicalStatus"
        ><el-select v-model="model.politicalStatus"
            ><el-option
                v-for="item in ['中共党员', '中共预备党员', '共青团员', '群众', '其他']"
                :key="item"
                :label="item"
                :value="item" /></el-select
    ></el-form-item>
    <el-form-item label="社工号"
        ><el-input v-model="model.socialWorkerNo" maxlength="100" placeholder="可后补"
    /></el-form-item>
    <el-form-item label="拟加入团队"
        ><el-input
            v-model="model.proposedTeam"
            maxlength="100"
            placeholder="可后补，以管理员分配为准"
    /></el-form-item>
</template>
