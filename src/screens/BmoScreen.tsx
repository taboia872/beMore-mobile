/**
 * BmoScreen — tela do rostinho do BMO
 * Sem chat, sem input bar. Só face + voz (botão PTT).
 * Botão de settings (engrenagem discreta) no canto.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  StyleSheet, View, Text, TouchableOpacity, ActivityIndicator,
  Dimensions, Animated,
} from 'react-native';
import VoiceButton from '../components/VoiceButton';
import {
  chatCompletion, stopCompletion, isModelLoaded, getActiveModelName,
} from '../services/LlamaService';
import {
  speak as ttsSpeak, stopSpeaking as ttsStop, isTtsInitialized,
} from '../services/TtsService';
import { loadSettings } from '../data/appSettings';
import type { ChatMessage } from '../types';

interface BmoScreenProps {
  onOpenSettings: () => void;
}

type BmoState = 'idle' | 'listening' | 'thinking' | 'speaking';

let msgCounter = 0;
function makeId(): string {
  msgCounter += 1;
  return `bmo_${Date.now()}_${msgCounter}`;
}

export default function BmoScreen({ onOpenSettings }: BmoScreenProps) {
  const [bmoState, setBmoState] = useState<BmoState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [modelReady, setModelReady] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState('');
  const stopSignalRef = useRef<{ cancelled: boolean }>({ cancelled: false });
  const [conversation, setConversation] = useState<ChatMessage[]>([]);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Carrega system prompt + verifica modelo
  useEffect(() => {
    (async () => {
      const settings = await loadSettings();
      setSystemPrompt(settings.systemPrompt);
      setModelReady(isModelLoaded());
    })();
  }, []);

  // Animação de pulso quando processando ou falando
  useEffect(() => {
    if (bmoState === 'thinking' || bmoState === 'speaking') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.15, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ]),
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [bmoState, pulseAnim]);

  const handleVoiceTranscription = useCallback(async (text: string) => {
    // Ignora debug do STT
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

    setConversation((prev) => [...prev, userMsg, assistantMsg]);
    stopSignalRef.current = { cancelled: false };

    const conversationMessages: ChatMessage[] = [
      { id: 'sys', role: 'system', content: systemPrompt, timestamp: 0 },
      ...conversation.filter((m) => !m.isError && m.role !== 'system'),
      userMsg,
    ];

    try {
      let finalText = '';
      await chatCompletion(
        conversationMessages,
        (_token, accumulated) => {
          setConversation((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.role === 'assistant' && last.isStreaming) {
              updated[updated.length - 1] = { ...last, content: accumulated };
            }
            return updated;
          });
          finalText = accumulated;
        },
        stopSignalRef.current,
      );

      // Finaliza mensagem
      setConversation((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.role === 'assistant') {
          updated[updated.length - 1] = { ...last, isStreaming: false };
          finalText = last.content;
        }
        return updated;
      });

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
      setConversation((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.role === 'assistant') {
          updated[updated.length - 1] = {
            ...last,
            content: `Erro: ${errMsg}`,
            isStreaming: false,
            isError: true,
          };
        }
        return updated;
      });
      setBmoState('idle');
    }
  }, [systemPrompt, conversation]);

  const handleStop = useCallback(async () => {
    stopSignalRef.current.cancelled = true;
    await stopCompletion();
    await ttsStop();
    setBmoState('idle');
  }, []);

  // Cor dos olhos baseado no estado
  const eyeColor = () => {
    switch (bmoState) {
      case 'listening': return '#00FF66';
      case 'thinking': return '#FFD700';
      case 'speaking': return '#00E5FF';
      default: return '#00E5FF';
    }
  };

  // Texto de status
  const statusText = () => {
    switch (bmoState) {
      case 'listening': return 'Ouvindo...';
      case 'thinking': return 'Pensando...';
      case 'speaking': return 'Falando...';
      default: return '';
    }
  };

  const pulseScale = bmoState === 'thinking' || bmoState === 'speaking'
    ? pulseAnim
    : new Animated.Value(1);

  return (
    <View style={styles.container}>
      {/* Settings button — discreto, canto sup esquerdo */}
      <TouchableOpacity style={styles.settingsBtn} onPress={onOpenSettings}>
        <Text style={styles.settingsIcon}>⚙️</Text>
      </TouchableOpacity>

      {/* BMO Face — centralizado */}
      <View style={styles.faceContainer}>
        <Animated.View style={[styles.face, { transform: [{ scale: pulseScale }] }]}>
          {/* Olhos */}
          <View style={styles.eyesRow}>
            <View style={[styles.eye, { backgroundColor: eyeColor() }]} />
            <View style={[styles.eye, { backgroundColor: eyeColor() }]} />
          </View>
          {/* Boca — muda com o estado */}
          <View style={styles.mouthContainer}>
            {bmoState === 'speaking' ? (
              <View style={styles.mouthSpeaking}>
                <View style={styles.mouthBar} />
                <View style={[styles.mouthBar, { height: 16 }]} />
                <View style={styles.mouthBar} />
              </View>
            ) : bmoState === 'listening' ? (
              <View style={styles.mouthListening} />
            ) : bmoState === 'thinking' ? (
              <View style={styles.mouthThinking} />
            ) : (
              <View style={styles.mouthIdle} />
            )}
          </View>
        </Animated.View>

        {/* Status text */}
        <Text style={styles.statusText}>{statusText()}</Text>

        {/* Error */}
        {error && (
          <Text style={styles.errorText}>❌ {error}</Text>
        )}

        {!modelReady && (
          <Text style={styles.warningText}>⚠️ Modelo não carregado</Text>
        )}
      </View>

      {/* Voice Button — PTT, basal visível */}
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

const { width } = Dimensions.get('window');
const FACE_SIZE = Math.min(width * 0.6, 240);
const EYE_SIZE = FACE_SIZE * 0.22;

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
    height: FACE_SIZE,
    borderRadius: 24,
    backgroundColor: '#0d0d14',
    borderWidth: 2,
    borderColor: '#00E5FF33',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  eyesRow: {
    flexDirection: 'row',
    gap: EYE_SIZE * 0.5,
    marginBottom: 30,
  },
  eye: {
    width: EYE_SIZE,
    height: EYE_SIZE,
    borderRadius: EYE_SIZE / 2,
  },
  mouthContainer: {
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mouthIdle: {
    width: 60,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#00E5FF55',
  },
  mouthListening: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 3,
    borderColor: '#00FF66',
    backgroundColor: '#00FF6611',
  },
  mouthThinking: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#FFD70044',
    justifyContent: 'center',
    alignItems: 'center',
    borderTopWidth: 6,
    borderTopColor: '#FFD700',
  },
  mouthSpeaking: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  mouthBar: {
    width: 5,
    height: 24,
    borderRadius: 3,
    backgroundColor: '#00E5FF',
  },
  statusText: {
    marginTop: 24,
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
