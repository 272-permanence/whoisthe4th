/**
 * @file 公共层：常量聚合入口
 * @description 跨模块引用常量时从这里 import，避免散落的相对路径。
 *              具体常量仍在各 constants/*.ts 里定义，此处只 re-export。
 */
export * from '../constants/apiConstants';
export * from '../constants/interactionConstants';
