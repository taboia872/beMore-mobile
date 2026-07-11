/**
 * SettingsService — persistência de configurações do app
 * Use AsyncStorage para flags simples.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  REALTIME_STT: '@bmo/realtime_stt',
} as const;

export async function getRealtimeSttEnabled(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(KEYS.REALTIME_STT);
    return val === 'true';
  } catch {
    return false;
  }
}

export async function setRealtimeSttEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.REALTIME_STT, enabled ? 'true' : 'false');
  } catch {
    // ignore
  }
}
