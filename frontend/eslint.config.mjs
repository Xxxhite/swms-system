import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import vue from 'eslint-plugin-vue'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default [
    {
        ignores: [
            'node_modules/**',
            'dist/**',
            'coverage/**',
            'src/types/auto-imports.d.ts',
            'src/types/components.d.ts',
        ],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended.map((config) => ({
        ...config,
        files: ['**/*.ts', '**/*.vue'],
    })),
    ...vue.configs['flat/essential'],
    {
        files: ['**/*.ts', '**/*.vue'],
        languageOptions: {
            globals: globals.browser,
            parserOptions: { parser: tseslint.parser },
        },
        rules: {
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            'vue/multi-word-component-names': ['error', { ignores: ['index'] }],
        },
    },
    { files: ['vite.config.ts', '**/*.mjs'], languageOptions: { globals: globals.node } },
    prettier,
]
