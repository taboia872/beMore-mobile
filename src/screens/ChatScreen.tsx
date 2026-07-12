import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  StyleSheet, View, Text, TextInput, TouchableOpacity,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import type { ChatMessage, ModelInfo, LlamaStatus } from '../types';
import {
  loadModel, unloadModel, chatCompletion, stopCompletion,
  getActiveModelId, getActiveModelName, isModelLoaded,
} from '../services/LlamaService';
import ChatBubble from '../components/ChatBubble';
import ModelSelector from '../components/ModelSelector';
import VoiceButton from '../components/VoiceButton';
import {
  isTtsInitialized as ttsIsReady,
  getActiveVoiceId,
  initializeTts,
  speak as ttsSpeak,
  stopSpeaking as ttsStop,
  deinitializeTts,
  isVoiceDownloaded,
  TTS_VOICES,
} from '../services/TtsService';

interface ChatScreenProps {
  onBack: () => void;
}

const SYSTEM_PROMPT = 'You are BMO, a helpful AI assistant running fully on-device. Be concise and friendly. Respond in the same language as the user.';

let msgCounter = 0;
function makeId(): string {
  msgCounter += 1;
  return `msg_${Date.now()}_${msgCounter}`;
}

export default function ChatScreen({ onBack }: ChatScreenProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<LlamaStatus>('idle');
  const [modelSelectorVisible, setModelSelectorVisible] = useState(false);
  const [activeModelName, setActiveModelName] = useState<string | null>(null);
  const [loadProgress, setLoadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const stopSignalRef = useRef<{ cancelled: boolean }>({ cancelled: false });
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [ttsLoading, setTtsLoading] = useState(false);
  const [ttsStatus, setTtsStatus] = useState<string | null>(null);

  // Restaura estado do modelo se já estiver carregado na memória
  useEffect(() => {
    if (isModelLoaded()) {
      const name = getActiveModelName();
      if (name) {
        setActiveModelName(name);
        setStatus('ready');
      }
    }
    // Verifica se TTS já está inicializado (pode ter sobrevivido a reload)
    if (ttsIsReady()) {
      const vid = getActiveVoiceId();
      if (vid) {
        setTtsEnabled(true);
      }
    }
  }, []);

  // Toggle TTS
  const handleToggleTts = useCallback(async () => {
    if (ttsEnabled) {
      // Desativar
      await deinitializeTts();
      setTtsEnabled(false);
      return;
    }

    // Ativar — precisa de uma voz baixada
    setTtsLoading(true);
    setTtsStatus(null);
    try {
      // Procura primeira voz já baixada
      let voiceId: string | null = null;
      for (const v of TTS_VOICES) {
        if (await isVoiceDownloaded(v.id)) {
          voiceId = v.id;
          break;
        }
      }

      if (!voiceId) {
        setTtsStatus('Baixe uma voz na tela de Downloads primeiro');
        setTtsLoading(false);
        return;
      }

      setTtsStatus('Carregando voz...');
      console.log('[ChatScreen] TTS toggle: voiceId =', voiceId);
      await initializeTts(voiceId);
      console.log('[ChatScreen] TTS: initializeTts resolved');
      setTtsEnabled(true);
      setTtsStatus(null);
    } catch (err) {
      console.error('[ChatScreen] TTS toggle error:', err);
      setTtsStatus(err instanceof Error ? err.message : String(err));
    }
    setTtsLoading(false);
  }, [ttsEnabled]);


  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 50);
  }, []);

  const handleSelectModel = useCallback(async (model: ModelInfo) => {
    setModelSelectorVisible(false);
    setError(null);
    setStatus('loading');
    setLoadProgress(0);

    try {
      const prevId = getActiveModelId();
      if (prevId && prevId !== model.id) {
        const sysMsg: ChatMessage = {
          id: makeId(),
          role: 'system',
          content: `Unloading model... loading ${model.name}`,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, sysMsg]);
      }

      await loadModel(model.id, (progress) => {
        setLoadProgress(progress);
      });

      setActiveModelName(model.name);
      setStatus('ready');

      const greeting: ChatMessage = {
        id: makeId(),
        role: 'assistant',
        content: `Hi! I'm BMO running on ${model.name} (${model.size}). Fully offline. Ask me anything!`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, greeting]);
      scrollToBottom();
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [scrollToBottom]);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || status !== 'ready') return;

    const userMsg: ChatMessage = {
      id: makeId(),
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
    };

    const assistantMsg: ChatMessage = {
      id: makeId(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput('');
    setStatus('generating');
    stopSignalRef.current = { cancelled: false };

    const conversationMessages: ChatMessage[] = [
      { id: 'sys', role: 'system', content: SYSTEM_PROMPT, timestamp: 0 },
      ...messages.filter((m) => !m.isError && m.role !== 'system'),
      userMsg,
    ];

    try {
      await chatCompletion(
        conversationMessages,
        (_token, accumulated) => {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.role === 'assistant' && last.isStreaming) {
              updated[updated.length - 1] = {
                ...last,
                content: accumulated,
              };
            }
            return updated;
          });
          scrollToBottom();
        },
        stopSignalRef.current,
      );

      let finalText = '';
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.role === 'assistant') {
          updated[updated.length - 1] = {
            ...last,
            isStreaming: false,
          };
          finalText = last.content;
        }
        return updated;
      });

      // TTS: fala a resposta se ativado
      if (ttsEnabled && finalText) {
        try {
          await ttsSpeak(finalText);
        } catch (ttsErr) {
          // TTS falhou silenciosamente — não bloqueia o chat
          console.warn('TTS speak failed:', ttsErr);
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.role === 'assistant') {
          updated[updated.length - 1] = {
            ...last,
            content: `Error: ${errMsg}`,
            isStreaming: false,
            isError: true,
          };
        }
        return updated;
      });
    }

    setStatus('ready');
  }, [input, status, messages, scrollToBottom]);

  const handleStop = useCallback(async () => {
    stopSignalRef.current.cancelled = true;
    await stopCompletion();
    setStatus('ready');
    setMessages((prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last && last.role === 'assistant' && last.isStreaming) {
        updated[updated.length - 1] = {
          ...last,
          isStreaming: false,
          content: last.content + ' [stopped]',
        };
      }
      return updated;
    });
  }, []);

  const handleUnload = useCallback(async () => {
    await unloadModel();
    setActiveModelName(null);
    setStatus('idle');
    setMessages([]);
    onBack();
  }, [onBack]);

  const handleVoiceTranscription = useCallback((text: string) => {
    if (text.startsWith('[STT DEBUG]')) {
      const debugMsg: ChatMessage = {
        id: makeId(),
        role: 'assistant',
        content: text,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, debugMsg]);
      scrollToBottom();
      return;
    }
    setInput(text);
  }, [scrollToBottom]);

  const canSend = status === 'ready' && input.trim().length > 0;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'android' ? undefined : 'padding'}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleUnload}>
          <Text style={styles.backBtn}>←</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.modelBadge}
          onPress={() => setModelSelectorVisible(true)}
        >
          <Text style={styles.modelBadgeText}>
            {activeModelName ? `${activeModelName}` : 'Select Model'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.ttsBtn, ttsEnabled && styles.ttsBtnActive]}
          onPress={handleToggleTts}
          disabled={ttsLoading}
        >
          <Text style={styles.ttsBtnText}>
            {ttsLoading ? '⏳' : ttsEnabled ? '🔊' : '🔇'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Status / Loading */}
      {status === 'loading' && (
        <View style={styles.statusBar}>
          <ActivityIndicator size="small" color="#00E5FF" />
          <Text style={styles.statusText}>
            Loading model... {loadProgress > 0 ? `${Math.round(loadProgress * 100)}%` : ''}
          </Text>
        </View>
      )}
      {error && (
        <View style={styles.errorBar}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
      {ttsStatus && (
        <View style={styles.ttsStatusBar}>
          <Text style={styles.ttsStatusText}>{ttsStatus}</Text>
        </View>
      )}

      {/* Chat Messages */}
      <ScrollView
        ref={scrollRef}
        style={styles.chatArea}
        contentContainerStyle={styles.chatContent}
      >
        {messages.length === 0 && status === 'idle' && (
          <View style={styles.welcome}>
            <Text style={styles.welcomeTitle}>BMO</Text>
            <Text style={styles.welcomeSub}>Be More Agent — On-Device AI</Text>
            <Text style={styles.welcomeHint}>
              Select a model to start chatting.{'\n'}All inference runs locally on your device.
            </Text>
            <TouchableOpacity
              style={styles.selectBtn}
              onPress={() => setModelSelectorVisible(true)}
            >
              <Text style={styles.selectBtnText}>Select Model</Text>
            </TouchableOpacity>
          </View>
        )}
        {messages.map((msg) => (
          <ChatBubble key={msg.id} message={msg} />
        ))}
      </ScrollView>

      {/* Input Bar */}
      <View style={styles.inputBar}>
        <VoiceButton
          onTranscription={handleVoiceTranscription}
          disabled={status !== 'ready'}
        />
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder={status === 'ready' ? 'Message BMO...' : 'Select a model first'}
          placeholderTextColor="#444"
          multiline
          maxLength={2000}
          editable={status === 'ready'}
        />
        {status === 'generating' ? (
          <TouchableOpacity style={styles.stopBtn} onPress={handleStop}>
            <Text style={styles.stopBtnText}>■</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
            disabled={!canSend}
            onPress={handleSend}
          >
            <Text style={styles.sendBtnText}>➤</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Model Selector Modal */}
      <ModelSelector
        visible={modelSelectorVisible}
        onSelect={handleSelectModel}
        onClose={() => setModelSelectorVisible(false)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#08080c',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a2e',
    gap: 12,
  },
  backBtn: {
    fontSize: 22,
    color: '#666',
  },
  modelBadge: {
    flex: 1,
    backgroundColor: '#111118',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#1a1a2e',
  },
  modelBadgeText: {
    fontSize: 13,
    color: '#00E5FF',
    fontFamily: 'monospace',
    fontWeight: 'bold',
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 8,
    backgroundColor: '#0d0d14',
  },
  statusText: {
    fontSize: 13,
    color: '#555',
    fontFamily: 'monospace',
  },
  errorBar: {
    padding: 8,
    backgroundColor: '#1a1010',
  },
  errorText: {
    color: '#ff5555',
    fontSize: 12,
  },
  chatArea: {
    flex: 1,
  },
  chatContent: {
    paddingVertical: 8,
    flexGrow: 1,
  },
  welcome: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
  },
  welcomeTitle: {
    fontSize: 42,
    fontWeight: 'bold',
    color: '#00E5FF',
    fontFamily: 'monospace',
  },
  welcomeSub: {
    fontSize: 14,
    color: '#444',
    marginTop: 4,
    fontFamily: 'monospace',
  },
  welcomeHint: {
    fontSize: 12,
    color: '#333',
    marginTop: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  selectBtn: {
    marginTop: 20,
    backgroundColor: '#00E5FF',
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  selectBtnText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 14,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#1a1a2e',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#111118',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#E0E0E0',
    fontSize: 15,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: '#1a1a2e',
  },
  sendBtn: {
    backgroundColor: '#00E5FF',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: '#1a1a2e',
  },
  sendBtnText: {
    color: '#000',
    fontSize: 18,
    fontWeight: 'bold',
  },
  stopBtn: {
    backgroundColor: '#2a1a1a',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopBtnText: {
    color: '#FF6B6B',
    fontSize: 14,
  },
  ttsBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#111118',
    borderWidth: 1,
    borderColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ttsBtnActive: {
    backgroundColor: '#00E5FF',
    borderColor: '#00E5FF',
  },
  ttsBtnText: {
    fontSize: 18,
  },
  ttsStatusBar: {
    padding: 6,
    backgroundColor: '#0d0d14',
    alignItems: 'center',
  },
  ttsStatusText: {
    fontSize: 12,
    color: '#888',
    fontFamily: 'monospace',
  },
});
