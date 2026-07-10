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

  return (
    <View style={[styles.card, isDone && styles.cardDone]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{model.name}</Text>
          <View style={[styles.badge, model.type === 'vision' ? styles.badgeVision : model.type === 'whisper' ? styles.badgeWhisper : styles.badgeTextBg]}>
            <Text style={styles.badgeLabel}>
              {model.type === 'vision' ? '👁 VISÃO' : model.type === 'whisper' ? '🎙 STT' : '📝 TEXTO'}
            </Text>
          </View>
        </View>
        <Text style={styles.size}>{model.size}</Text>
      </View>

      {/* Description */}
      <Text style={styles.description}>{model.description}</Text>

      {/* Progress bar */}
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

      {/* Error */}
      {isError && <Text style={styles.errorText}>⚠ Erro no download. Tente novamente.</Text>}

      {/* Action buttons */}
      <View style={styles.actions}>
        {isDone ? (
          <>
            <View style={styles.doneBadge}>
              <Text style={styles.doneBadgeText}>✓ Baixado</Text>
            </View>
            <TouchableOpacity style={styles.deleteBtn} onPress={onDelete}>
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
  },
  cardDone: {
    borderColor: '#1a4a2a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#E0E0E0',
    fontFamily: 'monospace',
  },
  size: {
    fontSize: 13,
    color: '#666',
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeTextBg: {
    backgroundColor: '#1a2a4a',
  },
  badgeVision: {
  badgeWhisper: {
    backgroundColor: "#2a4a1a",
  },
    backgroundColor: '#4a1a2a',
  },
  badgeLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#88aaff',
    fontFamily: 'monospace',
  },
  description: {
    fontSize: 13,
    color: '#888',
    marginBottom: 12,
    lineHeight: 18,
  },
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
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  deleteBtnText: {
    color: '#666',
    fontSize: 12,
  },
  errorText: {
    color: '#ff5555',
    fontSize: 12,
    marginBottom: 8,
  },
});
