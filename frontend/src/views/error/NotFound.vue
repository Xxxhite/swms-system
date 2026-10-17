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
    background: #fff;
    border: 1px solid #e4e7ed;
    border-radius: 8px;
}
.not-found__code {
    margin: 0;
    color: #409eff;
    font-size: 64px;
    font-weight: 700;
}
.not-found h1 {
    font-size: 22px;
    color: #303133;
}
.not-found__description {
    margin-bottom: 28px;
    color: #606266;
}
.not-found__link {
    display: inline-block;
    padding: 10px 20px;
    border-radius: 4px;
    background: #409eff;
    color: #fff;
    text-decoration: none;
}
.not-found__link:hover {
    background: #337ecc;
}
.not-found__link:focus-visible {
    outline: 2px solid #22303f;
    outline-offset: 3px;
}
</style>
