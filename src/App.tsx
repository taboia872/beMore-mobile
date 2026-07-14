/**
 * App.tsx — Router principal do BMO Companion
 *
 * Fluxo:
 * 1. Setup (primeira vez): DownloadScreen + botão "Finalizar"
 * 2. Loading: LoadingScreen (auto-load LLM + STT + TTS)
 * 3. BMO: BmoScreen (rostinho + voz)
 * 4. Settings: SettingsScreen (system prompt + troca de modelos)
 *
 * A tela de Setup aparece quando first_run_complete = false.
 * O botão "Finalizar" da Setup marca first_run e vai pra Loading.
 */

import React, { useEffect, useState } from 'react';
import { StatusBar, StyleSheet, View, ActivityIndicator, TouchableOpacity, Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DownloadScreen from './screens/DownloadScreen';
import LoadingScreen from './screens/LoadingScreen';
import BmoScreen from './screens/BmoScreen';
import SettingsScreen from './screens/SettingsScreen';
import { loadSettings, saveSettings, autoDetectDownloadedModels } from './data/appSettings';

type Screen = 'boot' | 'setup' | 'loading' | 'bmo' | 'settings';

export default function App() {
  const [screen, setScreen] = useState<Screen>('boot');

  // StatusBar: translucent overlay via theme (no setHidden — crashes text selection)

  useEffect(() => {
    (async () => {
      const settings = await loadSettings();
      if (settings.firstRunComplete) {
        // Já configurou antes → vai direto pro loading
        setScreen('loading');
      } else {
        // Primeira vez → setup
        setScreen('setup');
      }
    })();
  }, []);

  const handleSetupComplete = async () => {
    // Auto-detecta modelos baixados e marca como selecionados
    const detected = await autoDetectDownloadedModels();
    await saveSettings({
      firstRunComplete: true,
      selectedLlmModel: detected.llm,
      selectedWhisperModel: detected.whisper,
      selectedVoice: detected.voice,
    });
    setScreen('loading');
  };

  const handleLoadingReady = () => {
    setScreen('bmo');
  };

  const handleLoadingError = (msg: string) => {
    // Volta pro setup se der erro no auto-load
    console.warn('[App] Loading error:', msg);
    setScreen('setup');
  };

  const handleOpenSettings = () => {
    setScreen('settings');
  };

  const handleCloseSettings = () => {
    setScreen('bmo');
  };

  // Tela de boot — só um splash rápido
  if (screen === 'boot') {
    return (
      <View style={styles.boot}>
        <StatusBar translucent barStyle="light-content" backgroundColor="#08080c" />
        <Text style={styles.bootText}>BMO</Text>
        <ActivityIndicator size="large" color="#00E5FF" style={{ marginTop: 16 }} />
      </View>
    );
  }

  // Tela de Setup (primeira vez) — DownloadScreen + botão finalizar
  if (screen === 'setup') {
    return (
      <>
        <StatusBar translucent barStyle="light-content" backgroundColor="#08080c" />
        <DownloadScreen />
        <TouchableOpacity
          style={styles.finishBtn}
          onPress={handleSetupComplete}
        >
          <Text style={styles.finishBtnText}>✓ Finalizar Setup</Text>
        </TouchableOpacity>
      </>
    );
  }

  // Loading — carrega tudo na memória
  if (screen === 'loading') {
    return (
      <>
        <StatusBar translucent barStyle="light-content" backgroundColor="#08080c" />
        <LoadingScreen onReady={handleLoadingReady} onError={handleLoadingError} />
      </>
    );
  }

  // Settings — configurável a partir do BMO
  if (screen === 'settings') {
    return (
      <>
        <StatusBar translucent barStyle="light-content" backgroundColor="#08080c" />
        <SettingsScreen onClose={handleCloseSettings} />
      </>
    );
  }

  // BMO — tela principal (rostinho + voz)
  return (
    <>
      <StatusBar translucent barStyle="light-content" backgroundColor="#08080c" />
      <BmoScreen onOpenSettings={handleOpenSettings} />
    </>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    backgroundColor: '#08080c',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bootText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#00E5FF',
    fontFamily: 'monospace',
  },
  finishBtn: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    backgroundColor: '#00E5FF',
    borderRadius: 28,
    paddingHorizontal: 20,
    paddingVertical: 14,
    elevation: 8,
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  finishBtnText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 14,
    fontFamily: 'monospace',
  },
});
