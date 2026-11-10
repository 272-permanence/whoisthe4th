/**
 * @file 情感分析单元测试
 * @author 第八组
 * @date 2026-10-15
 * @description 测试 sentiment.ts 的分析逻辑，覆盖正面、负面、中性、否定反转等场景
 */

import { describe, it, expect } from 'vitest';
import { analyzeSentiment } from '../sentiment.js';

describe('analyzeSentiment - 情感分析', () => {
  describe('正面情感', () => {
    it('包含正面词汇应返回 positive 且 score > 0', () => {
      const result = analyzeSentiment('风景真美，太喜欢了');
      expect(result.label).toBe('positive');
      expect(result.score).toBeGreaterThan(0);
    });

    it('多个正面词汇得分仍为 1（100% 正面）', () => {
      const result = analyzeSentiment('好棒完美喜欢');
      expect(result.label).toBe('positive');
      expect(result.score).toBe(1);
    });
  });

  describe('负面情感', () => {
    it('包含负面词汇应返回 negative 且 score < 0', () => {
      const result = analyzeSentiment('这里太差了，很失望');
      expect(result.label).toBe('negative');
      expect(result.score).toBeLessThan(0);
    });
  });

  describe('中性情感', () => {
    it('无情感词汇应返回 neutral 且 score = 0', () => {
      const result = analyzeSentiment('请问几点开门');
      expect(result.label).toBe('neutral');
      expect(result.score).toBe(0);
    });

    it('空字符串应返回 neutral', () => {
      const result = analyzeSentiment('');
      expect(result.label).toBe('neutral');
      expect(result.score).toBe(0);
    });
  });

  describe('否定词反转', () => {
    it('否定词 + 正面词应反转为负面', () => {
      const result = analyzeSentiment('不好看');
      expect(result.label).toBe('negative');
      expect(result.score).toBeLessThan(0);
    });

    it('否定词 + 负面词应反转为正面', () => {
      const result = analyzeSentiment('不差');
      expect(result.label).toBe('positive');
      expect(result.score).toBeGreaterThan(0);
    });

    it('否定词应只影响紧邻的下一个词', () => {
      // "不是很好" → "不" + "是" 不算反转，"好" 仍为正面
      const result = analyzeSentiment('不是很好');
      // 否定词"不"紧邻"是"（不是情感词），不反转"好"，所以应该是正面
      expect(result.score).toBeGreaterThan(0);
    });
  });

  describe('混合情感', () => {
    it('正面和负面词汇数量相等时应返回 neutral', () => {
      const result = analyzeSentiment('好差'); // 好 +1，差 -1
      expect(result.label).toBe('neutral');
      expect(result.score).toBe(0);
    });

    it('正面多于负面时应返回 positive', () => {
      const result = analyzeSentiment('好棒差'); // 好+1, 棒+1, 差-1 = +1
      expect(result.label).toBe('positive');
    });
  });

  describe('边界情况', () => {
    it('纯数字和符号应返回 neutral', () => {
      const result = analyzeSentiment('12345');
      expect(result.label).toBe('neutral');
    });

    it('特殊字符不影响分析', () => {
      const result = analyzeSentiment('好！@#￥%');
      expect(result.label).toBe('positive');
    });
  });
});
