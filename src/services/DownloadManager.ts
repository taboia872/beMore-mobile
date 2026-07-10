import { Platform } from 'react-native';
import RNFS from 'react-native-fs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ModelInfo, DownloadStatus } from '../types';
import { MODELS } from '../data/models';

type ProgressCallback = (
  status: DownloadStatus,
  received: number,
  total: number,
  speed: number,
  error?: string,
) => void;

const STORAGE_PREFIX = '@bmo/model_';
const ACTIVE_DOWNLOADS: Record<string, { promise: Promise<string>; jobId: number }> = {};

/**
 * Diretório onde os modelos GGUF serão salvos.
 */
function getModelsDir(): string {
  return `${RNFS.DocumentDirectoryPath}/models`;
}

/**
 * Garante que o diretório de modelos existe.
 */
async function ensureModelsDir(): Promise<void> {
  const dir = getModelsDir();
  const exists = await RNFS.exists(dir);
  if (!exists) {
    await RNFS.mkdir(dir);
  }
}

/**
 * Caminho completo do arquivo do modelo no disco.
 */
export function getModelPath(model: ModelInfo): string {
  return `${getModelsDir()}/${model.filename}`;
}

/**
 * Encontra modelo por ID.
 */
function findModel(modelId: string): ModelInfo | undefined {
  return MODELS.find((m) => m.id === modelId);
}

/**
 * Verifica se um modelo já foi baixado (arquivo existe no disco).
 */
export async function isModelDownloaded(modelId: string): Promise<boolean> {
  const model = findModel(modelId);
  if (!model) return false;
  const path = getModelPath(model);
  try {
    return await RNFS.exists(path);
  } catch {
    return false;
  }
}

/**
 * Tamanho do arquivo já baixado (em bytes), se existir.
 */
export async function getDownloadedSize(modelId: string): Promise<number> {
  const model = findModel(modelId);
  if (!model) return 0;
  const path = getModelPath(model);
  try {
    const exists = await RNFS.exists(path);
    if (!exists) return 0;
    const stat = await RNFS.stat(path);
    return stat.size || 0;
  } catch {
    return 0;
  }
}

/**
 * Marca modelo como baixado no AsyncStorage (cache rápido pra UI).
 */
export async function setModelDownloadedFlag(modelId: string): Promise<void> {
  await AsyncStorage.setItem(STORAGE_PREFIX + modelId, 'true');
}

/**
 * Remove flag de download.
 */
export async function clearModelDownloadedFlag(modelId: string): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_PREFIX + modelId);
}

/**
 * Faz o download do modelo via RNFS com progresso em tempo real.
 * Salva o arquivo .gguf no armazenamento interno do app.
 */
export async function downloadModel(
  model: ModelInfo,
  onProgress: ProgressCallback,
): Promise<string> {
  // Cancela download anterior se houver
  const existing = ACTIVE_DOWNLOADS[model.id];
  if (existing) {
    await cancelDownload(model.id);
  }

  await ensureModelsDir();
  const destPath = getModelPath(model);

  // Se o arquivo já existe, remove antes de re-baixar
  const alreadyExists = await RNFS.exists(destPath);
  if (alreadyExists) {
    await RNFS.unlink(destPath);
  }

  onProgress('downloading', 0, 0, 0);

  const startTime = Date.now();

  try {
    const ret = RNFS.downloadFile({
      fromUrl: model.url,
      toFile: destPath,
      progressInterval: 500,
      begin: (res: { contentLength: number }) => {
        onProgress('downloading', 0, res.contentLength, 0);
      },
      progress: (res: { bytesWritten: number; contentLength: number }) => {
        const elapsed = (Date.now() - startTime) / 1000;
        const speed = elapsed > 0 ? res.bytesWritten / elapsed : 0;
        onProgress('downloading', res.bytesWritten, res.contentLength, speed);
      },
    });

    ACTIVE_DOWNLOADS[model.id] = { promise: ret.promise, jobId: ret.jobId };

    const result = await ret.promise;
    delete ACTIVE_DOWNLOADS[model.id];

    if (result.statusCode >= 200 && result.statusCode < 300) {
      await setModelDownloadedFlag(model.id);
      onProgress('done', 0, 0, 0);
      return destPath;
    } else {
      onProgress('error', 0, 0, 0, `HTTP ${result.statusCode}`);
      throw new Error(`HTTP ${result.statusCode}`);
    }
  } catch (err) {
    delete ACTIVE_DOWNLOADS[model.id];
    const errMsg = err instanceof Error ? err.message : String(err);

    if (errMsg.includes('cancel') || errMsg.includes('abort')) {
      onProgress('idle', 0, 0, 0);
    } else {
      onProgress('error', 0, 0, 0, errMsg);
    }
    throw err;
  }
}

/**
 * Cancela download em andamento.
 */
export async function cancelDownload(modelId: string): Promise<void> {
  const active = ACTIVE_DOWNLOADS[modelId];
  if (active) {
    try {
      await RNFS.stopDownload(active.jobId);
    } catch {
      // ignore
    }
    delete ACTIVE_DOWNLOADS[modelId];
  }
}

/**
 * Remove o arquivo do modelo do disco + flag do AsyncStorage.
 */
export async function deleteModel(modelId: string): Promise<void> {
  const model = findModel(modelId);
  if (!model) return;

  await cancelDownload(modelId);

  const path = getModelPath(model);
  try {
    const exists = await RNFS.exists(path);
    if (exists) {
      await RNFS.unlink(path);
    }
  } catch {
    // ignore
  }

  await clearModelDownloadedFlag(modelId);
}
