/**
 * WhisperService — wrapper para whisper.rn
 * SGD-based Speech-to-Text usando whisper.cpp via JSI
 * Suporta transcrição de arquivo e tempo real
 */

import { initWhisper, releaseAllWhisper, type WhisperContext } from 'whisper.rn';
import RNFS from 'react-native-fs';
import { WHISPER_MODELS } from '../data/whisperModels';
import type { WhisperModelInfo } from '../types';

let activeContext: WhisperContext | null = null;
let activeModelId: string | null = null;

export function getWhisperModelsDir(): string {
  return `${RNFS.DocumentDirectoryPath}/models`;
}

export function getWhisperModelPath(model: WhisperModelInfo): string {
  return `${getWhisperModelsDir()}/${model.filename}`;
}

export function getActiveWhisperModelId(): string | null {
  return activeModelId;
}

export function isWhisperLoaded(): boolean {
  return activeContext !== null;
}

export async function ensureWhisperModelsDir(): Promise<void> {
  const dir = getWhisperModelsDir();
  const exists = await RNFS.exists(dir);
  if (!exists) {
    await RNFS.mkdir(dir);
  }
}

export async function isWhisperModelDownloaded(modelId: string): Promise<boolean> {
  const model = WHISPER_MODELS.find((m) => m.id === modelId);
  if (!model) return false;
  const path = getWhisperModelPath(model);
  return RNFS.exists(path);
}

export async function loadWhisperModel(
  modelId: string,
): Promise<void> {
  if (activeContext) {
    if (activeModelId === modelId) return;
    await unloadWhisperModel();
  }

  const model = WHISPER_MODELS.find((m) => m.id === modelId);
  if (!model) throw new Error(`Whisper model not found: ${modelId}`);

  const path = getWhisperModelPath(model);
  const exists = await RNFS.exists(path);
  if (!exists) throw new Error(`Model file not found: ${model.filename}. Download it first.`);

  activeModelId = modelId;

  try {
    activeContext = await initWhisper({
      filePath: path,
      useGpu: false,        // Android não tem GPU support no whisper.rn
      useCoreMLIos: false,
      useFlashAttn: false,
    });
  } catch (err) {
    activeContext = null;
    activeModelId = null;
    throw err;
  }
}

export async function unloadWhisperModel(): Promise<void> {
  if (activeContext) {
    try {
      await activeContext.release();
    } catch {
      // ignore
    }
    activeContext = null;
    activeModelId = null;
  }
}

export async function releaseAllWhisperModels(): Promise<void> {
  await releaseAllWhisper();
  activeContext = null;
  activeModelId = null;
}

// ===== File-based transcription =====

export interface TranscribeOptions {
  language?: string;
  translate?: boolean;
  maxLen?: number;
  splitOnWord?: boolean;
  temperature?: number;
  // Callbacks
  onProgress?: (progress: number) => void;
  onNewSegments?: (result: TranscribeNewSegmentsResult) => void;
}

export interface TranscribeNewSegmentsResult {
  nNew: number;
  totalNNew: number;
  result: string;
  segments: TranscribeSegment[];
}

export interface TranscribeSegment {
  t0: number;
  t1: number;
  text: string;
}

export interface TranscribeResult {
  result: string;
  segments: TranscribeSegment[];
  isAborted: boolean;
  processTime: number;
}

export async function transcribeFile(
  filePath: string,
  options: TranscribeOptions = {},
): Promise<{ stop: () => Promise<void>; promise: Promise<TranscribeResult> }> {
  if (!activeContext) throw new Error('Whisper model not loaded. Call loadWhisperModel() first.');

  // strip file:// prefix if present
  const cleanPath = filePath.startsWith('file://') ? filePath.slice(7) : filePath;

  const { stop, promise } = activeContext.transcribe(cleanPath, {
    language: options.language || 'en',
    translate: options.translate || false,
    maxLen: options.maxLen || 0,
    splitOnWord: options.splitOnWord ?? true,
    temperature: options.temperature ?? 0,
    onProgress: options.onProgress,
    onNewSegments: options.onNewSegments as any,
  });

  return {
    stop,
    promise: promise as Promise<TranscribeResult>,
  };
}

export async function stopTranscription(): Promise<void> {
  // transcribeFile retorna stop() individualmente
  // Para parar, use o stop retornando por transcribeFile
  // Esta função é um placeholder para parar qualquer transcrição ativa
  // (pode ser expandido com tracking de jobId no futuro)
}

// ===== Permission helper =====

import { Platform, PermissionsAndroid } from 'react-native';

export async function requestRecordAudioPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: 'Microphone Permission',
        message: 'BMO needs access to your microphone for speech-to-text.',
        buttonNeutral: 'Ask Me Later',
        buttonNegative: 'Cancel',
        buttonPositive: 'OK',
      },
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

export async function hasRecordAudioPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    const result = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    );
    return result;
  } catch {
    return false;
  }
}
