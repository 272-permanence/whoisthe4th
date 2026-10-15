/**
 * @file 前端 ESLint 配置
 * @author 第八组
 * @date 2026-10-15
 * @description Vue 3 + TypeScript 代码规范检查
 */

module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true
  },
  extends: [
    'eslint:recommended',
    'plugin:vue/vue3-recommended',
    'plugin:@typescript-eslint/recommended'
  ],
  parser: 'vue-eslint-parser',
  parserOptions: {
    parser: '@typescript-eslint/parser',
    ecmaVersion: 2022,
    sourceType: 'module'
  },
  plugins: ['@typescript-eslint'],
  rules: {
    // 禁止使用 any 类型
    '@typescript-eslint/no-explicit-any': 'error',
    // 禁止未使用的变量
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    // 必须使用 === 和 !==
    eqeqeq: ['error', 'always'],
    // 字符串使用单引号
    quotes: ['error', 'single', { avoidEscape: true }],
    // 语句必须以分号结尾
    semi: ['error', 'always'],
    // 缩进 2 空格
    indent: ['error', 2, { SwitchCase: 1 }],
    // Vue 组件命名
    'vue/component-name-in-template-casing': ['error', 'PascalCase'],
    // Vue 单文件组件结构顺序
    'vue/component-tags-order': ['error', { order: ['script', 'template', 'style'] }],
    // Vue 禁止使用 v-html（XSS 风险）
    'vue/no-v-html': 'error'
  },
  ignorePatterns: ['node_modules/', 'dist/']
};
