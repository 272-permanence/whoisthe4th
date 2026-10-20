/**
 * @file 知识库文档解析与分块
 * @author 第八组 成员C
 * @date 2026-10-15
 * @description 负责将上传的 PDF / Word / 文本文件解析为纯文本，并按 LangChain
 *              RecursiveCharacterTextSplitter 规则切分为检索用的知识块。
 */

import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { KB_CHUNK_OVERLAP, KB_CHUNK_SIZE } from '../constants/kbConstants.js';

const require = createRequire(import.meta.url);

/** pdf-parse 的返回结构 */
interface PdfParseResult {
  text: string;
  numpages: number;
}

/** mammoth 的返回结构 */
interface MammothResult {
  value: string;
  messages: unknown[];
}

const pdfParse = require('pdf-parse') as (buffer: Buffer) => Promise<PdfParseResult>;
const mammoth = require('mammoth') as {
  extractRawText: (input: { buffer: Buffer }) => Promise<MammothResult>;
};

/** 文档解析结果 */
export interface ParsedDocument {
  /** 解析后的纯文本 */
  text: string;
  /** 页数，纯文本文件固定为 1 */
  pageCount: number;
}

/** 纯文本类扩展名 */
const PLAIN_TEXT_EXTENSIONS = ['txt', 'md'];

/**
 * 将上传文件解析为纯文本
 * @param filePath 文件在磁盘上的绝对路径
 * @param extension 文件扩展名（小写，不含点），如 pdf / docx / txt
 * @returns 解析结果，包含纯文本与页数
 * @throws {Error} 当文件类型不受支持或文件内容无法解析时抛出
 */
export async function parseDocument(filePath: string, extension: string): Promise<ParsedDocument> {
  if (extension === 'pdf') {
    const buffer = await readFile(filePath);
    const result = await pdfParse(buffer);
    return { text: result.text, pageCount: result.numpages };
  }

  if (extension === 'docx') {
    const buffer = await readFile(filePath);
    const result = await mammoth.extractRawText({ buffer });
    return { text: result.value, pageCount: 1 };
  }

  if (PLAIN_TEXT_EXTENSIONS.includes(extension)) {
    const text = await readFile(filePath, 'utf-8');
    return { text, pageCount: 1 };
  }

  throw new Error(`暂不支持的文件类型：.${extension}，目前仅支持 pdf / docx / txt / md`);
}

/**
 * 将长文本切分为知识块
 * @param text 文档纯文本
 * @returns 知识块数组，空白块已被过滤
 */
export async function splitText(text: string): Promise<string[]> {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: KB_CHUNK_SIZE,
    chunkOverlap: KB_CHUNK_OVERLAP
  });
  const chunks = await splitter.splitText(text);
  return chunks.map((chunk) => chunk.trim()).filter((chunk) => chunk.length > 0);
}
