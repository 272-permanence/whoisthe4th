<script setup lang="ts">
/**
 * @file 知识库管理台页面
 * @author 第八组 成员C
 * @date 2026-10-15
 * @description 提供文档上传（含 SSE 解析进度）、知识库文档列表管理，以及检索自检能力。
 */

import { onMounted, reactive, ref } from 'vue';
import {
  deleteDocument,
  fetchDocuments,
  searchKnowledge,
  subscribeProgress,
  uploadDocument,
  type KbDocument,
  type KbProgressEvent,
  type KbSearchHit
} from '../../api/kb';

/** 入库阶段中文名 */
const STAGE_LABELS: Record<string, string> = {
  uploading: '上传中',
  parsing: '解析文档',
  chunking: '切分知识块',
  embedding: '向量化',
  indexing: '写入向量库',
  done: '已完成',
  failed: '失败'
};

/** 文档状态中文名 */
const STATUS_LABELS: Record<string, string> = {
  processing: '处理中',
  ready: '可检索',
  failed: '失败'
};

const documents = ref<KbDocument[]>([]);
const selectedFile = ref<File | null>(null);
const isProcessing = ref(false);
const errorMessage = ref('');
const searchQuery = ref('');
const searchHits = ref<KbSearchHit[]>([]);
const progress = reactive<KbProgressEvent>({
  percent: 0,
  stage: '',
  message: '',
  chunkCount: 0,
  fileName: '',
  documentId: ''
});

/**
 * 格式化文件体积
 * @param bytes 字节数
 * @returns 可读的体积字符串
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * 格式化时间戳
 * @param timestamp 毫秒时间戳
 * @returns 本地时间字符串
 */
function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN');
}

/** 加载知识库文档列表 */
async function loadDocuments(): Promise<void> {
  try {
    documents.value = await fetchDocuments();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载文档列表失败';
  }
}

/**
 * 缓存用户选择的文件
 * @param event 文件输入框的 change 事件
 */
function handleFileChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  selectedFile.value = input.files?.[0] ?? null;
}

/** 上传文件并订阅解析进度 */
async function handleUpload(): Promise<void> {
  const file = selectedFile.value;
  if (!file || isProcessing.value) {
    return;
  }
  errorMessage.value = '';
  isProcessing.value = true;
  Object.assign(progress, {
    percent: 0,
    stage: 'uploading',
    message: '正在上传文件',
    chunkCount: 0,
    fileName: file.name,
    documentId: ''
  });

  try {
    const { taskId } = await uploadDocument(file);
    subscribeProgress(
      taskId,
      (event) => Object.assign(progress, event),
      async (event) => {
        Object.assign(progress, event);
        isProcessing.value = false;
        selectedFile.value = null;
        await loadDocuments();
      }
    );
  } catch (error) {
    isProcessing.value = false;
    errorMessage.value = error instanceof Error ? error.message : '上传失败';
  }
}

/**
 * 删除文档
 * @param doc 目标文档
 */
async function handleDelete(doc: KbDocument): Promise<void> {
  try {
    await deleteDocument(doc.documentId);
    await loadDocuments();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '删除失败';
  }
}

/** 执行知识库检索自检 */
async function handleSearch(): Promise<void> {
  const query = searchQuery.value.trim();
  if (!query) {
    return;
  }
  searchHits.value = await searchKnowledge(query, 3);
}

onMounted(loadDocuments);
</script>

<template>
  <main class="admin-page">
    <header class="admin-header">
      <h1>知识库管理台</h1>
      <p class="subtitle">上传新的景区资料，数字人可立即检索到新内容</p>
    </header>

    <section class="panel">
      <h2>文档上传</h2>
      <div class="inline-row">
        <input type="file" accept=".pdf,.docx,.txt,.md" @change="handleFileChange" />
        <button :disabled="!selectedFile || isProcessing" @click="handleUpload">
          {{ isProcessing ? '处理中…' : '上传并入库' }}
        </button>
      </div>

      <div v-if="progress.stage" class="progress-block">
        <div class="progress-meta">
          <span>{{ STAGE_LABELS[progress.stage] ?? progress.stage }}：{{ progress.message }}</span>
          <span>{{ progress.percent }}%</span>
        </div>
        <div class="progress-track">
          <div
            class="progress-bar"
            :class="{ failed: progress.stage === 'failed' }"
            :style="{ width: `${progress.percent}%` }"
          ></div>
        </div>
      </div>

      <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
    </section>

    <section class="panel">
      <h2>已入库文档（{{ documents.length }}）</h2>
      <table class="doc-table">
        <thead>
          <tr>
            <th>文件名</th>
            <th>大小</th>
            <th>知识块</th>
            <th>状态</th>
            <th>入库时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="doc in documents" :key="doc.documentId">
            <td>{{ doc.fileName }}</td>
            <td>{{ formatSize(doc.sizeBytes) }}</td>
            <td>{{ doc.chunkCount }}</td>
            <td>{{ STATUS_LABELS[doc.status] ?? doc.status }}</td>
            <td>{{ formatTime(doc.createdAt) }}</td>
            <td><button class="link-button" @click="handleDelete(doc)">删除</button></td>
          </tr>
          <tr v-if="documents.length === 0">
            <td colspan="6" class="empty-cell">暂无文档，请先上传</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="panel">
      <h2>检索自检</h2>
      <div class="inline-row">
        <input v-model="searchQuery" placeholder="输入问题，验证新文档是否已被检索到" @keyup.enter="handleSearch" />
        <button @click="handleSearch">检索</button>
      </div>
      <ul class="hit-list">
        <li v-for="hit in searchHits" :key="hit.id">
          <span class="hit-score">相似度 {{ hit.score.toFixed(3) }}</span>
          <p class="hit-text">{{ hit.text }}</p>
        </li>
      </ul>
    </section>
  </main>
</template>

<style scoped>
.admin-page {
  max-width: 960px;
  margin: 0 auto;
  padding: 32px 20px 48px;
  text-align: left;
  font-size: 14px;
}

.admin-header h1 {
  margin: 0;
  font-size: 24px;
}

.subtitle {
  margin: 8px 0 0;
  color: #6b7280;
  font-size: 14px;
}

.panel {
  margin-top: 24px;
  padding: 20px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
}

.panel h2 {
  margin: 0 0 16px;
  font-size: 16px;
}

.inline-row {
  display: flex;
  gap: 12px;
  align-items: center;
}

.inline-row input[type='text'],
.inline-row input:not([type]) {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
}

button {
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  background: #0fdc78;
  color: #004d26;
  font-size: 14px;
  cursor: pointer;
}

button:disabled {
  background: #e5e7eb;
  color: #9ca3af;
  cursor: not-allowed;
}

.progress-block {
  margin-top: 16px;
}

.progress-meta {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: #4b5563;
}

.progress-track {
  margin-top: 8px;
  height: 8px;
  border-radius: 999px;
  background: #f3f4f6;
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  border-radius: 999px;
  background: #0fdc78;
  transition: width 0.2s ease;
}

.progress-bar.failed {
  background: #e8463a;
}

.error-text {
  margin: 12px 0 0;
  color: #e8463a;
  font-size: 13px;
}

.doc-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.doc-table th,
.doc-table td {
  padding: 10px 8px;
  border-bottom: 1px solid #f0f1f3;
  text-align: left;
}

.doc-table th {
  color: #6b7280;
  font-weight: 500;
}

.empty-cell {
  padding: 24px 8px;
  color: #9ca3af;
  text-align: center;
}

.link-button {
  padding: 0;
  background: transparent;
  color: #e8463a;
}

.hit-list {
  margin: 16px 0 0;
  padding: 0;
  list-style: none;
}

.hit-list li {
  padding: 12px;
  border: 1px solid #f0f1f3;
  border-radius: 8px;
}

.hit-list li + li {
  margin-top: 8px;
}

.hit-score {
  font-size: 12px;
  color: #6b7280;
}

.hit-text {
  margin: 6px 0 0;
  font-size: 14px;
  line-height: 1.6;
  color: #374151;
}
</style>
