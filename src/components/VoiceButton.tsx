/**
 * VoiceButton — Botão de microfone para STT
 * Fluxo: tap → pede permissão → grava áudio (m4a/AAC no Android) → transcreve → callback com texto
 * Usa react-native-audio-recorder-player para gravação + whisper.rn para transcrição
 *
 * Em caso de erro, o log completo é enviado via onTranscription para aparecer no chat.
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
import { toggleNativeLog, addNativeLogListener } from 'whisper.rn';

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
  const nativeLogRef = useRef<string[]>([]);
  const logListenerRef = useRef<{ remove: () => void } | null>(null);

  const sendLog = useCallback((msg: string) => {
    console.log('[VoiceButton]', msg);
    onTranscription(`[STT DEBUG] ${msg}`);
  }, [onTranscription]);

  const handlePress = useCallback(async () => {
    if (disabled) return;

    if (recordState === 'idle') {
      // ===== Iniciar gravação =====
      const hasPermission = await requestRecordAudioPermission();
      if (!hasPermission) {
        sendLog('Permissão de microfone negada');
        Alert.alert('Permission Denied', 'Microphone permission is required for voice input.');
        return;
      }

      try {
        if (!recorderRef.current) {
          recorderRef.current = new AudioRecorderPlayer();
        }
        const recorder = recorderRef.current;

        const path = `${RNFS.DocumentDirectoryPath}/voice_record.m4a`;

        const exists = await RNFS.exists(path);
        if (exists) await RNFS.unlink(path);

        audioPathRef.current = path;

        await recorder.startRecorder(path, {
          AVSampleRateKey: 16000,
          AVNumberOfChannelsKey: 1,
          AVFormatIDKeyIOS: 'lpcm',
          AVModeIDKeyIOS: 'spokenaudio',
          AVLinearPCMBitDepthKeyIOS: 16,
          AvenueAudioFormat: 'lpcm',
          AVAudioFileTypeKeyIOS: ' wav',
        } as any);

        setRecordState('recording');
        sendLog(`Gravação iniciada → ${path}`);
      } catch (err) {
        console.error('Recording error:', err);
        setRecordState('error');
        sendLog(`ERRO gravação: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else if (recordState === 'recording') {
      // ===== Parar gravação e transcrever =====
      setRecordState('transcribing');
      nativeLogRef.current = [];

      // Ativar log nativo do whisper.cpp
      try {
        if (logListenerRef.current) {
          logListenerRef.current.remove();
        }
        logListenerRef.current = addNativeLogListener((level, text) => {
          nativeLogRef.current.push(`[${level}] ${text}`);
        });
        await toggleNativeLog(true);
      } catch (e) {
        sendLog(`toggleNativeLog falhou: ${e}`);
      }

      try {
        const recorder = recorderRef.current;
        if (!recorder) throw new Error('Recorder not initialized');

        // Parar gravação
        await recorder.stopRecorder();

        const audioPath = audioPathRef.current;
        if (!audioPath) throw new Error('No audio file recorded');

        // Verificar arquivo
        const exists = await RNFS.exists(audioPath);
        if (!exists) throw new Error('Audio file not found after recording');

        const stat = await RNFS.stat(audioPath);
        if (stat.size < 44) throw new Error(`Audio file too small (${stat.size} bytes)`);

        // Carregar modelo whisper
        if (!isWhisperLoaded()) {
          const downloaded = await isWhisperModelDownloaded(whisperModelId);
          if (!downloaded) {
            sendLog(`Modelo whisper não baixado: ${whisperModelId}`);
            Alert.alert('Whisper Model Not Found', 'Please download a Whisper model from the Download screen first.');
            setRecordState('idle');
            return;
          }
          sendLog(`Carregando modelo whisper: ${whisperModelId}...`);
          await loadWhisperModel(whisperModelId);
          sendLog('Modelo whisper carregado');
        }

        // Transcrever
        sendLog(`Transcrevendo: ${audioPath} (${stat.size} bytes)`);

        const { promise } = await transcribeFile(audioPath, {
          language: 'auto',
          splitOnWord: true,
          onNewSegments: (result) => {
            console.log('Whisper segment:', result.result);
          },
        });

        const result = await promise;
        const text = result.result?.trim();

        // Log detalhado do resultado
        sendLog(
          `Resultado: "${text || '(vazio)'}" | segments: ${result.segments?.length || 0} | aborted: ${result.isAborted} | processTime: ${result.processTime}ms`
        );

        if (text && text.length > 0) {
          onTranscription(text);
        }

        setRecordState('idle');
        audioPathRef.current = null;

        RNFS.unlink(audioPath).catch(() => {});

        // Desativar log nativo
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

        sendLog(`ERRO transcrição: ${errStr}${nativeLog}`);

        console.error('Transcription error:', err);
        setRecordState('error');
        Alert.alert(
          'Transcription Error',
          err instanceof Error ? err.message : 'Failed to transcribe audio.',
        );
        setRecordState('idle');

        // Desativar log nativo
        try {
          await toggleNativeLog(false);
          if (logListenerRef.current) {
            logListenerRef.current.remove();
            logListenerRef.current = null;
          }
        } catch {}
      }
    }
  }, [disabled, recordState, onTranscription, whisperModelId, sendLog]);

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
    borderColor: '#FF6B6B',
  },
  btnText: {
    fontSize: 18,
  },
});
