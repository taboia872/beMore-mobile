/**
 * TtsService — voice-agnostic TTS wrapper for react-native-sherpa-onnx-offline-tts (Piper VITS)
 *
 * Architecture:
 *   VoiceBundle interface abstracts any voice (k2-fsa or custom future).
 *   TtsService.inject(voiceBundle) plugs any voice into the same native interface.
 *
 * Download flow:
 *   1. RNFS.downloadFile() fetches .tar.bz2 from k2-fsa GitHub releases
 *   2. Native TTSManager.extractTarBz2(archivePath, destDir) extracts in-place
 *   3. Files located: modelPath (.onnx), tokensPath (tokens.txt), dataDirPath (espeak-ng-data/)
 *   4. sampleRate read from .onnx.json (parses "audio.sample_rate")
 *
 * Initialization flow:
 *   NativeModules.TTSManager.initializeTTS(sampleRate, 1, JSON config string)
 *   config = { modelPath, tokensPath, dataDirPath }
 *
 * Usage:
 *   const bundle = await downloadVoice('en_US-amy-low', onProgress);
 *   await injectVoice(bundle);
 *   await speak("Hello world");
 *   await deinitializeTts();
 */

import { NativeModules, NativeEventEmitter } from 'react-native';
import RNFS from 'react-native-fs';

// ─── Types ─────────────────────────────────────────────────────────────────

/**
 * VoiceBundle: resultado de baixar + extrair uma voz.
 * Voice-agnostic — qualquer voz (k2-fsa ou custom futura) produz um VoiceBundle.
 */
export interface VoiceBundle {
  id: string;
  /** caminho absoluto do .onnx no filesystem */
  modelPath: string;
  /** caminho absoluto do tokens.txt */
  tokensPath: string;
  /** caminho absoluto do diretório espeak-ng-data/ */
  dataDirPath: string;
  /** sample rate lido do .onnx.json (ex: 16000) */
  sampleRate: number;
}

/**
 * Catálogo de vozes disponíveis para download.
 * URLs apontam para releases do k2-fsa/sherpa-onnx no GitHub (já convertidos).
 */
export interface TtsVoiceInfo {
  id: string;
  name: string;
  description: string;
  sizeMB: number;
  /** URL do .tar.bz2 no GitHub releases do k2-fsa */
  url: string;
  /** nome do .tar.bz2 (ex: vits-piper-en_US-amy-low.tar.bz2) */
  archiveFilename: string;
  /** nome do diretório raiz dentro do tar (ex: vits-piper-en_US-amy-low) */
  rootDirName: string;
  /** nome do arquivo .onnx dentro do tar */
  onnxFilename: string;
  /** nome do arquivo .onnx.json dentro do tar */
  onnxJsonFilename: string;
  /** idioma para exibição na UI */
  language: string;
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

// ─── Voice catalog (k2-fsa GitHub releases) ───────────────────────────────

export const TTS_VOICES: TtsVoiceInfo[] = [
  {
    id: 'en_US-amy-low',
    name: 'Amy (EN-US, Low)',
    description: 'Voz feminina em inglês americano. Compacta (~64MB). Ideal para primeiro teste.',
    sizeMB: 64,
    url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-en_US-amy-low.tar.bz2',
    archiveFilename: 'vits-piper-en_US-amy-low.tar.bz2',
    rootDirName: 'vits-piper-en_US-amy-low',
    onnxFilename: 'en_US-amy-low.onnx',
    onnxJsonFilename: 'en_US-amy-low.onnx.json',
    language: 'Inglês (US)',
  },
  {
    id: 'pt_BR-faber-medium',
    name: 'Faber (PT-BR, Medium)',
    description: 'Voz masculina em português brasileiro. Qualidade média (~63MB).',
    sizeMB: 63,
    url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-pt_BR-faber-medium.tar.bz2',
    archiveFilename: 'vits-piper-pt_BR-faber-medium.tar.bz2',
    rootDirName: 'vits-piper-pt_BR-faber-medium',
    onnxFilename: 'pt_BR-faber-medium.onnx',
    onnxJsonFilename: 'pt_BR-faber-medium.onnx.json',
    language: 'Português (BR)',
  },
];

// ─── State ─────────────────────────────────────────────────────────────────

let isInitialized = false;
let activeVoiceBundle: VoiceBundle | null = null;
let volumeListener: { remove: () => void } | null = null;

const ACTIVE_DOWNLOADS: Record<string, { promise: Promise<VoiceBundle>; jobId: number }> = {};

// ─── Filesystem helpers ───────────────────────────────────────────────────

export function getTtsModelsDir(): string {
  return `${RNFS.DocumentDirectoryPath}/tts-models`;
}

async function ensureTtsModelsDir(): Promise<void> {
  const dir = getTtsModelsDir();
  const exists = await RNFS.exists(dir);
  if (!exists) {
    await RNFS.mkdir(dir);
  }
}

function getVoiceDir(voice: TtsVoiceInfo): string {
  return `${getTtsModelsDir()}/${voice.rootDirName}`;
}

function getArchivePath(voice: TtsVoiceInfo): string {
  return `${getTtsModelsDir()}/${voice.archiveFilename}`;
}

// ─── Public: voice status ──────────────────────────────────────────────────

/**
 * Verifica se uma voz já foi baixada e extraída.
 * Confirma existência dos 3 artefatos: .onnx, tokens.txt, espeak-ng-data/
 */
export async function isVoiceDownloaded(voiceId: string): Promise<boolean> {
  const voice = TTS_VOICES.find((v) => v.id === voiceId);
  if (!voice) return false;

  const dir = getVoiceDir(voice);
  const onnxPath = `${dir}/${voice.onnxFilename}`;
  const tokensPath = `${dir}/tokens.txt`;
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

/**
 * Retorna o VoiceBundle de uma voz já baixada.
 * Lê o sample_rate do .onnx.json.
 */
export async function getVoiceBundle(voiceId: string): Promise<VoiceBundle | null> {
  const voice = TTS_VOICES.find((v) => v.id === voiceId);
  if (!voice) return null;

  const downloaded = await isVoiceDownloaded(voiceId);
  if (!downloaded) return null;

  const dir = getVoiceDir(voice);
  const modelPath = `${dir}/${voice.onnxFilename}`;
  const tokensPath = `${dir}/tokens.txt`;
  const dataDirPath = `${dir}/espeak-ng-data`;
  const jsonPath = `${dir}/${voice.onnxJsonFilename}`;

  // Ler sample_rate do .onnx.json
  let sampleRate = 22050; // fallback
  try {
    const jsonContent = await RNFS.readFile(jsonPath, 'utf8');
    const parsed = JSON.parse(jsonContent);
    if (parsed?.audio?.sample_rate) {
      sampleRate = parsed.audio.sample_rate;
    }
  } catch {
    // Se não conseguir ler o JSON, usa fallback 22050
  }

  return { id: voiceId, modelPath, tokensPath, dataDirPath, sampleRate };
}

// ─── Public: download + extract ────────────────────────────────────────────

/**
 * Baixa e extrai uma voz TTS.
 *
 * Fluxo:
 *   1. Baixa .tar.bz2 via RNFS.downloadFile (com progresso)
 *   2. Chama TTSManager.extractTarBz2(archivePath, destDir) para extrair
 *   3. Valida que os arquivos críticos existem
 *   4. Lê sample_rate do .onnx.json
 *   5. Remove o .tar.bz2 para economizar espaço
 *   6. Retorna VoiceBundle pronto para inject
 */
export async function downloadVoice(
  voiceId: string,
  onProgress?: ProgressCallback,
): Promise<VoiceBundle> {
  const voice = TTS_VOICES.find((v) => v.id === voiceId);
  if (!voice) throw new Error(`TTS voice not found: ${voiceId}`);

  // Cancela download anterior se houver
  const existing = ACTIVE_DOWNLOADS[voiceId];
  if (existing) {
    await cancelDownload(voiceId);
  }

  await ensureTtsModelsDir();
  const archivePath = getArchivePath(voice);
  const destDir = getTtsModelsDir();

  // Se já existe extraído, retorna o bundle direto
  const alreadyDownloaded = await isVoiceDownloaded(voiceId);
  if (alreadyDownloaded) {
    const bundle = await getVoiceBundle(voiceId);
    if (bundle) return bundle;
  }

  // Remove archive antigo se existir
  const archiveExists = await RNFS.exists(archivePath);
  if (archiveExists) {
    await RNFS.unlink(archivePath);
  }

  onProgress?.('downloading', 0, 0, 'Baixando modelo de voz...');

  const startTime = Date.now();

  try {
    // Step 1: Download .tar.bz2
    const ret = RNFS.downloadFile({
      fromUrl: voice.url,
      toFile: archivePath,
      progressInterval: 500,
      begin: (res: { contentLength: number }) => {
        onProgress?.('downloading', 0, res.contentLength, 'Baixando modelo de voz...');
      },
      progress: (res: { bytesWritten: number; contentLength: number }) => {
        const elapsed = (Date.now() - startTime) / 1000;
        const speed = elapsed > 0 ? res.bytesWritten / elapsed : 0;
        onProgress?.('downloading', res.bytesWritten, res.contentLength, `Baixando (${Math.round(speed / 1024)} KB/s)`);
      },
    });

    ACTIVE_DOWNLOADS[voiceId] = { promise: ret.promise as Promise<VoiceBundle>, jobId: ret.jobId };

    const result = await ret.promise;
    delete ACTIVE_DOWNLOADS[voiceId];

    if (result.statusCode < 200 || result.statusCode >= 300) {
      throw new Error(`Download failed: HTTP ${result.statusCode}`);
    }

    // Step 2: Extract .tar.bz2 via native bridge
    onProgress?.('extracting', 0, 0, 'Extraindo arquivos...');

    if (!TTSManager?.extractTarBz2) {
      throw new Error('Native method extractTarBz2 not available. Ensure TTSManagerModule.kt has the extractTarBz2 method.');
    }

    // extractTarBz2(archivePath, destDir) — extrai para destDir/
    // Resultado: destDir/vits-piper-xxx/ com .onnx, tokens.txt, espeak-ng-data/
    // Método nativo via Promise (extração em background thread)
    console.log('[TTS] extractTarBz2: start', { archivePath, destDir });
    const archiveSize = await RNFS.stat(archivePath);
    console.log('[TTS] archive size:', archiveSize?.size, 'bytes');
    const extractPromise = TTSManager.extractTarBz2(archivePath, destDir);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('extractTarBz2 timeout after 60s')), 60000)
    );
    await Promise.race([extractPromise, timeoutPromise]);
    console.log('[TTS] extractTarBz2: resolved OK');

    // Step 3: Validate extracted files
    const onnxPath = `${getVoiceDir(voice)}/${voice.onnxFilename}`;
    const onnxExists = await RNFS.exists(onnxPath);
    console.log('[TTS] post-extract: onnxExists =', onnxExists, 'at', onnxPath);
    if (!onnxExists) {
      // List what was extracted
      try {
        const items = await RNFS.readDir(destDir);
        console.log('[TTS] destDir contents:', items.map(i => i.name));
      } catch (e) {
        console.log('[TTS] cannot list destDir:', e);
      }
      throw new Error(`Extraction failed: .onnx not found at ${onnxPath}`);
    }

    // Step 4: Read sample_rate from .onnx.json
    onProgress?.('loading', 0, 0, 'Preparando voz...');

    const bundle = await getVoiceBundle(voiceId);
    if (!bundle) {
      throw new Error('Failed to build VoiceBundle after extraction');
    }

    // Step 5: Remove .tar.bz2 to save space
    try {
      await RNFS.unlink(archivePath);
    } catch {
      // non-fatal
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

/**
 * Cancela download em andamento.
 */
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

/**
 * Remove uma voz do disco.
 */
export async function deleteVoice(voiceId: string): Promise<void> {
  const voice = TTS_VOICES.find((v) => v.id === voiceId);
  if (!voice) return;

  // Se a voz ativa está sendo deletada, deinit primeiro
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

  // Remove archive também
  const archivePath = getArchivePath(voice);
  try {
    const archiveExists = await RNFS.exists(archivePath);
    if (archiveExists) {
      await RNFS.unlink(archivePath);
    }
  } catch {
    // ignore
  }
}

// ─── Public: TTS engine lifecycle ───────────────────────────────────────────

/**
 * Inicializa o TTS com um VoiceBundle.
 *
 * Chama NativeModules.TTSManager.initializeTTS(sampleRate, 1, config) diretamente
 * (bypass do wrapper da lib que hardcode 22050 — cada voz tem seu próprio sample_rate).
 *
 * config = JSON.stringify({ modelPath, tokensPath, dataDirPath })
 */
export async function injectVoice(bundle: VoiceBundle): Promise<void> {
  if (isInitialized) {
    await deinitializeTts();
  }

  // Valida que os arquivos existem antes de inicializar
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
  // Chama initializeTTS com o sample_rate correto do modelo
  // A lib wrapper hardcode 22050, mas lidamos direto com o native module
  await TTSManager.initializeTTS(bundle.sampleRate, 1, config);

  console.log('[TTS] injectVoice: initializeTTS resolved OK');
  isInitialized = true;
  activeVoiceBundle = bundle;
}

/**
 * Atalho: baixa (se necessário) + inicializa em um call.
 */
export async function initializeTts(voiceId: string, onProgress?: ProgressCallback): Promise<void> {
  let bundle = await getVoiceBundle(voiceId);
  if (!bundle) {
    bundle = await downloadVoice(voiceId, onProgress);
  }
  await injectVoice(bundle);
}

// ─── Public: speech API ────────────────────────────────────────────────────

/**
 * Gera fala e toca no speaker.
 * Retorna Promise que resolve quando a reprodução termina.
 */
export async function speak(text: string, sid: number = 0, speed: number = 1.0): Promise<void> {
  if (!isInitialized) {
    throw new Error('TTS not initialized. Call injectVoice or initializeTts first.');
  }
  await TTSManager.generateAndPlay(text, sid, speed);
}

/**
 * Gera fala e salva como arquivo WAV.
 */
export async function synthesizeToFile(text: string, path?: string): Promise<string> {
  if (!isInitialized) {
    throw new Error('TTS not initialized. Call injectVoice or initializeTts first.');
  }
  const outputPath = path || `${RNFS.DocumentDirectoryPath}/tts_output.wav`;
  const result = await TTSManager.generateAndSave(text, outputPath, 'wav');
  return result || outputPath;
}

/**
 * Para a reprodução atual e libera recursos.
 * Mesmo que deinitializeTts() mas pode ser chamado como stop.
 */
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

/**
 * Libera recursos do TTS completamente.
 */
export async function deinitializeTts(): Promise<void> {
  stopSpeaking();
}

// ─── Public: volume callback (para animar face do BMO) ─────────────────────

/**
 * Registra callback de volume (para animar a face do BMO enquanto fala).
 * O callback recebe um float 0.0-1.0 com o volume atual.
 * Quando volume === -1, a reprodução terminou.
 */
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
