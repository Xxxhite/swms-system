<template>
    <section class="not-found" aria-labelledby="not-found-title">
        <p class="not-found__code">404</p>
        <h1 id="not-found-title">页面不存在或暂不可访问</h1>
        <p class="not-found__description">请检查页面地址，或返回工作台选择可用功能。</p>
        <router-link to="/dashboard" class="not-found__link">返回工作台</router-link>
    </section>
</template>

<style scoped>
.not-found {
    padding: 64px 24px;
    text-align: center;
    background: var(--el-bg-color);
    border: 1px solid var(--el-border-color-light);
    border-radius: 8px;
}
.not-found__code {
    margin: 0;
    color: var(--el-color-primary);
    font-size: 64px;
    font-weight: 700;
}
.not-found h1 {
    font-size: 22px;
    color: var(--el-text-color-primary);
}
.not-found__description {
    margin-bottom: 28px;
    color: var(--el-text-color-regular);
}
.not-found__link {
    display: inline-block;
    padding: 10px 20px;
    border-radius: 4px;
    background: var(--el-color-primary);
    color: var(--el-color-white);
    text-decoration: none;
}
.not-found__link:hover {
    background: var(--el-color-primary-dark-2);
}
.not-found__link:focus-visible {
    outline: 2px solid var(--swms-sidebar-bg);
    outline-offset: 3px;
}
</style>
