/**
 * VoiceButton — Botão de microfone para STT
 * Modo File: tap → grava PCM/WAV → para → transcreve
 * Modo Realtime: tap inicia captura contínua → tap novamente para
 *   Texto parcial aparece em tempo real no input do chat
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  Text,
  ActivityIndicator,
  Alert,
  View,
  NativeModules,
} from 'react-native';
import RNFS from 'react-native-fs';
import {
  loadWhisperModel,
  unloadWhisperModel,
  transcribeFile,
  isWhisperLoaded,
  findAnyDownloadedWhisperModel,
  requestRecordAudioPermission,
  startRealtimeTranscription,
  stopRealtimeTranscription,
  isRealtimeActive,
} from '../services/WhisperService';
import { getRealtimeSttEnabled } from '../services/SettingsService';
import { toggleNativeLog, addNativeLogListener } from 'whisper.rn';

const { PcmRecorder } = NativeModules;

type RecordState = 'idle' | 'recording' | 'transcribing' | 'error';

interface VoiceButtonProps {
  onTranscription: (text: string) => void;
  /** Partial text update for realtime mode (updates input as user speaks) */
  onPartialTranscription?: (text: string) => void;
  disabled?: boolean;
}

export default function VoiceButton({
  onTranscription,
  onPartialTranscription,
  disabled,
}: VoiceButtonProps) {
  const [recordState, setRecordState] = useState<RecordState>('idle');
  const [realtimeMode, setRealtimeMode] = useState(false);
  const audioPathRef = useRef<string | null>(null);
  const nativeLogRef = useRef<string[]>([]);
  const logListenerRef = useRef<{ remove: () => void } | null>(null);
  const accumulatedTextRef = useRef<string>('');

  // Carrega flag de realtime ao montar
  useEffect(() => {
    getRealtimeSttEnabled().then(setRealtimeMode);
  }, []);

  const handlePress = useCallback(async () => {
    if (disabled) return;

    // ===== MODO REALTIME =====
    if (realtimeMode) {
      if (recordState === 'idle') {
        // Iniciar realtime
        const hasPermission = await requestRecordAudioPermission();
        if (!hasPermission) {
          Alert.alert('Permissão negada', 'Microfone necessário para voz.');
          return;
        }

        accumulatedTextRef.current = '';
        setRecordState('recording');

        try {
          await startRealtimeTranscription({
            language: 'pt',
            useVad: true,
            realtimeAudioSec: 3,
            onPartial: (text) => {
              // Texto parcial → atualiza input em tempo real
              const combined = accumulatedTextRef.current + text;
              onPartialTranscription?.(combined);
            },
            onSegment: (text) => {
              // Segmento final → acumula
              accumulatedTextRef.current += text + ' ';
              onPartialTranscription?.(accumulatedTextRef.current.trim());
            },
          });
        } catch (err) {
          console.error('[VoiceButton] Realtime error:', err);
          Alert.alert(
            'STT Realtime',
            err instanceof Error ? err.message : 'Falha ao iniciar transcrição em tempo real.',
          );
          setRecordState('idle');
        }
      } else if (recordState === 'recording') {
        // Parar realtime
        setRecordState('transcribing');
        try {
          await stopRealtimeTranscription();
          const finalText = accumulatedTextRef.current.trim();
          if (finalText.length > 0) {
            onTranscription(finalText);
          }
        } catch (err) {
          console.error('[VoiceButton] Realtime stop error:', err);
        }
        setRecordState('idle');
      }
      return;
    }

    // ===== MODO FILE (atual) =====
    if (recordState === 'idle') {
      const hasPermission = await requestRecordAudioPermission();
      if (!hasPermission) {
        console.log('[VoiceButton] Permissão negada');
        Alert.alert('Permission Denied', 'Microphone permission is required for voice input.');
        return;
      }

      try {
        const path = `${RNFS.DocumentDirectoryPath}/voice_record.wav`;
        const exists = await RNFS.exists(path);
        if (exists) await RNFS.unlink(path);

        audioPathRef.current = path;
        await PcmRecorder.startRecording(path);

        setRecordState('recording');
      } catch (err) {
        console.error('[VoiceButton] Recording error:', err);
        setRecordState('error');
      }
    } else if (recordState === 'recording') {
      setRecordState('transcribing');
      nativeLogRef.current = [];

      try {
        if (logListenerRef.current) {
          logListenerRef.current.remove();
        }
        logListenerRef.current = addNativeLogListener((level, text) => {
          nativeLogRef.current.push(`[${level}] ${text}`);
        });
        await toggleNativeLog(true);
      } catch (e) {
        console.log('[VoiceButton] toggleNativeLog falhou:', e);
      }

      try {
        await PcmRecorder.stopRecording();

        const audioPath = audioPathRef.current;
        if (!audioPath) throw new Error('No audio file recorded');

        const exists = await RNFS.exists(audioPath);
        if (!exists) throw new Error('Audio file not found after recording');

        const stat = await RNFS.stat(audioPath);
        if (stat.size < 44) throw new Error(`Audio file too small (${stat.size} bytes)`);

        if (!isWhisperLoaded()) {
          const downloadedId = await findAnyDownloadedWhisperModel();
          if (!downloadedId) {
            Alert.alert(
              'Modelo STT não encontrado',
              'Baixe um modelo Whisper na tela de Downloads primeiro.',
            );
            setRecordState('idle');
            return;
          }
          console.log('[VoiceButton] Carregando modelo whisper:', downloadedId);
          await loadWhisperModel(downloadedId);
          console.log('[VoiceButton] Modelo carregado');
        }

        console.log(`[VoiceButton] Transcrevendo: ${audioPath} (${stat.size} bytes)`);

        const { promise } = await transcribeFile(audioPath, {
          language: 'pt',
          splitOnWord: true,
          onNewSegments: (result) => {
            console.log('[VoiceButton] Segment:', result.result);
          },
        });

        const result = await promise;
        const text = result.result?.trim();

        console.log(
          `[VoiceButton] Resultado: "${text || '(vazio)'}" | segments: ${result.segments?.length || 0} | processTime: ${result.processTime}ms`
        );

        if (text && text.length > 0) {
          onTranscription(text);
        }

        setRecordState('idle');
        audioPathRef.current = null;
        RNFS.unlink(audioPath).catch(() => {});

        try {
          await toggleNativeLog(false);
          if (logListenerRef.current) {
            logListenerRef.current.remove();
            logListenerRef.current = null;
          }
        } catch {}
      } catch (err) {
        const errStr = err instanceof Error ? err.message : String(err);
        const nativeLog = nativeLogRef.current.length > 0
          ? `\n\n--- whisper.cpp native log ---\n${nativeLogRef.current.join('\n')}`
          : '';

        console.error('[VoiceButton] ERRO transcrição:', errStr, nativeLog);
        setRecordState('error');
        Alert.alert(
          'Transcription Error',
          err instanceof Error ? err.message : 'Failed to transcribe audio.',
        );
        setRecordState('idle');

        try {
          await toggleNativeLog(false);
          if (logListenerRef.current) {
            logListenerRef.current.remove();
            logListenerRef.current = null;
          }
        } catch {}
      }
    }
  }, [disabled, recordState, onTranscription, onPartialTranscription, realtimeMode]);

  const getButtonStyle = () => {
    switch (recordState) {
      case 'recording': return [styles.btn, styles.recording];
      case 'transcribing': return [styles.btn, styles.transcribing];
      case 'error': return [styles.btn, styles.errorStyle];
      default: return styles.btn;
    }
  };

  const getButtonIcon = () => {
    if (recordState === 'transcribing') return null; // ActivityIndicator rendered
    if (realtimeMode && recordState === 'recording') return '⏹';
    return '🎤';
  };

  return (
    <TouchableOpacity
      style={getButtonStyle()}
      onPress={handlePress}
      disabled={disabled || recordState === 'transcribing'}
      activeOpacity={0.7}
    >
      {recordState === 'transcribing' ? (
        <ActivityIndicator size="small" color="#00E5FF" />
      ) : (
        <Text style={styles.btnText}>{getButtonIcon()}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1a1a2e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recording: {
    backgroundColor: '#ff4444',
  },
  transcribing: {
    backgroundColor: '#1a1a2e',
  },
  errorStyle: {
    backgroundColor: '#2a1a1a',
  },
  btnText: {
    fontSize: 20,
  },
});
