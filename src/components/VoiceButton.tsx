/**
 * VoiceButton — Botão de microfone para STT
 * Fluxo: tap → pede permissão → grava PCM/WAV → transcreve → callback com texto
 * Logs de debug vão apenas para console.log (não poluem o chat).
 */

import React, { useState, useCallback, useRef } from 'react';
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
  isWhisperModelDownloaded,
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
      // ===== Iniciar gravação =====
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
      // ===== Parar gravação e transcrever =====
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

        // Carregar modelo whisper (se necessário)
        if (!isWhisperLoaded()) {
          // Procura qualquer modelo Whisper baixado (não hardcodeia um específico)
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

  const getButtonStyle = () => {
    switch (recordState) {
      case 'recording': return [styles.btn, styles.recording];
      case 'transcribing': return [styles.btn, styles.transcribing];
      case 'error': return [styles.btn, styles.errorStyle];
      default: return styles.btn;
    }
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
        <Text style={styles.btnText}>🎤</Text>
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
