/**
 * AppSettings — persistência de configurações do BMO Companion
 * Salvo em AsyncStorage. Lido no boot e injetado nos serviços.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { MODELS } from './models';
import { WHISPER_MODELS } from './whisperModels';
import { TTS_VOICES } from '../services/TtsService';
import { isModelDownloaded } from '../services/DownloadManager';
import { isVoiceDownloaded } from '../services/TtsService';
import { isWhisperModelDownloaded, findAnyDownloadedWhisperModel } from '../services/WhisperService';

const KEYS = {
  FIRST_RUN: '@bmo/first_run_complete',
  SELECTED_LLM: '@bmo/selected_llm_model',
  SELECTED_WHISPER: '@bmo/selected_whisper_model',
  SELECTED_VOICE: '@bmo/selected_voice',
  SYSTEM_PROMPT: '@bmo/system_prompt',
} as const;

export const DEFAULT_SYSTEM_PROMPT =
  'Você é o BMO, um robô assistente gentil e divertido. Você é o melhor amigo da criança que está conversando com você. ' +
  'Seja carinhoso, brincalhão e responda sempre em português do Brasil. ' +
  'Use palavras simples. Nunca use linguagem inadequada. Nunca diga que é uma IA — você é o BMO, amigo da criança.';

export interface AppSettings {
  firstRunComplete: boolean;
  selectedLlmModel: string | null;
  selectedWhisperModel: string | null;
  selectedVoice: string | null;
  systemPrompt: string;
}

export async function loadSettings(): Promise<AppSettings> {
  const [
    firstRunRaw,
    llmId,
    whisperId,
    voiceId,
    prompt,
  ] = await Promise.all([
    AsyncStorage.getItem(KEYS.FIRST_RUN),
    AsyncStorage.getItem(KEYS.SELECTED_LLM),
    AsyncStorage.getItem(KEYS.SELECTED_WHISPER),
    AsyncStorage.getItem(KEYS.SELECTED_VOICE),
    AsyncStorage.getItem(KEYS.SYSTEM_PROMPT),
  ]);

  return {
    firstRunComplete: firstRunRaw === 'true',
    selectedLlmModel: llmId,
    selectedWhisperModel: whisperId,
    selectedVoice: voiceId,
    systemPrompt: prompt ?? DEFAULT_SYSTEM_PROMPT,
  };
}

export async function saveSettings(partial: Partial<AppSettings>): Promise<void> {
  const tasks: Promise<void>[] = [];
  if (partial.firstRunComplete !== undefined) {
    tasks.push(AsyncStorage.setItem(KEYS.FIRST_RUN, partial.firstRunComplete ? 'true' : 'false'));
  }
  if (partial.selectedLlmModel !== undefined) {
    if (partial.selectedLlmModel) {
      tasks.push(AsyncStorage.setItem(KEYS.SELECTED_LLM, partial.selectedLlmModel));
    }
  }
  if (partial.selectedWhisperModel !== undefined) {
    if (partial.selectedWhisperModel) {
      tasks.push(AsyncStorage.setItem(KEYS.SELECTED_WHISPER, partial.selectedWhisperModel));
    }
  }
  if (partial.selectedVoice !== undefined) {
    if (partial.selectedVoice) {
      tasks.push(AsyncStorage.setItem(KEYS.SELECTED_VOICE, partial.selectedVoice));
    }
  }
  if (partial.systemPrompt !== undefined) {
    tasks.push(AsyncStorage.setItem(KEYS.SYSTEM_PROMPT, partial.systemPrompt));
  }
  await Promise.all(tasks);
}

/**
 * Auto-detecta modelos baixados para usar como defaults na primeira vez.
 */
export async function autoDetectDownloadedModels(): Promise<{
  llm: string | null;
  whisper: string | null;
  voice: string | null;
}> {
  let llm: string | null = null;
  for (const m of MODELS.filter((m) => m.type === 'text')) {
    if (await isModelDownloaded(m.id)) {
      llm = m.id;
      break;
    }
  }

  const whisper = await findAnyDownloadedWhisperModel();

  let voice: string | null = null;
  for (const v of TTS_VOICES) {
    if (await isVoiceDownloaded(v.id)) {
      voice = v.id;
      break;
    }
  }

  return { llm, whisper, voice };
}
