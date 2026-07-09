import React from 'react';
import { StyleSheet, View, Text } from 'react-native';

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>BMO</Text>
      <Text style={styles.subtitle}>Be More Agent</Text>
      <Text style={styles.hint}>Fase 0 — Setup OK ✅</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#00E5FF',
    fontFamily: 'monospace',
  },
  subtitle: {
    fontSize: 18,
    color: '#666',
    marginTop: 4,
  },
  hint: {
    fontSize: 12,
    color: '#444',
    marginTop: 20,
  },
});
