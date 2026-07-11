import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { ModelInfo, DownloadStatus } from '../types';

interface ModelCardProps {
  model: ModelInfo;
  status: DownloadStatus;
  progress: number; // 0..1
  speed: number; // bytes/sec
  alreadyDownloaded: boolean;
  onDownload: () => void;
  onCancel: () => void;
  onDelete: () => void;
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${Math.round(bytesPerSec)} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
}

function formatBytes(bytes: number): string {
  const mb = (bytes / (1024 * 1024)).toFixed(1);
  return `${mb} MB`;
}

const TYPE_ICON: Record<string, string> = {
  text: '📝',
  vision: '👁',
  whisper: '🎙',
};

export default function ModelCard({
  model,
  status,
  progress,
  speed,
  alreadyDownloaded,
  onDownload,
  onCancel,
  onDelete,
}: ModelCardProps) {
  const isDownloading = status === 'downloading';
  const isError = status === 'error';
  const isDone = status === 'done' || alreadyDownloaded;

  // Extrai tamanho numérico do model.size para o badge superior direito
  const sizeBadge = model.size.replace('~', '');

  return (
    <View style={[styles.card, isDone && styles.cardDone]}>
      {/* === TOPO: tamanho no canto superior direito === */}
      <View style={styles.topBar}>
        <Text style={styles.sizeBadge}>{sizeBadge}</Text>
      </View>

      {/* === Nome do modelo === */}
      <Text style={styles.modelName} numberOfLines={1}>{model.name}</Text>

      {/* === Filename completo (autor/repo) === */}
      <Text style={styles.filename} numberOfLines={1}>{model.author}</Text>

      {/* === Descrição === */}
      <Text style={styles.description}>{model.description}</Text>

      {/* === Progress bar === */}
      {isDownloading && (
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${Math.min(progress * 100, 100)}%` }]} />
          </View>
          <Text style={styles.progressText}>
            {formatBytes(progress * model.sizeMB * 1024 * 1024)} / {formatBytes(model.sizeMB * 1024 * 1024)} · {formatSpeed(speed)}
          </Text>
        </View>
      )}

      {/* === Erro === */}
      {isError && <Text style={styles.errorText}>⚠ Erro no download. Tente novamente.</Text>}

      {/* === Botões centralizados === */}
      <View style={styles.actions}>
        {isDone ? (
          <>
            <View style={styles.doneBadge}>
              <Text style={styles.doneBadgeText}>✓ Baixado</Text>
            </View>
            <TouchableOpacity
              style={[styles.deleteBtn, !alreadyDownloaded && styles.disabled]}
              onPress={onDelete}
              disabled={!alreadyDownloaded}
            >
              <Text style={styles.deleteBtnText}>Remover</Text>
            </TouchableOpacity>
          </>
        ) : isDownloading ? (
          <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
            <Text style={styles.cancelBtnText}>✕ Cancelar</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.downloadBtn} onPress={onDownload}>
            <Text style={styles.downloadBtnText}>⬇ Baixar</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* === Ícone de tipo no canto inferior direito === */}
      <View style={styles.typeIconContainer}>
        <Text style={styles.typeIcon}>{TYPE_ICON[model.type] || '📦'}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#111118',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1e1e2e',
    position: 'relative',
  },
  cardDone: {
    borderColor: '#1a4a2a',
  },
  // === Topo ===
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 4,
  },
  sizeBadge: {
    fontSize: 11,
    color: '#555',
    fontFamily: 'monospace',
  },
  // === Nome ===
  modelName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#E0E0E0',
    fontFamily: 'monospace',
    marginBottom: 2,
  },
  // === Filename ===
  filename: {
    fontSize: 11,
    color: '#444',
    fontFamily: 'monospace',
    marginBottom: 8,
  },
  // === Descrição ===
  description: {
    fontSize: 13,
    color: '#888',
    marginBottom: 12,
    lineHeight: 18,
  },
  // === Progress ===
  progressContainer: {
    marginBottom: 12,
  },
  progressBar: {
    height: 6,
    backgroundColor: '#1a1a2a',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#00E5FF',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 11,
    color: '#555',
    marginTop: 4,
    fontFamily: 'monospace',
  },
  // === Actions ===
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  downloadBtn: {
    backgroundColor: '#00E5FF',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  downloadBtnText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 14,
  },
  cancelBtn: {
    backgroundColor: '#2a1a1a',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  cancelBtnText: {
    color: '#ff5555',
    fontWeight: 'bold',
    fontSize: 14,
  },
  doneBadge: {
    backgroundColor: '#1a4a2a',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  doneBadgeText: {
    color: '#4affa4',
    fontWeight: 'bold',
    fontSize: 13,
  },
  deleteBtn: {
    backgroundColor: 'transparent',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  disabled: {
    opacity: 0.3,
  },
  deleteBtnText: {
    color: '#666',
    fontSize: 12,
  },
  // === Type icon ===
  typeIconContainer: {
    position: 'absolute',
    bottom: 12,
    right: 14,
  },
  typeIcon: {
    fontSize: 14,
    opacity: 0.5,
  },
  // === Error ===
  errorText: {
    color: '#ff5555',
    fontSize: 12,
    marginBottom: 8,
  },
});
