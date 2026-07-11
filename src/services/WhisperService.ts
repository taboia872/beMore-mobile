/**
 * WhisperService — wrapper para whisper.rn
 * SGD-based Speech-to-Text usando whisper.cpp via JSI
 * Suporta transcrição de arquivo e tempo real
 */

import { initWhisper, releaseAllWhisper, type WhisperContext } from 'whisper.rn';
import RNFS from "react-native-fs";
import { Platform, PermissionsAndroid } from "react-native";
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

/**
 * Verifica se um modelo Whisper específico foi baixado.
 */
export async function isWhisperModelDownloaded(modelId: string): Promise<boolean> {
  const model = WHISPER_MODELS.find((m) => m.id === modelId);
  if (!model) return false;
  const path = getWhisperModelPath(model);
  try {
    return await RNFS.exists(path);
  } catch {
    return false;
  }
}

/**
 * Escaneia a pasta models/ e retorna o ID do primeiro modelo Whisper baixado.
 * Prioriza: small > base > tiny (melhor qualidade primeiro).
 */
export async function findAnyDownloadedWhisperModel(): Promise<string | null> {
  const priority = ['whisper-small-q5', 'whisper-base-q5', 'whisper-tiny-q5'];
  for (const id of priority) {
    const downloaded = await isWhisperModelDownloaded(id);
    if (downloaded) return id;
  }
  // Fallback: escanear pasta por qualquer ggml-*.bin
  try {
    const dir = getWhisperModelsDir();
    const exists = await RNFS.exists(dir);
    if (!exists) return null;
    const files = await RNFS.readDir(dir);
    const whisperFile = files.find((f) => f.name.startsWith('ggml-') && f.name.endsWith('.bin'));
    if (whisperFile) {
      const model = WHISPER_MODELS.find((m) => m.filename === whisperFile.name);
      if (model) return model.id;
    }
  } catch {
    // ignore
  }
  return null;
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
      useGpu: false,
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
  onNewSegments?: (result: any) => void;
}

export async function transcribeFile(
  audioPath: string,
  options: TranscribeOptions = {},
): Promise<{ stop: () => void; promise: Promise<{ result: string; segments: any[]; isAborted: boolean; processTime: number }> }> {
  if (!activeContext) throw new Error('No whisper model loaded');

  return activeContext.transcribe(audioPath, {
    language: options.language || 'auto',
    translate: options.translate || false,
    maxLen: options.maxLen || 1,
    splitOnWord: options.splitOnWord || false,
    onNewSegments: options.onNewSegments,
  });
}

// ===== Permissions =====


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

// ===== Real-time streaming transcription =====

export interface RealtimeOptions {
  language?: string;
  useVad?: boolean;
  realtimeAudioSec?: number;
  onPartial?: (text: string) => void;
  onSegment?: (text: string) => void;
}

let realtimeStop: (() => Promise<void>) | null = null;

export async function startRealtimeTranscription(
  options: RealtimeOptions = {},
): Promise<void> {
  if (!activeContext) {
    const downloadedId = await findAnyDownloadedWhisperModel();
    if (!downloadedId) {
      throw new Error('Nenhum modelo Whisper baixado. Baixe um na tela de Downloads.');
    }
    console.log('[WhisperService] Carregando modelo para realtime:', downloadedId);
    await loadWhisperModel(downloadedId);
  }

  const { stop, subscribe } = await activeContext.transcribeRealtime({
    language: options.language || 'pt',
    useVad: options.useVad ?? true,
    realtimeAudioSec: options.realtimeAudioSec ?? 3,
  });

  realtimeStop = stop;

  subscribe((event: any) => {
    const text = event?.data?.result?.trim() || '';
    if (text.length === 0) return;

    if (event.isCapturing) {
      // Partial result — texto ainda sendo processado
      options.onPartial?.(text);
    } else {
      // Final segment
      options.onSegment?.(text);
    }
  });
}

export async function stopRealtimeTranscription(): Promise<void> {
  if (realtimeStop) {
    try {
      await realtimeStop();
    } catch {
      // ignore
    }
    realtimeStop = null;
  }
}

export function isRealtimeActive(): boolean {
  return realtimeStop !== null;
}
