/**
 * TtsService — voice-agnostic TTS wrapper for react-native-sherpa-onnx-offline-tts (Piper VITS)
 *
 * Architecture:
 *   VoiceBundle interface abstracts any voice (k2-fsa or custom future).
 *   TtsService.inject(voiceBundle) plugs any voice into the same native interface.
 *
 * Download flow (NO tar.bz2 extraction — individual files):
 *   1. RNFS.downloadFile() fetches .onnx, tokens.txt, .onnx.json individually
 *   2. RNFS.downloadFile() fetches espeak-ng-data.zip (8.6MB)
 *   3. Native TTSManager.extractZip(zipPath, destDir) extracts espeak-ng-data via java.util.zip
 *   4. sampleRate read from .onnx.json (parses "audio.sample_rate")
 *
 * Initialization flow:
 *   NativeModules.TTSManager.initializeTTS(sampleRate, 1, JSON config string)
 *   config = { modelPath, tokensPath, dataDirPath }
 */

import { NativeModules, NativeEventEmitter } from 'react-native';
import RNFS from 'react-native-fs';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface VoiceBundle {
  id: string;
  modelPath: string;
  tokensPath: string;
  dataDirPath: string;
  sampleRate: number;
}

export interface TtsVoiceInfo {
  id: string;
  name: string;
  description: string;
  sizeMB: number;
  language: string;
  /** Base URL for individual file downloads */
  baseUrl: string;
  onnxFilename: string;
  onnxJsonFilename: string;
  tokensFilename: string;
  espeakZipFilename: string;
}

export type TtsStatus = 'idle' | 'downloading' | 'extracting' | 'loading' | 'ready' | 'speaking' | 'error';

type ProgressCallback = (
  status: TtsStatus,
  received: number,
  total: number,
  message?: string,
) => void;

// ─── Native bridge ────────────────────────────────────────────────────────

const TTSManager = NativeModules.TTSManager;
const ttsEmitter = TTSManager ? new NativeEventEmitter(TTSManager) : null;

// ─── Voice catalog (GitHub releases — pre-extracted individual files) ─────

const ASSETS_BASE = 'https://github.com/taboia872/beMore-mobile/releases/download/tts-voice-assets';

export const TTS_VOICES: TtsVoiceInfo[] = [
  {
    id: 'en_US-amy-low',
    name: 'Amy (EN-US, Low)',
    description: 'Voz feminina em inglês americano. Compacta (~64MB). Ideal para primeiro teste.',
    sizeMB: 68,
    language: 'Inglês (US)',
    baseUrl: `${ASSETS_BASE}`,
    onnxFilename: 'en_US-amy-low.onnx',
    onnxJsonFilename: 'en_US-amy-low.onnx.json',
    tokensFilename: 'tokens.txt',
    espeakZipFilename: 'espeak-ng-data.zip',
  },
];

// ─── State ─────────────────────────────────────────────────────────────────

let isInitialized = false;
let activeVoiceBundle: VoiceBundle | null = null;
let volumeListener: { remove: () => void } | null = null;

const ACTIVE_DOWNLOADS: Record<string, { jobId: number }> = {};

// ─── Filesystem helpers ───────────────────────────────────────────────────

export function getTtsModelsDir(): string {
  return `${RNFS.DocumentDirectoryPath}/tts-models`;
}

async function ensureDir(dir: string): Promise<void> {
  const exists = await RNFS.exists(dir);
  if (!exists) {
    await RNFS.mkdir(dir);
  }
}

function getVoiceDir(voice: TtsVoiceInfo): string {
  return `${getTtsModelsDir()}/${voice.id}`;
}

// ─── Public: voice status ──────────────────────────────────────────────────

export async function isVoiceDownloaded(voiceId: string): Promise<boolean> {
  const voice = TTS_VOICES.find((v) => v.id === voiceId);
  if (!voice) return false;

  const dir = getVoiceDir(voice);
  const onnxPath = `${dir}/${voice.onnxFilename}`;
  const tokensPath = `${dir}/${voice.tokensFilename}`;
  const dataDir = `${dir}/espeak-ng-data`;

  try {
    const onnxExists = await RNFS.exists(onnxPath);
    if (!onnxExists) return false;
    const onnxStat = await RNFS.stat(onnxPath);
    if (!onnxStat || onnxStat.size < 1000) return false;

    const tokensExists = await RNFS.exists(tokensPath);
    if (!tokensExists) return false;
    const tokensStat = await RNFS.stat(tokensPath);
    if (!tokensStat || tokensStat.size < 10) return false;

    const dataDirExists = await RNFS.exists(dataDir);
    if (!dataDirExists) return false;

    return true;
  } catch {
    return false;
  }
}

export async function getVoiceBundle(voiceId: string): Promise<VoiceBundle | null> {
  const voice = TTS_VOICES.find((v) => v.id === voiceId);
  if (!voice) return null;

  const downloaded = await isVoiceDownloaded(voiceId);
  if (!downloaded) return null;

  const dir = getVoiceDir(voice);
  const modelPath = `${dir}/${voice.onnxFilename}`;
  const tokensPath = `${dir}/${voice.tokensFilename}`;
  const dataDirPath = `${dir}/espeak-ng-data`;
  const jsonPath = `${dir}/${voice.onnxJsonFilename}`;

  let sampleRate = 16000;
  try {
    const jsonContent = await RNFS.readFile(jsonPath, 'utf8');
    const parsed = JSON.parse(jsonContent);
    if (parsed?.audio?.sample_rate) {
      sampleRate = parsed.audio.sample_rate;
    }
  } catch {
    // fallback
  }

  return { id: voiceId, modelPath, tokensPath, dataDirPath, sampleRate };
}

// ─── Download helper ──────────────────────────────────────────────────────

async function downloadFile(
  url: string,
  toPath: string,
  onProgress: (received: number, total: number, msg: string) => void,
  label: string,
): Promise<void> {
  const startTime = Date.now();

  const ret = RNFS.downloadFile({
    fromUrl: url,
    toFile: toPath,
    progressInterval: 500,
    begin: (res: { contentLength: number }) => {
      onProgress(0, res.contentLength, `${label}...`);
    },
    progress: (res: { bytesWritten: number; contentLength: number }) => {
      const elapsed = (Date.now() - startTime) / 1000;
      const speed = elapsed > 0 ? res.bytesWritten / elapsed : 0;
      onProgress(res.bytesWritten, res.contentLength, `${label} (${Math.round(speed / 1024)} KB/s)`);
    },
  });

  ACTIVE_DOWNLOADS[label] = { jobId: ret.jobId };

  const result = await ret.promise;
  delete ACTIVE_DOWNLOADS[label];

  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw new Error(`Download failed: HTTP ${result.statusCode} for ${url}`);
  }
}

// ─── Public: download + extract ────────────────────────────────────────────

export async function downloadVoice(
  voiceId: string,
  onProgress?: ProgressCallback,
): Promise<VoiceBundle> {
  const voice = TTS_VOICES.find((v) => v.id === voiceId);
  if (!voice) throw new Error(`TTS voice not found: ${voiceId}`);

  const existing = ACTIVE_DOWNLOADS[voiceId];
  if (existing) {
    await cancelDownload(voiceId);
  }

  await ensureDir(getTtsModelsDir());
  const dir = getVoiceDir(voice);
  await ensureDir(dir);

  // If already downloaded, return bundle
  const alreadyDownloaded = await isVoiceDownloaded(voiceId);
  if (alreadyDownloaded) {
    const bundle = await getVoiceBundle(voiceId);
    if (bundle) return bundle;
  }

  const totalFiles = 4; // .onnx + tokens.txt + .onnx.json + espeak-ng-data.zip
  let filesDone = 0;
  const reportProgress = (status: TtsStatus, received: number, total: number, msg: string) => {
    onProgress?.(status, received, total, msg);
  };

  const fileProgress = (received: number, total: number, msg: string) => {
    const overallPct = total > 0 ? ((filesDone / totalFiles) + (received / total / totalFiles)) * 100 : 0;
    reportProgress('downloading', received, total, `${msg} [${Math.round(overallPct)}% total]`);
  };

  try {
    // Step 1: Download .onnx (largest file — ~60MB)
    console.log('[TTS] Downloading .onnx...');
    await downloadFile(
      `${voice.baseUrl}/${voice.onnxFilename}`,
      `${dir}/${voice.onnxFilename}`,
      fileProgress,
      'Modelo ONNX',
    );
    filesDone++;
    console.log('[TTS] .onnx downloaded OK');

    // Step 2: Download tokens.txt (small)
    console.log('[TTS] Downloading tokens.txt...');
    await downloadFile(
      `${voice.baseUrl}/${voice.tokensFilename}`,
      `${dir}/${voice.tokensFilename}`,
      fileProgress,
      'Tokens',
    );
    filesDone++;
    console.log('[TTS] tokens.txt downloaded OK');

    // Step 3: Download .onnx.json (small)
    console.log('[TTS] Downloading .onnx.json...');
    await downloadFile(
      `${voice.baseUrl}/${voice.onnxJsonFilename}`,
      `${dir}/${voice.onnxJsonFilename}`,
      fileProgress,
      'Config',
    );
    filesDone++;
    console.log('[TTS] .onnx.json downloaded OK');

    // Step 4: Download espeak-ng-data.zip (8.6MB)
    console.log('[TTS] Downloading espeak-ng-data.zip...');
    const zipPath = `${dir}/espeak-ng-data.zip`;
    await downloadFile(
      `${voice.baseUrl}/${voice.espeakZipFilename}`,
      zipPath,
      fileProgress,
      'Espeak data',
    );
    filesDone++;
    console.log('[TTS] espeak-ng-data.zip downloaded OK');

    // Step 5: Extract espeak-ng-data.zip via native ZipInputStream
    onProgress?.('extracting', 0, 0, 'Extraindo espeak-ng-data...');

    if (!TTSManager?.extractZip) {
      throw new Error('Native method extractZip not available.');
    }

    console.log('[TTS] extractZip: start', { zipPath, destDir: dir });
    await TTSManager.extractZip(zipPath, dir);
    console.log('[TTS] extractZip: resolved OK');

    // Validate extraction
    const dataDirExists = await RNFS.exists(`${dir}/espeak-ng-data`);
    if (!dataDirExists) {
      throw new Error('espeak-ng-data dir not found after extraction');
    }

    // Clean up zip
    try {
      await RNFS.unlink(zipPath);
    } catch {
      // non-fatal
    }

    // Step 6: Build bundle
    onProgress?.('loading', 0, 0, 'Preparando voz...');

    const bundle = await getVoiceBundle(voiceId);
    if (!bundle) {
      throw new Error('Failed to build VoiceBundle after download');
    }

    onProgress?.('ready', 0, 0, 'Voz pronta');
    return bundle;
  } catch (err) {
    delete ACTIVE_DOWNLOADS[voiceId];
    const errMsg = err instanceof Error ? err.message : String(err);

    if (errMsg.includes('cancel') || errMsg.includes('abort')) {
      onProgress?.('idle', 0, 0);
    } else {
      onProgress?.('error', 0, 0, errMsg);
    }
    throw err;
  }
}

export async function cancelDownload(voiceId: string): Promise<void> {
  const active = ACTIVE_DOWNLOADS[voiceId];
  if (active) {
    try {
      await RNFS.stopDownload(active.jobId);
    } catch {
      // ignore
    }
    delete ACTIVE_DOWNLOADS[voiceId];
  }
}

export async function deleteVoice(voiceId: string): Promise<void> {
  const voice = TTS_VOICES.find((v) => v.id === voiceId);
  if (!voice) return;

  if (activeVoiceBundle?.id === voiceId && isInitialized) {
    await deinitializeTts();
  }

  const dir = getVoiceDir(voice);
  try {
    const exists = await RNFS.exists(dir);
    if (exists) {
      await RNFS.unlink(dir);
    }
  } catch {
    // ignore
  }
}

// ─── Public: TTS engine lifecycle ───────────────────────────────────────────

export async function injectVoice(bundle: VoiceBundle): Promise<void> {
  if (isInitialized) {
    await deinitializeTts();
  }

  const modelExists = await RNFS.exists(bundle.modelPath);
  if (!modelExists) {
    throw new Error(`TTS model not found: ${bundle.modelPath}`);
  }
  const tokensExists = await RNFS.exists(bundle.tokensPath);
  if (!tokensExists) {
    throw new Error(`tokens.txt not found: ${bundle.tokensPath}`);
  }
  const dataDirExists = await RNFS.exists(bundle.dataDirPath);
  if (!dataDirExists) {
    throw new Error(`espeak-ng-data dir not found: ${bundle.dataDirPath}`);
  }

  const config = JSON.stringify({
    modelPath: bundle.modelPath,
    tokensPath: bundle.tokensPath,
    dataDirPath: bundle.dataDirPath,
  });

  console.log('[TTS] injectVoice: calling initializeTTS', {
    sampleRate: bundle.sampleRate,
    modelPath: bundle.modelPath,
    tokensPath: bundle.tokensPath,
    dataDirPath: bundle.dataDirPath,
  });

  await TTSManager.initializeTTS(bundle.sampleRate, 1, config);

  console.log('[TTS] injectVoice: initializeTTS resolved OK');
  isInitialized = true;
  activeVoiceBundle = bundle;
}

export async function initializeTts(voiceId: string, onProgress?: ProgressCallback): Promise<void> {
  let bundle = await getVoiceBundle(voiceId);
  if (!bundle) {
    bundle = await downloadVoice(voiceId, onProgress);
  }
  await injectVoice(bundle);
}

// ─── Public: speech API ────────────────────────────────────────────────────

export async function speak(text: string, sid: number = 0, speed: number = 1.0): Promise<void> {
  if (!isInitialized) {
    throw new Error('TTS not initialized. Call injectVoice or initializeTts first.');
  }
  await TTSManager.generateAndPlay(text, sid, speed);
}

export async function synthesizeToFile(text: string, path?: string): Promise<string> {
  if (!isInitialized) {
    throw new Error('TTS not initialized. Call injectVoice or initializeTts first.');
  }
  const outputPath = path || `${RNFS.DocumentDirectoryPath}/tts_output.wav`;
  const result = await TTSManager.generateAndSave(text, outputPath, 'wav');
  return result || outputPath;
}

export function stopSpeaking(): void {
  try {
    TTSManager?.deinitialize?.();
  } catch {
    // ignore
  }
  isInitialized = false;
  activeVoiceBundle = null;
  if (volumeListener) {
    volumeListener.remove();
    volumeListener = null;
  }
}

export async function deinitializeTts(): Promise<void> {
  stopSpeaking();
}

// ─── Public: volume callback ────────────────────────────────────────────────

export function setVolumeCallback(callback: (volume: number) => void): { remove: () => void } | null {
  if (volumeListener) {
    volumeListener.remove();
  }
  if (ttsEmitter) {
    volumeListener = ttsEmitter.addListener('VolumeUpdate', (event: { volume: number }) => {
      callback(event.volume);
    });
    return volumeListener;
  }
  return null;
}

// ─── Public: introspection ─────────────────────────────────────────────────

export function isTtsInitialized(): boolean {
  return isInitialized;
}

export function getActiveVoiceBundle(): VoiceBundle | null {
  return activeVoiceBundle;
}

export function getActiveVoiceId(): string | null {
  return activeVoiceBundle?.id ?? null;
}
