import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, View, Text, ScrollView, RefreshControl } from 'react-native';
import { MODELS } from '../data/models';
import { ModelInfo, DownloadStatus } from '../types';
import {
  downloadModel,
  cancelDownload,
  isModelDownloaded,
  getDownloadedSize,
  deleteModel,
} from '../services/DownloadManager';
import ModelCard from '../components/ModelCard';
import TtsCard from '../components/TtsCard';
import {
  TTS_VOICES,
  isVoiceDownloaded,
  downloadVoice,
  deleteVoice as deleteTtsVoice,
  initializeTts,
  isTtsInitialized,
  getActiveVoiceId,
  deinitializeTts,
  type TtsStatus,
} from '../services/TtsService';

interface ModelState {
  status: DownloadStatus;
  progress: number;
  speed: number;
  downloaded: boolean;
  downloadedSize: number;
}

interface TtsVoiceState {
  status: TtsStatus;
  progress: number;
  downloaded: boolean;
  active: boolean;
}

const INITIAL_STATE: ModelState = {
  status: 'idle',
  progress: 0,
  speed: 0,
  downloaded: false,
  downloadedSize: 0,
};

export default function DownloadScreen() {
  const [states, setStates] = useState<Record<string, ModelState>>({});
  const [ttsStates, setTtsStates] = useState<Record<string, TtsVoiceState>>({});
  const [refreshing, setRefreshing] = useState(false);

  const loadDownloadedFlags = useCallback(async () => {
    const flags: Record<string, ModelState> = {};
    for (const model of MODELS) {
      const dl = await isModelDownloaded(model.id);
      const size = dl ? await getDownloadedSize(model.id) : 0;
      flags[model.id] = {
        ...INITIAL_STATE,
        downloaded: dl,
        downloadedSize: size,
      };
    }
    setStates(flags);

    // Carrega vozes TTS
    const ttsFlags: Record<string, TtsVoiceState> = {};
    const activeVid = getActiveVoiceId();
    for (const voice of TTS_VOICES) {
      const dl = await isVoiceDownloaded(voice.id);
      ttsFlags[voice.id] = {
        status: 'idle',
        progress: 0,
        downloaded: dl,
        active: activeVid === voice.id,
      };
    }
    setTtsStates(ttsFlags);
  }, []);

  useEffect(() => {
    loadDownloadedFlags();
  }, [loadDownloadedFlags]);

  const updateState = (id: string, partial: Partial<ModelState>) => {
    setStates((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || INITIAL_STATE), ...partial },
    }));
  };

  const handleDownload = (model: ModelInfo) => {
    updateState(model.id, { status: 'downloading', progress: 0, speed: 0 });

    downloadModel(model, (status, received, total, speed, error) => {
      if (status === 'downloading') {
        const pct = total > 0 ? received / total : 0;
        updateState(model.id, { status: 'downloading', progress: pct, speed });
      } else if (status === 'done') {
        updateState(model.id, {
          status: 'done',
          progress: 1,
          speed: 0,
          downloaded: true,
          downloadedSize: model.sizeMB * 1024 * 1024,
        });
      } else if (status === 'error') {
        updateState(model.id, { status: 'error', speed: 0 });
      }
    });
  };

  const handleCancel = async (model: ModelInfo) => {
    await cancelDownload(model.id);
    updateState(model.id, { status: 'idle', progress: 0, speed: 0 });
  };

  const handleDelete = async (model: ModelInfo) => {
    await deleteModel(model.id);
    updateState(model.id, {
      status: 'idle',
      progress: 0,
      speed: 0,
      downloaded: false,
      downloadedSize: 0,
    });
  };

  const updateTtsState = (id: string, partial: Partial<TtsVoiceState>) => {
    setTtsStates((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || { status: 'idle', progress: 0, downloaded: false, active: false }), ...partial },
    }));
  };

  const handleTtsDownload = (voiceId: string) => {
    updateTtsState(voiceId, { status: 'downloading', progress: 0 });
    downloadVoice(voiceId, (status, received, total, message) => {
      if (status === 'downloading') {
        const pct = total > 0 ? received / total : 0;
        updateTtsState(voiceId, { status: 'downloading', progress: pct });
      } else if (status === 'extracting') {
        updateTtsState(voiceId, { status: 'extracting', progress: 0.5 });
      } else if (status === 'loading') {
        updateTtsState(voiceId, { status: 'loading', progress: 0.9 });
      } else if (status === 'ready') {
        updateTtsState(voiceId, { status: 'idle', progress: 1, downloaded: true });
      } else if (status === 'error') {
        updateTtsState(voiceId, { status: 'error', progress: 0 });
      }
    }).catch((err) => {
      updateTtsState(voiceId, { status: 'error', progress: 0 });
      console.warn('TTS download error:', err);
    });
  };

  const handleTtsActivate = async (voiceId: string) => {
    // Se já tem uma voz ativa, desativa primeiro
    const currentActive = getActiveVoiceId();
    if (currentActive && currentActive !== voiceId) {
      await deinitializeTts();
      updateTtsState(currentActive, { active: false });
    }

    updateTtsState(voiceId, { status: 'loading', progress: 0.9 });
    try {
      await initializeTts(voiceId);
      updateTtsState(voiceId, { status: 'idle', active: true });
      // Atualiza todas as vozes para refletir qual está ativa
      setTtsStates((prev) => {
        const updated = { ...prev };
        for (const k of Object.keys(updated)) {
          updated[k] = { ...updated[k], active: k === voiceId };
        }
        return updated;
      });
    } catch (err) {
      updateTtsState(voiceId, { status: 'error', progress: 0 });
      console.warn('TTS init error:', err);
    }
  };

  const handleTtsDelete = async (voiceId: string) => {
    if (getActiveVoiceId() === voiceId) {
      await deinitializeTts();
    }
    await deleteTtsVoice(voiceId);
    updateTtsState(voiceId, {
      status: 'idle',
      progress: 0,
      downloaded: false,
      active: false,
    });
  };


  const onRefresh = async () => {
    setRefreshing(true);
    await loadDownloadedFlags();
    setRefreshing(false);
  };

  const textModels = MODELS.filter((m) => m.type === 'text');
  const visionModels = MODELS.filter((m) => m.type === 'vision');
  const whisperModels = MODELS.filter((m) => m.type === 'whisper');

  const renderCard = (model: ModelInfo) => {
    const s = states[model.id] || INITIAL_STATE;
    return (
      <ModelCard
        key={model.id}
        model={model}
        status={s.status}
        progress={s.progress}
        speed={s.speed}
        alreadyDownloaded={s.downloaded}
        onDownload={() => handleDownload(model)}
        onCancel={() => handleCancel(model)}
        onDelete={() => handleDelete(model)}
      />
    );
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00E5FF" />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.appTitle}>BMO</Text>
        <Text style={styles.appSubtitle}>Be More Agent — Fase 1+3</Text>
        <Text style={styles.appHint}>Baixe modelos locais para rodar offline</Text>
      </View>

      {/* Text Models */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>MODELOS DE TEXTO</Text>
        {textModels.map(renderCard)}
      </View>

      {/* Whisper STT Models */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>RECONHECIMENTO DE VOZ (STT)</Text>
        {whisperModels.map(renderCard)}
      </View>

      {/* Vision Models */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>MODELOS DE VISÃO</Text>
        {visionModels.map(renderCard)}
      </View>


      {/* === TTS Voices === */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>TEXT-TO-SPEECH (Piper VITS)</Text>
        {TTS_VOICES.map((voice) => {
          const s = ttsStates[voice.id] || { status: 'idle' as TtsStatus, progress: 0, downloaded: false, active: false };
          return (
            <TtsCard
              key={voice.id}
              voice={voice}
              status={s.status}
              progress={s.progress}
              alreadyDownloaded={s.downloaded}
              isActive={s.active}
              onDownload={() => handleTtsDownload(voice.id)}
              onActivate={() => handleTtsActivate(voice.id)}
              onDelete={() => handleTtsDelete(voice.id)}
            />
          );
        })}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Arquivos GGUF/BIN salvos no armazenamento interno.
          {'\n'}Fonte: HuggingFace · Offline após download
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#08080c',
  },
  header: {
    padding: 20,
    paddingBottom: 8,
    alignItems: 'center',
  },
  appTitle: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#00E5FF',
    fontFamily: 'monospace',
  },
  appSubtitle: {
    fontSize: 14,
    color: '#555',
    marginTop: 2,
    fontFamily: 'monospace',
  },
  appHint: {
    fontSize: 12,
    color: '#444',
    marginTop: 6,
  },
  section: {
    paddingHorizontal: 16,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#333',
    fontFamily: 'monospace',
    letterSpacing: 1.5,
    marginBottom: 8,
    marginTop: 8,
  },
  footer: {
    padding: 20,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 40,
  },
  footerText: {
    fontSize: 11,
    color: '#333',
    textAlign: 'center',
    lineHeight: 16,
  },
});
