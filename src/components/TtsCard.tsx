/**
 * TtsCard — card informativo do Fish Audio TTS (cloud)
 * Substitui o card de download de voz Piper local.
 */

import React from 'react';
import { StyleSheet, View, Text } from 'react-native';

export default function TtsCard() {
  return (
    <View style={styles.card}>
      <View style={styles.topBar}>
        <Text style={styles.cloudBadge}>☁️ Cloud</Text>
      </View>
      <Text style={styles.voiceName}>BMO (Fish Audio)</Text>
      <Text style={styles.language}>Português (BR)</Text>
      <Text style={styles.description}>
        Voz do BMO de Adventure Time. Síntese via cloud — sem download.
        Funciona com internet. STT e LLM continuam 100% locais.
      </Text>
      <View style={styles.readyBadge}>
        <Text style={styles.readyText}>✓ Pronto</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: '#00E5FF33',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 8,
  },
  cloudBadge: {
    fontSize: 11,
    color: '#00E5FF',
    fontFamily: 'monospace',
  },
  voiceName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    fontFamily: 'monospace',
  },
  language: {
    fontSize: 12,
    color: '#888',
    fontFamily: 'monospace',
    marginTop: 2,
  },
  description: {
    fontSize: 12,
    color: '#aaa',
    fontFamily: 'monospace',
    marginTop: 8,
    lineHeight: 18,
  },
  readyBadge: {
    marginTop: 12,
    alignSelf: 'flex-start',
    backgroundColor: '#00E5FF22',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  readyText: {
    fontSize: 12,
    color: '#00E5FF',
    fontFamily: 'monospace',
  },
});
