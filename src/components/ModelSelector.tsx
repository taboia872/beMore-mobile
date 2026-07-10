import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { MODELS } from '../data/models';
import { isModelDownloaded } from '../services/DownloadManager';
import { getActiveModelId, isModelLoaded } from '../services/LlamaService';
import type { ModelInfo } from '../types';

interface ModelSelectorProps {
  visible: boolean;
  onSelect: (model: ModelInfo) => void;
  onClose: () => void;
}

export default function ModelSelector({ visible, onSelect, onClose }: ModelSelectorProps) {
  const [downloaded, setDownloaded] = React.useState<Set<string>>(new Set());
  const activeId = getActiveModelId();

  React.useEffect(() => {
    if (!visible) return;
    const check = async () => {
      const set = new Set<string>();
      for (const m of MODELS) {
        if (m.type !== 'text') continue;
        if (await isModelDownloaded(m.id)) {
          set.add(m.id);
        }
      }
      setDownloaded(set);
    };
    check();
  }, [visible]);

  if (!visible) return null;

  const textModels = MODELS.filter((m) => m.type === 'text');

  return (
    <View style={styles.overlay}>
      <View style={styles.panel}>
        <View style={styles.header}>
          <Text style={styles.title}>Selecionar Modelo</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.closeBtn}>✕</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.list}>
          {textModels.map((model) => {
            const isDownloaded = downloaded.has(model.id);
            const isActive = activeId === model.id;
            return (
              <TouchableOpacity
                key={model.id}
                style={[styles.item, isActive && styles.itemActive]}
                disabled={!isDownloaded}
                onPress={() => onSelect(model)}
              >
                <View style={styles.itemInfo}>
                  <Text style={[styles.itemName, !isDownloaded && styles.itemDisabled]}>
                    {isActive ? '● ' : ''}{model.name}
                  </Text>
                  <Text style={styles.itemDesc}>{model.description}</Text>
                  <Text style={styles.itemMeta}>
                    {model.size} · {isDownloaded ? (isActive ? 'CARREGADO' : 'Disponível') : 'Não baixado'}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
          {textModels.length === 0 && (
            <Text style={styles.empty}>Nenhum modelo baixado. Volte e baixe um modelo primeiro.</Text>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  panel: {
    backgroundColor: '#0d0d14',
    borderRadius: 16,
    width: '90%',
    maxHeight: '70%',
    borderWidth: 1,
    borderColor: '#1a1a2e',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a2e',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#00E5FF',
    fontFamily: 'monospace',
  },
  closeBtn: {
    fontSize: 18,
    color: '#666',
  },
  list: {
    padding: 8,
  },
  item: {
    padding: 14,
    borderRadius: 10,
    marginBottom: 6,
    backgroundColor: '#111118',
  },
  itemActive: {
    backgroundColor: '#1a2a4a',
    borderWidth: 1,
    borderColor: '#00E5FF',
  },
  itemInfo: {},
  itemName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#E0E0E0',
    fontFamily: 'monospace',
  },
  itemDisabled: {
    color: '#444',
  },
  itemDesc: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  itemMeta: {
    fontSize: 11,
    color: '#444',
    marginTop: 4,
    fontFamily: 'monospace',
  },
  empty: {
    color: '#555',
    textAlign: 'center',
    padding: 20,
    fontSize: 14,
  },
});
