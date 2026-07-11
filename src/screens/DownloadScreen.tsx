import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, View, Text, ScrollView, RefreshControl, Switch } from 'react-native';
import { getRealtimeSttEnabled, setRealtimeSttEnabled } from '../services/SettingsService';
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

interface ModelState {
  status: DownloadStatus;
  progress: number;
  speed: number;
  downloaded: boolean;
  downloadedSize: number;
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
  const [refreshing, setRefreshing] = useState(false);
  const [realtimeStt, setRealtimeStt] = useState(false);

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
  }, []);

  useEffect(() => {
    loadDownloadedFlags();
    getRealtimeSttEnabled().then(setRealtimeStt);
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

  const handleToggleRealtime = async (enabled: boolean) => {
    setRealtimeStt(enabled);
    await setRealtimeSttEnabled(enabled);
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

      {/* Configurações */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>CONFIGURAÇÕES</Text>
        <View style={styles.settingsCard}>
          <View style={styles.settingsRow}>
            <View style={styles.settingsText}>
              <Text style={styles.settingsLabel}>Transcrição em Tempo Real</Text>
              <Text style={styles.settingsDesc}>
                Texto aparece no chat enquanto você fala. {'\n'}
                Requer modelo Whisper baixado.
              </Text>
            </View>
            <Switch
              value={realtimeStt}
              onValueChange={handleToggleRealtime}
              trackColor={{ false: '#1e1e2e', true: '#00E5FF' }}
              thumbColor={realtimeStt ? '#000' : '#555'}
            />
          </View>
        </View>
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
  settingsCard: {
    backgroundColor: '#111118',
    borderRadius: 14,
   padding: 16,
    borderWidth: 1,
    borderColor: '#1e1e2e',
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingsText: {
    flex: 1,
    paddingRight: 12,
  },
  settingsLabel: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#E0E0E0',
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  settingsDesc: {
    fontSize: 12,
    color: '#666',
    lineHeight: 16,
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
