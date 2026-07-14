/**
 * LoadingScreen — auto-load de LLM + STT + TTS na memória
 * Mostra progresso de cada componente. Ao terminar, chama onReady().
 */

import React, { useEffect, useState, useCallback } from 'react';
import { StyleSheet, View, Text, ActivityIndicator } from 'react-native';
import { loadSettings, autoDetectDownloadedModels, saveSettings } from '../data/appSettings';
import { loadModel, isModelLoaded, setSystemPrompt } from '../services/LlamaService';
import { loadWhisperModel, isWhisperLoaded, findAnyDownloadedWhisperModel } from '../services/WhisperService';
import { initializeTts, isTtsInitialized, getActiveVoiceId } from '../services/TtsService';

interface LoadingScreenProps {
  onReady: () => void;
  onError: (msg: string) => void;
}

type Step = 'llm' | 'stt' | 'tts' | 'done';
type StepStatus = 'pending' | 'loading' | 'ok' | 'skipped' | 'error';

interface StepState {
  status: StepStatus;
  label: string;
}

const STEPS: Step[] = ['llm', 'stt', 'tts'];

export default function LoadingScreen({ onReady, onError }: LoadingScreenProps) {
  const [currentStep, setCurrentStep] = useState<Step>('llm');
  const [steps, setSteps] = useState<Record<Step, StepState>>({
    llm: { status: 'pending', label: 'Modelo de linguagem' },
    stt: { status: 'pending', label: 'Reconhecimento de voz' },
    tts: { status: 'pending', label: 'Síntese de voz' },
    done: { status: 'pending', label: 'Pronto' },
  });
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const updateStep = (step: Step, status: StepStatus) => {
    setSteps((prev) => ({ ...prev, [step]: { ...prev[step], status } }));
  };

  const run = useCallback(async () => {
    try {
      const settings = await loadSettings();

      // Auto-detectar modelos baixados se não houver seleção
      if (!settings.selectedLlmModel || !settings.selectedWhisperModel || !settings.selectedVoice) {
        const detected = await autoDetectDownloadedModels();
        const updates: Parameters<typeof saveSettings>[0] = {};
        if (!settings.selectedLlmModel && detected.llm) updates.selectedLlmModel = detected.llm;
        if (!settings.selectedWhisperModel && detected.whisper) updates.selectedWhisperModel = detected.whisper;
        if (!settings.selectedVoice && detected.voice) updates.selectedVoice = detected.voice;
        if (Object.keys(updates).length > 0) {
          await saveSettings(updates);
          Object.assign(settings, updates);
        }
      }

      // === Inject System Prompt ===
      setSystemPrompt(settings.systemPrompt);

      // === Step 1: LLM ===
      setCurrentStep('llm');
      updateStep('llm', 'loading');
      if (settings.selectedLlmModel) {
        if (!isModelLoaded()) {
          await loadModel(settings.selectedLlmModel, (p) => setProgress(p));
        }
        updateStep('llm', 'ok');
      } else {
        updateStep('llm', 'skipped');
      }

      // === Step 2: STT ===
      setCurrentStep('stt');
      updateStep('stt', 'loading');
      if (settings.selectedWhisperModel) {
        if (!isWhisperLoaded()) {
          await loadWhisperModel(settings.selectedWhisperModel);
        }
        updateStep('stt', 'ok');
      } else {
        updateStep('stt', 'skipped');
      }

      // === Step 3: TTS ===
      setCurrentStep('tts');
      updateStep('tts', 'loading');
      if (settings.selectedVoice) {
        if (!isTtsInitialized()) {
          await initializeTts(settings.selectedVoice);
        }
        updateStep('tts', 'ok');
      } else {
        updateStep('tts', 'skipped');
      }

      // === Done ===
      updateStep('done', 'ok');
      setCurrentStep('done');
      setProgress(1);
      setTimeout(() => onReady(), 500);

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
      updateStep(currentStep, 'error');
      onError(msg);
    }
  }, [onReady, onError, currentStep]);

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const overallProgress = () => {
    const stepIdx = STEPS.indexOf(currentStep);
    if (stepIdx < 0) return 1;
    return (stepIdx + (currentStep !== 'done' ? progress : 1)) / STEPS.length;
  };

  const renderStep = (step: Step) => {
    const s = steps[step];
    let icon = '⏳';
    if (s.status === 'ok') icon = '✅';
    else if (s.status === 'loading') icon = '🔄';
    else if (s.status === 'skipped') icon = '⏭️';
    else if (s.status === 'error') icon = '❌';
    else if (s.status === 'pending') icon = '⏸️';

    return (
      <View key={step} style={styles.stepRow}>
        <Text style={styles.stepIcon}>{icon}</Text>
        <Text style={[
          styles.stepLabel,
          s.status === 'ok' && styles.stepDone,
          s.status === 'loading' && styles.stepActive,
          s.status === 'skipped' && styles.stepSkipped,
          s.status === 'error' && styles.stepError,
        ]}>
          {s.label}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.logoContainer}>
        <Text style={styles.bmoText}>BMO</Text>
        <ActivityIndicator size="large" color="#00E5FF" style={styles.spinner} />
        <Text style={styles.loadingText}>Acordando...</Text>
      </View>

      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${overallProgress() * 100}%` }]} />
        </View>
        {currentStep !== 'done' && progress > 0 && (
          <Text style={styles.progressPct}>{Math.round(progress * 100)}%</Text>
        )}
      </View>

      <View style={styles.stepsContainer}>
        {STEPS.map(renderStep)}
      </View>

      {errorMsg && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>❌ {errorMsg}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#bdffcb',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  bmoText: {
    fontSize: 64,
    fontWeight: 'bold',
    color: '#00E5FF',
    fontFamily: 'monospace',
    marginBottom: 16,
  },
  spinner: {
    marginBottom: 8,
  },
  loadingText: {
    fontSize: 16,
    color: '#555',
    fontFamily: 'monospace',
  },
  progressContainer: {
    width: '100%',
    maxWidth: 300,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 32,
  },
  progressBar: {
    flex: 1,
    height: 4,
    backgroundColor: '#1a1a2e',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#00E5FF',
    borderRadius: 2,
  },
  progressPct: {
    fontSize: 12,
    color: '#555',
    fontFamily: 'monospace',
    minWidth: 36,
  },
  stepsContainer: {
    width: '100%',
    maxWidth: 280,
    gap: 10,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stepIcon: {
    fontSize: 16,
  },
  stepLabel: {
    fontSize: 14,
    color: '#555',
    fontFamily: 'monospace',
  },
  stepDone: {
    color: '#00E5FF',
  },
  stepActive: {
    color: '#FFD700',
    fontWeight: 'bold',
  },
  stepSkipped: {
    color: '#333',
  },
  stepError: {
    color: '#ff5555',
  },
  errorBox: {
    marginTop: 24,
    padding: 12,
    backgroundColor: '#1a1010',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ff5555',
    maxWidth: 280,
  },
  errorText: {
    color: '#ff5555',
    fontSize: 12,
    fontFamily: 'monospace',
  },
});
