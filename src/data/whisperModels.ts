import { MODELS } from './models';
import { WhisperModelInfo } from '../types';

/**
 * Modelos Whisper GGML para STT
 * Extraídos da lista MODELS principal (em data/models.ts)
 */
export const WHISPER_MODELS: WhisperModelInfo[] = MODELS
  .filter((m) => m.type === 'whisper')
  .map((m) => ({
    id: m.id,
    name: m.name,
    author: m.author,
    description: m.description,
    size: m.size,
    sizeMB: m.sizeMB,
    language: m.id.includes('-en') ? 'en' : 'auto',
    url: m.url,
    filename: m.filename,
  }));
