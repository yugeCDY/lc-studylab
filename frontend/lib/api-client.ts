/**
 * API 客户端 - 封装对 Python 后端的 HTTP 调用
 */

import {
  ChatRequest,
  ChatResponse,
  RagIndexInfo,
  RagQueryResponse,
  RagSearchResult,
  RagUploadResponse,
} from './types';

// 后端 API 基础 URL
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

/**
 * 通用请求函数
 */
async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * 聊天 API - 非流式
 */
export async function chat(chatRequest: ChatRequest): Promise<ChatResponse> {
  return request<ChatResponse>('/chat', {
    method: 'POST',
    body: JSON.stringify(chatRequest),
  });
}

/**
 * 聊天 API - 流式（返回 ReadableStream）
 */
export async function chatStream(chatRequest: ChatRequest): Promise<Response> {
  const url = `${API_BASE_URL}/chat`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...chatRequest,
      stream: true,
    }),
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
  }
  
  return response;
}

/**
 * RAG 索引 API
 */
export async function buildRagIndex(params: {
  indexName: string;
  uploadedSubdir?: string;
  directoryPath?: string;
  description?: string;
  chunkSize?: number;
  chunkOverlap?: number;
  overwrite?: boolean;
}): Promise<RagIndexInfo> {
  return request<RagIndexInfo>('/rag/index', {
    method: 'POST',
    body: JSON.stringify({
      name: params.indexName,
      uploaded_subdir: params.uploadedSubdir,
      directory_path: params.directoryPath,
      description: params.description ?? '',
      chunk_size: params.chunkSize,
      chunk_overlap: params.chunkOverlap,
      overwrite: params.overwrite ?? false,
    }),
  });
}

/**
 * RAG 查询 API
 */
export async function queryRag(params: {
  indexName: string;
  query: string;
  topK?: number;
  returnSources?: boolean;
}): Promise<RagQueryResponse> {
  return request<RagQueryResponse>('/rag/query', {
    method: 'POST',
    body: JSON.stringify({
      index_name: params.indexName,
      query: params.query,
      k: params.topK ?? 4,
      return_sources: params.returnSources ?? true,
    }),
  });
}

export async function listRagIndexes(): Promise<RagIndexInfo[]> {
  return request<RagIndexInfo[]>('/rag/index/list', {
    method: 'GET',
  });
}

export async function deleteRagIndex(indexName: string): Promise<{ message: string }> {
  return request<{ message: string }>(`/rag/index/${encodeURIComponent(indexName)}`, {
    method: 'DELETE',
  });
}

export async function uploadRagDocuments(files: File[]): Promise<RagUploadResponse> {
  const formData = new FormData();
  files.forEach((file) => formData.append('files', file));

  const response = await fetch(`${API_BASE_URL}/rag/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

export async function updateRagIndex(params: {
  indexName: string;
  uploadedSubdir?: string;
  directoryPath?: string;
  chunkSize?: number;
  chunkOverlap?: number;
}): Promise<RagIndexInfo> {
  return request<RagIndexInfo>(`/rag/index/${encodeURIComponent(params.indexName)}/update`, {
    method: 'POST',
    body: JSON.stringify({
      uploaded_subdir: params.uploadedSubdir,
      directory_path: params.directoryPath,
      chunk_size: params.chunkSize,
      chunk_overlap: params.chunkOverlap,
    }),
  });
}

export async function searchRag(params: {
  indexName: string;
  query: string;
  topK?: number;
  scoreThreshold?: number;
}): Promise<RagSearchResult[]> {
  return request<RagSearchResult[]>('/rag/search', {
    method: 'POST',
    body: JSON.stringify({
      index_name: params.indexName,
      query: params.query,
      k: params.topK ?? 4,
      score_threshold: params.scoreThreshold,
    }),
  });
}

/**
 * Workflow API - 启动工作流
 */
export async function startWorkflow(params: {
  topic: string;
  threadId?: string;
}): Promise<{ threadId: string; status: string }> {
  return request('/workflow/start', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/**
 * Workflow API - 获取工作流状态
 */
export async function getWorkflowStatus(threadId: string): Promise<{
  status: string;
  currentNode: string;
  history: any[];
}> {
  return request(`/workflow/status/${threadId}`, {
    method: 'GET',
  });
}

/**
 * Deep Research API - 启动研究
 */
export async function startResearch(params: {
  topic: string;
  sessionId?: string;
}): Promise<{ sessionId: string; status: string }> {
  return request('/deep-research/start', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/**
 * Deep Research API - 获取研究状态
 */
export async function getResearchStatus(sessionId: string): Promise<{
  status: string;
  report?: string;
  progress: number;
}> {
  return request(`/deep-research/status/${sessionId}`, {
    method: 'GET',
  });
}

/**
 * 健康检查
 */
export async function healthCheck(): Promise<{ status: string; version: string }> {
  return request('/health', {
    method: 'GET',
  });
}

