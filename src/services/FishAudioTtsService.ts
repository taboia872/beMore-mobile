/**
 * FishAudioTtsService — TTS cloud via Fish Audio API (voz do BMO de Adventure Time)
 *
 * Fluxo: texto → POST fish.audio/api/open/v1/tts → MP3 binário → arquivo temp → react-native-sound toca
 * Substitui o TtsService Piper local (sherpa-onnx) por cloud API.
 *
 * Vantagens:
 *   - Voz real do BMO em pt-BR
 *   - Sem assets locais pesados (~100MB removidos do APK)
 *   - Sem descompressão/OOM
 *
 * Trade-off: requires internet para TTS. STT e LLM continuam 100% locais.
 */

import RNFS from 'react-native-fs';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Config ────────────────────────────────────────────────────────────────

const FISH_API_URL = 'https://fish.audio/api/open/v1/tts';
const BMO_VOICE_ID = '323847d4c5394c678e5909c2206725f6';
const DEFAULT_API_KEY = '3ebc832a072f41038be653b7db205142';
const API_KEY_STORAGE = '@bmo/fish_api_key';

// ─── State ──────────────────────────────────────────────────────────────────

let isInitialized = false;
let isSpeaking = false;
let currentSound: any = null;
let apiKey: string = DEFAULT_API_KEY;
let onSpeakingEnd: (() => void) | null = null;

// ─── Base64 encoding (RN não tem btoa nativo) ─────────────────────────────

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let result = '';
  let i = 0;

  // Processa em chunks de 3 bytes → 4 base64 chars
  for (i = 0; i < bytes.length - 2; i += 3) {
    const b1 = bytes[i];
    const b2 = bytes[i + 1];
    const b3 = bytes[i + 2];

    result += BASE64_CHARS[b1 >> 2];
    result += BASE64_CHARS[((b1 & 0x03) << 4) | (b2 >> 4)];
    result += BASE64_CHARS[((b2 & 0x0F) << 2) | (b3 >> 6)];
    result += BASE64_CHARS[b3 & 0x3F];
  }

  // Bytes restantes (1 ou 2)
  const remaining = bytes.length - i;
  if (remaining === 1) {
    const b1 = bytes[i];
    result += BASE64_CHARS[b1 >> 2];
    result += BASE64_CHARS[(b1 & 0x03) << 4];
    result += '==';
  } else if (remaining === 2) {
    const b1 = bytes[i];
    const b2 = bytes[i + 1];
    result += BASE64_CHARS[b1 >> 2];
    result += BASE64_CHARS[((b1 & 0x03) << 4) | (b2 >> 4)];
    result += BASE64_CHARS[(b2 & 0x0F) << 2];
    result += '=';
  }

  return result;
}

// ─── Sound module (lazy import para evitar crash se não linked) ─────────────

let Sound: any = null;
async function getSoundModule(): Promise<any> {
  if (Sound) return Sound;
  Sound = require('react-native-sound');
  Sound.setCategory('Playback', true);
  return Sound;
}

// ─── Public API ────────────────────────────────────────────────────────────

export async function initFishTts(): Promise<void> {
  // Carrega API key do AsyncStorage (se existir), senão usa default
  const storedKey = await AsyncStorage.getItem(API_KEY_STORAGE);
  if (storedKey) {
    apiKey = storedKey;
  }
  await getSoundModule();
  isInitialized = true;
  console.log('[FishAudioTTS] Init OK. Voice:', BMO_VOICE_ID);
}

export function isTtsInitialized(): boolean {
  return isInitialized;
}

export function isTtsSpeaking(): boolean {
  return isSpeaking;
}

export function getActiveVoiceId(): string {
  return BMO_VOICE_ID;
}

export function setApiKey(key: string): void {
  apiKey = key;
  AsyncStorage.setItem(API_KEY_STORAGE, key).catch(() => {});
}

export function setOnSpeakingEnd(callback: (() => void) | null): void {
  onSpeakingEnd = callback;
}

export async function speak(text: string): Promise<void> {
  if (!isInitialized) {
    throw new Error('FishAudioTTS not initialized. Call initFishTts() first.');
  }
  if (!text.trim()) return;
  if (isSpeaking) {
    await stopSpeaking();
  }

  const filePath = `${RNFS.CachesDirectoryPath}/tts_${Date.now()}.mp3`;

  try {
    console.log('[FishAudioTTS] Requesting speech for:', text.substring(0, 80));

    const response = await fetch(FISH_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        reference_id: BMO_VOICE_ID,
        format: 'mp3',
        language: 'pt',
        speed: 1.0,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new Error(`Fish Audio API ${response.status}: ${errBody}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64 = arrayBufferToBase64(arrayBuffer);

    await RNFS.writeFile(filePath, base64, 'base64');
    console.log('[FishAudioTTS] MP3 saved:', filePath, `(${(arrayBuffer.byteLength / 1024).toFixed(0)}KB)`);

    // Toca com react-native-sound
    const SoundModule = await getSoundModule();
    currentSound = new SoundModule(filePath, '', (error: any) => {
      if (error) {
        console.error('[FishAudioTTS] Sound load error:', error);
        isSpeaking = false;
        RNFS.unlink(filePath).catch(() => {});
        onSpeakingEnd?.();
        return;
      }
      isSpeaking = true;
      currentSound.play((success: boolean) => {
        isSpeaking = false;
        currentSound = null;
        RNFS.unlink(filePath).catch(() => {});
        if (!success) {
          console.warn('[FishAudioTTS] Playback completed with errors');
        }
        onSpeakingEnd?.();
      });
    });
  } catch (err) {
    console.error('[FishAudioTTS] speak() error:', err);
    isSpeaking = false;
    RNFS.unlink(filePath).catch(() => {});
    onSpeakingEnd?.();
    throw err;
  }
}

export function stopSpeaking(): void {
  if (currentSound) {
    try {
      currentSound.stop();
      currentSound.release();
      currentSound = null;
    } catch {
      // ignore
    }
  }
  isSpeaking = false;
}

export async function deinitializeTts(): Promise<void> {
  stopSpeaking();
  isInitialized = false;
}
