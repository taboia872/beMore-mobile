/**
 * VoiceButton — Botão de microfone para STT
 * Fluxo: tap → pede permissão → grava áuto (WAV) → transcreve → callback com texto
 * Usa react-native-audio-recorder-player para gravação + whisper.rn para transcrição
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  Text,
  ActivityIndicator,
  Alert,
  View,
} from 'react-native';
import AudioRecorderPlayer from 'react-native-audio-recorder-player';
import RNFS from 'react-native-fs';
import {
  loadWhisperModel,
  unloadWhisperModel,
  transcribeFile,
  isWhisperLoaded,
  isWhisperModelDownloaded,
  requestRecordAudioPermission,
} from '../services/WhisperService';
import { WHISPER_MODELS } from '../data/whisperModels';

type RecordState = 'idle' | 'recording' | 'transcribing' | 'error';

interface VoiceButtonProps {
  onTranscription: (text: string) => void;
  disabled?: boolean;
  whisperModelId?: string;
}

const DEFAULT_WHISPER_MODEL = 'whisper-tiny';

export default function VoiceButton({
  onTranscription,
  disabled,
  whisperModelId = DEFAULT_WHISPER_MODEL,
}: VoiceButtonProps) {
  const [recordState, setRecordState] = useState<RecordState>('idle');
  const recorderRef = useRef<AudioRecorderPlayer | null>(null);
  const audioPathRef = useRef<string | null>(null);

  const handlePress = useCallback(async () => {
    if (disabled) return;

    if (recordState === 'idle') {
      // ===== Iniciar gravação =====
      const hasPermission = await requestRecordAudioPermission();
      if (!hasPermission) {
        Alert.alert('Permission Denied', 'Microphone permission is required for voice input.');
        return;
      }

      try {
        if (!recorderRef.current) {
          recorderRef.current = new AudioRecorderPlayer();
        }
        const recorder = recorderRef.current;

        // Caminho do arquivo de áudio temporário
        const path = `${RNFS.DocumentDirectoryPath}/voice_record.wav`;

        // Remove arquivo anterior se existir
        const exists = await RNFS.exists(path);
        if (exists) await RNFS.unlink(path);

        audioPathRef.current = path;

        // Iniciar gravação em WAV
        await recorder.startRecorder(path);
        setRecordState('recording');
      } catch (err) {
        console.error('Recording error:', err);
        setRecordState('error');
        Alert.alert('Recording Error', err instanceof Error ? err.message : 'Failed to start recording.');
      }
    } else if (recordState === 'recording') {
      // ===== Parar gravação e transcrever =====
      setRecordState('transcribing');

      try {
        const recorder = recorderRef.current;
        if (!recorder) throw new Error('Recorder not initialized');

        // Parar gravação
        await recorder.stopRecorder();
        const audioPath = audioPathRef.current;
        if (!audioPath) throw new Error('No audio file recorded');

        // Verificar que o arquivo existe
        const exists = await RNFS.exists(audioPath);
        if (!exists) throw new Error('Audio file not found after recording');

        // Garantir que o modelo whisper está carregado
        if (!isWhisperLoaded()) {
          const downloaded = await isWhisperModelDownloaded(whisperModelId);
          if (!downloaded) {
            Alert.alert(
              'Whisper Model Not Found',
              'Please download a Whisper model from the Download screen first.',
            );
            setRecordState('idle');
            return;
          }
          await loadWhisperModel(whisperModelId);
        }

        // Transcrever o arquivo de áudio
        const { promise } = await transcribeFile(audioPath, {
          language: 'en',
          splitOnWord: true,
          onNewSegments: (result) => {
            // Feedback parcial — pode ser usado para mostrar texto em tempo real
            console.log('Whisper segment:', result.result);
          },
        });

        const result = await promise;
        const text = result.result?.trim();
        if (text) {
          onTranscription(text);
        }

        setRecordState('idle');
        audioPathRef.current = null;

        // Limpar arquivo temporário
        RNFS.unlink(audioPath).catch(() => {});
      } catch (err) {
        console.error('Transcription error:', err);
        setRecordState('error');
        Alert.alert(
          'Transcription Error',
          err instanceof Error ? err.message : 'Failed to transcribe audio.',
        );
        setRecordState('idle');
      }
    }
  }, [disabled, recordState, onTranscription, whisperModelId]);

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
        <Text style={styles.btnText}>
          {recordState === 'recording' ? '⏹' : '🎙'}
        </Text>
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
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  recording: {
    backgroundColor: '#2a1a1a',
    borderColor: '#FF6B6B',
  },
  transcribing: {
    backgroundColor: '#1a1a2e',
    borderColor: '#00E5FF',
  },
  errorStyle: {
    backgroundColor: '#2a1a1a',
    borderColor: '#ff5555',
  },
  btnText: {
    fontSize: 18,
    color: '#999',
  },
});
