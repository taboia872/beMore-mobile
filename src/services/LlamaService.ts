import { initLlama, releaseAllLlama, type LlamaContext } from 'llama.rn';
import RNFS from 'react-native-fs';
import { MODELS } from '../data/models';
import type { ModelInfo, ChatMessage } from '../types';

let activeContext: LlamaContext | null = null;
let activeModelId: string | null = null;

const STOP_WORDS = [
  '</s>', '<|end|>', '<|eot_id|>', '<|end_of_text|>',
  '<|im_end|>', '<|EOT|>', '<|END_OF_TURN_TOKEN|>',
  '<|end_of_turn|>', '<end_of_turn>',
];

// System prompt embutido — não enviado como mensagem separada para evitar
// erros de validação de alternância em modelos com chat templates estritos
// (ex: Gemma 3 que exige user/assistant/user/assistant começando com user)
const SYSTEM_PROMPT = 'You are BMO, a helpful AI assistant running fully on-device. Be concise and friendly. Respond in the same language as the user.';

export function getModelsDir(): string {
  return `${RNFS.DocumentDirectoryPath}/models`;
}

export function getModelPath(model: ModelInfo): string {
  return `${getModelsDir()}/${model.filename}`;
}

export function getActiveModelId(): string | null {
  return activeModelId;
}

export function isModelLoaded(): boolean {
  return activeContext !== null;
}

export interface InitProgress {
  progress: number;
}

export async function loadModel(
  modelId: string,
  onProgress?: (progress: number) => void,
): Promise<void> {
  if (activeContext) {
    if (activeModelId === modelId) return;
    await unloadModel();
  }

  const model = MODELS.find((m) => m.id === modelId);
  if (!model) throw new Error(`Model not found: ${modelId}`);

  const path = getModelPath(model);
  const exists = await RNFS.exists(path);
  if (!exists) throw new Error(`Model file not found: ${model.filename}. Download it first.`);

  activeModelId = modelId;

  try {
    activeContext = await initLlama(
      {
        model: path,
        n_ctx: 2048,
        n_batch: 512,
        n_threads: 4,
        use_mlock: true,
        use_mmap: true,
      },
      onProgress,
    );
  } catch (err) {
    activeContext = null;
    activeModelId = null;
    throw err;
  }
}

export async function unloadModel(): Promise<void> {
  if (activeContext) {
    try {
      await activeContext.completion({ prompt: '', n_predict: 0, ignore_eos: true, emit_partial_completion: false }).catch(() => {});
      await activeContext.release();
    } catch {
      // ignore
    }
    activeContext = null;
    activeModelId = null;
  }
}

export async function releaseAllModels(): Promise<void> {
  await releaseAllLlama();
  activeContext = null;
  activeModelId = null;
}

export interface CompletionResult {
  text: string;
  timings?: {
    predicted_per_second: number;
    predicted_n?: number;
    prompt_n?: number;
  };
}

function normalizeMessages(
  messages: ChatMessage[],
): { role: 'user' | 'assistant'; content: string }[] {
  let filtered = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .filter((m) => m.content.trim().length > 0)
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  if (filtered.length === 0) return [];

  // Se começa com assistant, adiciona user placeholder antes
  // (acontece quando há greeting do BMO sem conversa prévia)
  if (filtered[0].role === 'assistant') {
    filtered.unshift({ role: 'user', content: `[System: ${SYSTEM_PROMPT}]\n\nHi` });
    return filtered;
  }

  // Garante alternância: remove mensagens consecutivas do mesmo role
  // mantendo apenas a última de cada bloco consecutivo
  const normalized: { role: 'user' | 'assistant'; content: string }[] = [];
  let lastRole: string | null = null;
  for (const msg of filtered) {
    if (msg.role === lastRole) {
      const prev = normalized[normalized.length - 1];
      prev.content = prev.content + '\n' + msg.content;
    } else {
      normalized.push({ ...msg });
      lastRole = msg.role;
    }
  }

  // Merge do system prompt na primeira user message
  if (normalized[0].role === 'user') {
    normalized[0].content = `[System: ${SYSTEM_PROMPT}]\n\n${normalized[0].content}`;
  }

  return normalized;
}

export async function chatCompletion(
  messages: ChatMessage[],
  onToken: (token: string, accumulated: string) => void,
  signal?: { cancelled: boolean },
): Promise<CompletionResult> {
  if (!activeContext) throw new Error('Model not loaded. Call loadModel() first.');

  const apiMessages = normalizeMessages(messages);

  let accumulatedText = '';

  const result = await activeContext.completion(
    {
      messages: apiMessages,
      n_predict: 512,
      temperature: 0.8,
      top_k: 40,
      top_p: 0.95,
      // Penalização de repetição — resolve eco do prompt em Qwen2.5 e outros
      penalty_repeat: 1.2,     // >1.0 penaliza tokens repetidos
      penalty_freq: 0.5,       // penaliza tokens frequentes
      penalty_present: 0.5,    // penaliza tokens já presentes
      penalty_last_n: 64,      // janela de 64 tokens para aplicar penalização
      stop: STOP_WORDS,
      emit_partial_completion: true,
      enable_thinking: false,
    },
    (data) => {
      if (signal?.cancelled) return;
      const token = data.token || '';
      if (token) {
        accumulatedText += token;
        onToken(token, accumulatedText);
      }
    },
  );

  return {
    text: result.text || accumulatedText,
    timings: result.timings ? {
      predicted_per_second: result.timings.predicted_per_second,
      predicted_n: result.timings.predicted_n,
      prompt_n: result.timings.prompt_n,
    } : undefined,
  };
}

export async function stopCompletion(): Promise<void> {
  if (!activeContext) return;
  try {
    await activeContext.stopCompletion();
  } catch {
    // ignore
  }
}
