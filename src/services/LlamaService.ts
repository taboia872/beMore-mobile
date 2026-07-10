import { initLlama, releaseAllLlama, type LlamaContext } from 'llama.rn';
import RNFS from 'react-native-fs';
import { MODELS } from '../data/models';
import type { ModelInfo, ChatMessage } from '../types';

let activeContext: LlamaContext | null = null;
let activeModelId: string | null = null;

const STOP_WORDS = [
  '</s>', '<|end|>', '<|eot_id|>', '<|end_of_text|>',
  '<|im_end|>', '<|EOT|>', '<|END_OF_TURN_TOKEN|>',
  '<|end_of_turn|>',
];

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
    predicted_n: number;
    prompt_n: number;
  };
}

export async function chatCompletion(
  messages: ChatMessage[],
  onToken: (token: string, accumulated: string) => void,
  signal?: { cancelled: boolean },
): Promise<CompletionResult> {
  if (!activeContext) throw new Error('Model not loaded. Call loadModel() first.');

  const apiMessages = messages
    .filter((m) => !m.isError && m.content.trim().length > 0)
    .map((m) => ({
      role: m.role,
      content: m.content,
    }));

  let accumulatedText = '';

  const result = await activeContext.completion(
    {
      messages: apiMessages,
      n_predict: 512,
      temperature: 0.8,
      top_k: 40,
      top_p: 0.95,
      stop: STOP_WORDS,
      emit_partial_completion: true,
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
