import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import type { TtsVoiceInfo, TtsStatus } from '../services/TtsService';

interface TtsCardProps {
  voice: TtsVoiceInfo;
  status: TtsStatus;
  progress: number; // 0..1
  alreadyDownloaded: boolean;
  isActive: boolean;
  onDownload: () => void;
  onActivate: () => void;
  onDelete: () => void;
}

function formatBytes(bytes: number): string {
  const mb = (bytes / (1024 * 1024)).toFixed(1);
  return `${mb} MB`;
}

export default function TtsCard({
  voice,
  status,
  progress,
  alreadyDownloaded,
  isActive,
  onDownload,
  onActivate,
  onDelete,
}: TtsCardProps) {
  const isDownloading = status === 'downloading';
  const isExtracting = status === 'extracting';
  const isLoading = status === 'loading';
  const isError = status === 'error';
  const isReady = alreadyDownloaded;

  return (
    <View style={[styles.card, isReady && styles.cardDone, isActive && styles.cardActive]}>
      {/* Topo */}
      <View style={styles.topBar}>
        <Text style={styles.sizeBadge}>~{voice.sizeMB}MB</Text>
      </View>

      {/* Nome */}
      <Text style={styles.voiceName} numberOfLines={1}>{voice.name}</Text>
      <Text style={styles.language}>{voice.language}</Text>
      <Text style={styles.description}>{voice.description}</Text>

      {/* Progress bar */}
      {(isDownloading || isExtracting || isLoading) && (
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${Math.min(progress * 100, 100)}%` }]} />
          </View>
          <Text style={styles.progressText}>
            {isExtracting ? 'Extraindo...' : isLoading ? 'Carregando...' : `${formatBytes(progress * voice.sizeMB * 1024 * 1024)} / ${formatBytes(voice.sizeMB * 1024 * 1024)}`}
          </Text>
        </View>
      )}

      {/* Erro */}
      {isError && <Text style={styles.errorText}>⚠ Erro. Tente novamente.</Text>}

      {/* Badge ativa */}
      {isActive && (
        <View style={styles.activeBadge}>
          <Text style={styles.activeBadgeText}>🔊 Voz Ativa</Text>
        </View>
      )}

      {/* Botões */}
      <View style={styles.actions}>
        {!isReady ? (
          <TouchableOpacity style={styles.downloadBtn} onPress={onDownload} disabled={isDownloading}>
            <Text style={styles.downloadBtnText}>{isDownloading ? 'Baixando...' : '⬇ Baixar'}</Text>
          </TouchableOpacity>
        ) : !isActive ? (
          <>
            <TouchableOpacity style={styles.activateBtn} onPress={onActivate}>
              <Text style={styles.activateBtnText}>🔊 Ativar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.deleteBtn} onPress={onDelete}>
              <Text style={styles.deleteBtnText}>🗑</Text>
            </TouchableOpacity>
          </>
        ) : null}
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
  cardActive: {
    borderColor: '#00E5FF',
    borderWidth: 2,
  },
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
  voiceName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#E0E0E0',
    fontFamily: 'monospace',
    marginBottom: 2,
  },
  language: {
    fontSize: 11,
    color: '#00E5FF',
    fontFamily: 'monospace',
    marginBottom: 8,
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
  activeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#00E5FF',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 8,
  },
  activeBadgeText: {
    fontSize: 12,
    color: '#000',
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  errorText: {
    color: '#ff5555',
    fontSize: 12,
    marginBottom: 8,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
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
  activateBtn: {
    backgroundColor: '#1a4a2a',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#2a6a3a',
  },
  activateBtnText: {
    color: '#4aFA6a',
    fontWeight: 'bold',
    fontSize: 14,
  },
  deleteBtn: {
    backgroundColor: '#2a1010',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  deleteBtnText: {
    fontSize: 16,
  },
});
