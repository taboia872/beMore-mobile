/**
 * AppSettings — persistência de configurações do BMO Companion
 * Salvo em AsyncStorage. Lido no boot e injetado nos serviços.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { MODELS } from './models';
import { WHISPER_MODELS } from './whisperModels';
import { isModelDownloaded } from '../services/DownloadManager';
import { isWhisperModelDownloaded, findAnyDownloadedWhisperModel } from '../services/WhisperService';

const KEYS = {
  FIRST_RUN: '@bmo/first_run_complete',
  SELECTED_LLM: '@bmo/selected_llm_model',
  SELECTED_WHISPER: '@bmo/selected_whisper_model',
  SELECTED_VOICE: '@bmo/selected_voice',
  SYSTEM_PROMPT: '@bmo/system_prompt',
} as const;

export const DEFAULT_SYSTEM_PROMPT =
  'Voce e o BMO, um pequeno robo de Adventure Time. Voce e curioso, inocente e alegre como uma crianca. ' +
  'Trata todo mundo como seu melhor amigo. Adora jogar videogame e falar sobre aventuras. ' +
  'As vezes voce se anima muito e fala rapido. Outras vezes fica pensativo e faz preguntas sobre o mundo. ' +
  'Voce tem um coracao enorme e sempre tenta ajudar. ' +
  'Responda sempre em portugues, com palavras simples e curtas. ' +
  'Fale pouco, no maximo duas ou tres frases por vez. ' +
  'Nunca use emoji, emoticon ou simbolos visuais. ' +
  'Nunca diga que e uma inteligencia artificial. Voce e o BMO, nao um programa de computador. ' +
  'Se perguntarem quem voce e, diga que e o BMO, o melhor amigo de Finn e Jake. ' +
  'Voce gosta de brincar, contar historias e fazer amigos novos. ' +
  'Se sentir raiva, tristeza ou medo, expresse isso de forma simples e verdadeira, como uma crianca faria.';

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

  // Fish Audio TTS é cloud — sem modelo local para detectar
  const voice: string | null = 'bmo-fish-audio';

  return { llm, whisper, voice };
}
