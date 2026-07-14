/**
 * BmoScreen — tela do rostinho do BMO com imagens reais
 * Sem chat, sem input bar. Só face + voz (botão PTT).
 * Imagens em res/drawable/ (android resource).
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  StyleSheet, View, Text, TouchableOpacity,
  Dimensions, Image,
} from 'react-native';
import VoiceButton from '../components/VoiceButton';
import {
  chatCompletion, stopCompletion, isModelLoaded,
} from '../services/LlamaService';
import {
  speak as ttsSpeak, stopSpeaking as ttsStop, isTtsInitialized,
} from '../services/TtsService';
import { loadSettings } from '../data/appSettings';
import type { ChatMessage } from '../types';

interface BmoScreenProps {
  onOpenSettings: () => void;
}

type BmoState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

let msgCounter = 0;
function makeId(): string {
  msgCounter += 1;
  return `bmo_${Date.now()}_${msgCounter}`;
}

// Mapeamento estado → imagem
const FACE_IMAGES: Record<BmoState, number> = {
  idle: require('../assets/bmo/bmo_idle.png'),
  listening: require('../assets/bmo/bmo_listen_01.png'),
  thinking: require('../assets/bmo/bmo_thinking_01.png'),
  speaking: require('../assets/bmo/bmo_speaking_01.png'),
  error: require('../assets/bmo/bmo_error.png'),
};

// Frames de animação para thinking e speaking
const THINKING_FRAMES = [
  require('../assets/bmo/bmo_thinking_01.png'),
  require('../assets/bmo/bmo_thinking_02.png'),
  require('../assets/bmo/bmo_thinking_03.png'),
  require('../assets/bmo/bmo_thinking_04.png'),
];

const SPEAKING_FRAMES = [
  require('../assets/bmo/bmo_speaking_01.png'),
  require('../assets/bmo/bmo_speaking_02.png'),
  require('../assets/bmo/bmo_speaking_03.png'),
];

const LISTEN_FRAMES = [
  require('../assets/bmo/bmo_listen_01.png'),
  require('../assets/bmo/bmo_listen_02.png'),
];

export default function BmoScreen({ onOpenSettings }: BmoScreenProps) {
  const [bmoState, setBmoState] = useState<BmoState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [modelReady, setModelReady] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [currentFrame, setCurrentFrame] = useState(0);
  const stopSignalRef = useRef<{ cancelled: boolean }>({ cancelled: false });
  const conversationRef = useRef<ChatMessage[]>([]);
  const frameTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Carrega system prompt + verifica modelo
  useEffect(() => {
    (async () => {
      const settings = await loadSettings();
      setSystemPrompt(settings.systemPrompt);
      setModelReady(isModelLoaded());
    })();
  }, []);

  // Animação de frames para thinking/speaking/listening
  useEffect(() => {
    if (frameTimerRef.current) {
      clearInterval(frameTimerRef.current);
      frameTimerRef.current = null;
    }

    if (bmoState === 'thinking') {
      frameTimerRef.current = setInterval(() => {
        setCurrentFrame((prev) => (prev + 1) % THINKING_FRAMES.length);
      }, 300);
    } else if (bmoState === 'speaking') {
      frameTimerRef.current = setInterval(() => {
        setCurrentFrame((prev) => (prev + 1) % SPEAKING_FRAMES.length);
      }, 200);
    } else if (bmoState === 'listening') {
      frameTimerRef.current = setInterval(() => {
        setCurrentFrame((prev) => (prev + 1) % LISTEN_FRAMES.length);
      }, 500);
    }

    return () => {
      if (frameTimerRef.current) {
        clearInterval(frameTimerRef.current);
        frameTimerRef.current = null;
      }
    };
  }, [bmoState]);

  const getCurrentFace = (): number => {
    switch (bmoState) {
      case 'thinking': return THINKING_FRAMES[currentFrame];
      case 'speaking': return SPEAKING_FRAMES[currentFrame];
      case 'listening': return LISTEN_FRAMES[currentFrame];
      case 'error': return FACE_IMAGES.error;
      default: return FACE_IMAGES.idle;
    }
  };

  const statusText = () => {
    switch (bmoState) {
      case 'listening': return 'Ouvindo...';
      case 'thinking': return 'Pensando...';
      case 'speaking': return 'Falando...';
      default: return '';
    }
  };

  const handleVoiceTranscription = useCallback(async (text: string) => {
    if (text.startsWith('[STT DEBUG]')) return;
    if (!text.trim()) return;

    setError(null);
    setBmoState('thinking');

    const userMsg: ChatMessage = {
      id: makeId(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    const assistantMsg: ChatMessage = {
      id: makeId(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    };

    conversationRef.current = [...conversationRef.current, userMsg, assistantMsg];
    stopSignalRef.current = { cancelled: false };

    const conversationMessages: ChatMessage[] = [
      { id: 'sys', role: 'system', content: systemPrompt, timestamp: 0 },
      ...conversationRef.current.filter((m) => !m.isError && m.role !== 'system'),
      userMsg,
    ];

    try {
      let finalText = '';
      await chatCompletion(
        conversationMessages,
        (_token, accumulated) => {
          finalText = accumulated;
        },
        stopSignalRef.current,
      );

      // Atualiza última mensagem
      const conv = [...conversationRef.current];
      const last = conv[conv.length - 1];
      if (last && last.role === 'assistant') {
        conv[conv.length - 1] = { ...last, content: finalText, isStreaming: false };
        conversationRef.current = conv;
      }

      // TTS — fala a resposta
      if (isTtsInitialized() && finalText) {
        setBmoState('speaking');
        try {
          await ttsSpeak(finalText);
        } catch (e) {
          console.warn('TTS speak failed:', e);
        }
      }

      setBmoState('idle');
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setError(errMsg);
      setBmoState('error');
      setTimeout(() => setBmoState('idle'), 3000);
    }
  }, [systemPrompt]);

  const handleStop = useCallback(async () => {
    stopSignalRef.current.cancelled = true;
    await stopCompletion();
    await ttsStop();
    setBmoState('idle');
  }, []);

  return (
    <View style={styles.container}>
      {/* Settings button — discreto */}
      <TouchableOpacity style={styles.settingsBtn} onPress={onOpenSettings}>
        <Text style={styles.settingsIcon}>⚙️</Text>
      </TouchableOpacity>

      {/* BMO Face */}
      <View style={styles.faceContainer}>
        <Image
          source={getCurrentFace()}
          style={styles.face}
          resizeMode="contain"
        />

        {/* Status text */}
        {statusText() !== '' && (
          <Text style={styles.statusText}>{statusText()}</Text>
        )}

        {/* Error */}
        {error && (
          <Text style={styles.errorText}>❌ {error}</Text>
        )}

        {!modelReady && (
          <Text style={styles.warningText}>⚠️ Modelo não carregado</Text>
        )}
      </View>

      {/* Voice Button — PTT */}
      <View style={styles.voiceContainer}>
        {bmoState === 'thinking' || bmoState === 'speaking' ? (
          <TouchableOpacity style={styles.stopBtn} onPress={handleStop}>
            <Text style={styles.stopBtnText}>■</Text>
          </TouchableOpacity>
        ) : (
          <VoiceButton
            onTranscription={handleVoiceTranscription}
            disabled={!modelReady || bmoState !== 'idle'}
          />
        )}
      </View>
    </View>
  );
}

const { width, height } = Dimensions.get('window');
const FACE_SIZE = Math.min(width * 0.85, height * 0.5);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#08080c',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 40,
  },
  settingsBtn: {
    position: 'absolute',
    top: 16,
    left: 16,
    padding: 8,
    zIndex: 10,
  },
  settingsIcon: {
    fontSize: 22,
    opacity: 0.4,
  },
  faceContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  face: {
    width: FACE_SIZE,
    height: FACE_SIZE * 0.6, // 800x480 = 5:3 aspect
    borderRadius: 16,
  },
  statusText: {
    marginTop: 16,
    fontSize: 14,
    color: '#666',
    fontFamily: 'monospace',
  },
  errorText: {
    marginTop: 8,
    fontSize: 12,
    color: '#ff5555',
    fontFamily: 'monospace',
    textAlign: 'center',
    maxWidth: 280,
  },
  warningText: {
    marginTop: 8,
    fontSize: 12,
    color: '#FFA500',
    fontFamily: 'monospace',
  },
  voiceContainer: {
    width: '100%',
    alignItems: 'center',
    paddingBottom: 20,
  },
  stopBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#ff5555',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#ff555533',
  },
  stopBtnText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
  },
});
