/**
 * @file 后端 ESLint 配置
 * @author 第八组
 * @date 2026-10-15
 * @description Node.js + TypeScript + ESM 代码规范检查
 */

module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended'
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module'
  },
  plugins: ['@typescript-eslint'],
  rules: {
    // 禁止使用 console（应使用统一日志模块）
    'no-console': ['error', { allow: ['debug', 'info', 'warn', 'error'] }],
    // 禁止使用 any 类型
    '@typescript-eslint/no-explicit-any': 'error',
    // 必须显式声明函数返回类型
    '@typescript-eslint/explicit-function-return-type': 'off',
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
    // 禁止出现多行空行
    'no-multiple-empty-lines': ['error', { max: 1 }],
    // 对象/数组末尾必须有逗号（多行时）
    'comma-dangle': ['error', 'always-multiline'],
    // 禁止魔法数字（允许 -1, 0, 1, 2 和明显的配置常量）
    'no-magic-numbers': ['off']
  },
  ignorePatterns: ['node_modules/', 'dist/', 'data/']
};
