export type ModelType = 'text' | 'vision' | 'whisper';

export interface ModelInfo {
  id: string;
  name: string;
  description: string;
  size: string;
  sizeMB: number;
  type: ModelType;
  url: string;
  filename: string;
}

export type DownloadStatus = 'idle' | 'downloading' | 'done' | 'error';

export interface DownloadProgress {
  modelId: string;
  status: DownloadStatus;
  received: number;
  total: number;
  speed: number;
  error?: string;
}

// ===== Chat Types =====

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  isError?: boolean;
}

export type LlamaStatus = 'idle' | 'loading' | 'ready' | 'generating' | 'error';

// ===== Whisper STT Types =====

export interface WhisperModelInfo {
  id: string;
  name: string;
  description: string;
  size: string;
  sizeMB: number;
  language: string;
  url: string;
  filename: string;
}

export type WhisperStatus = 'idle' | 'loading' | 'ready' | 'transcribing' | 'error';

export interface WhisperSegment {
  t0: number;
  t1: number;
  text: string;
}

export interface WhisperTranscribeResult {
  result: string;
  segments: WhisperSegment[];
  isAborted: boolean;
  processTime: number;
}
