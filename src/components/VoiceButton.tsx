/**
 * VoiceButton — Botão de microfone para STT
 * Tap → grava PCM/WAV → tap novamente → transcreve
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  Text,
  ActivityIndicator,
  Alert,
  NativeModules,
} from 'react-native';
import RNFS from 'react-native-fs';
import {
  loadWhisperModel,
  transcribeFile,
  isWhisperLoaded,
  findAnyDownloadedWhisperModel,
  requestRecordAudioPermission,
} from '../services/WhisperService';
import { toggleNativeLog, addNativeLogListener } from 'whisper.rn';

const { PcmRecorder } = NativeModules;

type RecordState = 'idle' | 'recording' | 'transcribing' | 'error';

interface VoiceButtonProps {
  onTranscription: (text: string) => void;
  disabled?: boolean;
}

export default function VoiceButton({
  onTranscription,
  disabled,
}: VoiceButtonProps) {
  const [recordState, setRecordState] = useState<RecordState>('idle');
  const audioPathRef = useRef<string | null>(null);
  const nativeLogRef = useRef<string[]>([]);
  const logListenerRef = useRef<{ remove: () => void } | null>(null);

  const handlePress = useCallback(async () => {
    if (disabled) return;

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
  }, [disabled, recordState, onTranscription]);

  if (recordState === 'transcribing') {
    return (
      <TouchableOpacity style={styles.button} disabled>
        <ActivityIndicator size="small" color="#00E5FF" />
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[
        styles.button,
        recordState === 'recording' && styles.recording,
        disabled && styles.disabled,
      ]}
      onPress={handlePress}
      disabled={disabled || recordState === 'transcribing'}
    >
      <Text style={styles.icon}>
        {recordState === 'recording' ? '⏹' : '🎤'}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#111118',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1e1e2e',
  },
  recording: {
    backgroundColor: '#3a1111',
    borderColor: '#ff4444',
  },
  disabled: {
    opacity: 0.3,
  },
  icon: {
    fontSize: 20,
  },
});
