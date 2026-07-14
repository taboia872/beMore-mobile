/**
 * SettingsScreen — configurações do BMO Companion
 * - System Prompt editável
 * - Troca de modelo LLM, STT e voz TTS
 * Acessível a partir da tela do BMO (engrenagem).
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet, View, Text, TextInput, TouchableOpacity,
  ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import {
  loadSettings, saveSettings, DEFAULT_SYSTEM_PROMPT,
} from '../data/appSettings';
import { MODELS } from '../data/models';
import { WHISPER_MODELS } from '../data/whisperModels';
import { TTS_VOICES } from '../services/TtsService';
import { isModelDownloaded } from '../services/DownloadManager';
import { isWhisperModelDownloaded } from '../services/WhisperService';
import { isVoiceDownloaded } from '../services/TtsService';

interface SettingsScreenProps {
  onClose: () => void;
}

export default function SettingsScreen({ onClose }: SettingsScreenProps) {
  const [systemPrompt, setSystemPrompt] = useState('');
  const [selectedLlm, setSelectedLlm] = useState<string | null>(null);
  const [selectedWhisper, setSelectedWhisper] = useState<string | null>(null);
  const [selectedVoice, setSelectedVoice] = useState<string | null>(null);
  const [downloadedLlm, setDownloadedLlm] = useState<Set<string>>(new Set());
  const [downloadedWhisper, setDownloadedWhisper] = useState<Set<string>>(new Set());
  const [downloadedVoices, setDownloadedVoices] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const settings = await loadSettings();
      setSystemPrompt(settings.systemPrompt);
      setSelectedLlm(settings.selectedLlmModel);
      setSelectedWhisper(settings.selectedWhisperModel);
      setSelectedVoice(settings.selectedVoice);

      // Verifica quais modelos estão baixados
      const llmSet = new Set<string>();
      for (const m of MODELS.filter((m) => m.type === 'text')) {
        if (await isModelDownloaded(m.id)) llmSet.add(m.id);
      }
      setDownloadedLlm(llmSet);

      const whisperSet = new Set<string>();
      for (const w of WHISPER_MODELS) {
        if (await isWhisperModelDownloaded(w.id)) whisperSet.add(w.id);
      }
      setDownloadedWhisper(whisperSet);

      const voiceSet = new Set<string>();
      for (const v of TTS_VOICES) {
        if (await isVoiceDownloaded(v.id)) voiceSet.add(v.id);
      }
      setDownloadedVoices(voiceSet);
    })();
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    await saveSettings({
      systemPrompt,
      selectedLlmModel: selectedLlm,
      selectedWhisperModel: selectedWhisper,
      selectedVoice: selectedVoice,
    });
    setSaving(false);
    onClose();
  }, [systemPrompt, selectedLlm, selectedWhisper, selectedVoice, onClose]);

  const renderLlmOption = (model: { id: string; name: string; sizeMB: number }) => {
    const downloaded = downloadedLlm.has(model.id);
    const selected = selectedLlm === model.id;
    return (
      <TouchableOpacity
        key={model.id}
        style={[styles.optionRow, selected && styles.optionSelected]}
        onPress={() => downloaded && setSelectedLlm(model.id)}
        disabled={!downloaded}
      >
        <Text style={styles.optionIcon}>{selected ? '●' : downloaded ? '○' : '🔒'}</Text>
        <Text style={[styles.optionText, !downloaded && styles.optionLocked]}>
          {model.name} ({model.sizeMB}MB)
        </Text>
      </TouchableOpacity>
    );
  };

  const renderWhisperOption = (model: { id: string; name: string; sizeMB: number }) => {
    const downloaded = downloadedWhisper.has(model.id);
    const selected = selectedWhisper === model.id;
    return (
      <TouchableOpacity
        key={model.id}
        style={[styles.optionRow, selected && styles.optionSelected]}
        onPress={() => downloaded && setSelectedWhisper(model.id)}
        disabled={!downloaded}
      >
        <Text style={styles.optionIcon}>{selected ? '●' : downloaded ? '○' : '🔒'}</Text>
        <Text style={[styles.optionText, !downloaded && styles.optionLocked]}>
          {model.name} ({model.sizeMB}MB)
        </Text>
      </TouchableOpacity>
    );
  };

  const renderVoiceOption = (voice: { id: string; name: string; description: string; sizeMB: number }) => {
    const downloaded = downloadedVoices.has(voice.id);
    const selected = selectedVoice === voice.id;
    return (
      <TouchableOpacity
        key={voice.id}
        style={[styles.optionRow, selected && styles.optionSelected]}
        onPress={() => downloaded && setSelectedVoice(voice.id)}
        disabled={!downloaded}
      >
        <Text style={styles.optionIcon}>{selected ? '●' : downloaded ? '○' : '🔒'}</Text>
        <View>
          <Text style={[styles.optionText, !downloaded && styles.optionLocked]}>
            {voice.name}
          </Text>
          <Text style={styles.optionSub}>{voice.description}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'android' ? undefined : 'padding'}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.backBtn}>← BMO</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Configurações</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* System Prompt */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SYSTEM PROMPT</Text>
          <Text style={styles.sectionHint}>
            Como o BMO deve se comportar. Isto define a personalidade.
          </Text>
          <TextInput
            style={styles.promptInput}
            value={systemPrompt}
            onChangeText={setSystemPrompt}
            multiline
            textAlignVertical="top"
            placeholder="Digite o system prompt..."
            placeholderTextColor="#333"
          />
          <TouchableOpacity onPress={() => setSystemPrompt(DEFAULT_SYSTEM_PROMPT)}>
            <Text style={styles.resetBtn}>↺ Restaurar padrão</Text>
          </TouchableOpacity>
        </View>

        {/* LLM Model */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>MODELO DE LINGUAGEM</Text>
          <Text style={styles.sectionHint}>
            Apenas modelos baixados aparecem. Baixe novos na tela de Downloads.
          </Text>
          {MODELS.filter((m) => m.type === 'text').map(renderLlmOption)}
          {downloadedLlm.size === 0 && (
            <Text style={styles.emptyText}>Nenhum modelo baixado</Text>
          )}
        </View>

        {/* Whisper STT */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>RECONHECIMENTO DE VOZ (STT)</Text>
          {WHISPER_MODELS.map(renderWhisperOption)}
          {downloadedWhisper.size === 0 && (
            <Text style={styles.emptyText}>Nenhum modelo baixado</Text>
          )}
        </View>

        {/* TTS Voice */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>VOZ (TTS)</Text>
          {TTS_VOICES.map(renderVoiceOption)}
          {downloadedVoices.size === 0 && (
            <Text style={styles.emptyText}>Nenhuma voz baixada</Text>
          )}
        </View>
      </ScrollView>

      {/* Save bar */}
      <View style={styles.saveBar}>
        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
          {saving ? (
            <Text style={styles.saveBtnText}>Salvando...</Text>
          ) : (
            <Text style={styles.saveBtnText}>Salvar</Text>
          )}
        </TouchableOpacity>
      </View>
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a2e',
  },
  backBtn: {
    fontSize: 14,
    color: '#00E5FF',
    fontFamily: 'monospace',
  },
  headerTitle: {
    fontSize: 16,
    color: '#E0E0E0',
    fontFamily: 'monospace',
    fontWeight: 'bold',
  },
  headerSpacer: {
    width: 50,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 80,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#444',
    fontFamily: 'monospace',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  sectionHint: {
    fontSize: 12,
    color: '#333',
    marginBottom: 12,
  },
  promptInput: {
    backgroundColor: '#111118',
    borderRadius: 12,
    padding: 14,
    color: '#E0E0E0',
    fontSize: 14,
    minHeight: 120,
    borderWidth: 1,
    borderColor: '#1a1a2e',
    fontFamily: 'monospace',
  },
  resetBtn: {
    fontSize: 12,
    color: '#555',
    marginTop: 8,
    fontFamily: 'monospace',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#111118',
    borderRadius: 8,
    marginBottom: 6,
    gap: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  optionSelected: {
    borderColor: '#00E5FF',
  },
  optionIcon: {
    fontSize: 14,
    color: '#00E5FF',
  },
  optionText: {
    fontSize: 14,
    color: '#E0E0E0',
    fontFamily: 'monospace',
  },
  optionLocked: {
    color: '#444',
  },
  optionSub: {
    fontSize: 11,
    color: '#555',
    marginTop: 2,
  },
  emptyText: {
    fontSize: 13,
    color: '#444',
    fontFamily: 'monospace',
    fontStyle: 'italic',
  },
  saveBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    backgroundColor: '#08080c',
    borderTopWidth: 1,
    borderTopColor: '#1a1a2e',
  },
  saveBtn: {
    backgroundColor: '#00E5FF',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 16,
    fontFamily: 'monospace',
  },
});
