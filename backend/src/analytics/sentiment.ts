/**
 * @file 情感分析模块（关键词匹配方案）
 * @author 第八组
 * @date 2026-10-15
 * @description 基于关键词词典对用户提问进行情感分析，返回情感得分与标签
 */

// 正面情感关键词
const POSITIVE_WORDS = [
  '好', '棒', '赞', '喜欢', '开心', '满意', '不错', '优秀', '精彩', '美丽',
  '漂亮', '好玩', '有趣', '值得', '推荐', '感谢', '谢谢', '帮助', '清楚', '详细',
  '专业', '热情', '耐心', '贴心', '完美', '舒服', '享受', '惊喜', '愉快', '方便'
];

// 负面情感关键词
const NEGATIVE_WORDS = [
  '差', '烂', '糟', '讨厌', '失望', '不满', '糟糕', '垃圾', '坑', '骗',
  '无聊', '难看', '难玩', '不值', '浪费', '后悔', '生气', '愤怒', '烦', '郁闷',
  '慢', '卡', '坏', '破', '旧', '脏', '乱', '吵', '挤', '贵'
];

// 否定词（会反转情感）
const NEGATION_WORDS = ['不', '没', '无', '非', '未', '别'];

export interface SentimentResult {
  score: number;   // 情感得分，范围 -1 ~ 1
  label: 'positive' | 'neutral' | 'negative';
}

/**
 * 对文本进行情感分析
 * @param text 待分析文本
 * @returns 情感得分与标签
 */
export function analyzeSentiment(text: string): SentimentResult {
  if (!text) {
    return { score: 0, label: 'neutral' };
  }

  let positiveCount = 0;
  let negativeCount = 0;

  // 逐字符扫描（中文无空格分词），同时检测否定词对情感的反转
  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    // 检测正面词
    for (const word of POSITIVE_WORDS) {
      if (text.startsWith(word, i)) {
        // 检查前一个字是否为否定词
        const prevChar = i > 0 ? text[i - 1] : '';
        if (NEGATION_WORDS.includes(prevChar)) {
          negativeCount++;
        } else {
          positiveCount++;
        }
        i += word.length - 1;
        break;
      }
    }

    // 检测负面词
    for (const word of NEGATIVE_WORDS) {
      if (text.startsWith(word, i)) {
        const prevChar = i > 0 ? text[i - 1] : '';
        if (NEGATION_WORDS.includes(prevChar)) {
          positiveCount++;
        } else {
          negativeCount++;
        }
        i += word.length - 1;
        break;
      }
    }
  }

  const total = positiveCount + negativeCount;
  if (total === 0) {
    return { score: 0, label: 'neutral' };
  }

  // 得分范围 -1 ~ 1
  const score = (positiveCount - negativeCount) / total;
  const label: SentimentResult['label'] =
    score > 0.2 ? 'positive' : score < -0.2 ? 'negative' : 'neutral';

  return { score, label };
}
