export type ModelType = 'text' | 'vision';

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
  speed: number; // bytes/sec
  error?: string;
}
