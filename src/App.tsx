import React, { useEffect, useState } from 'react';
import { StatusBar, TouchableOpacity, StyleSheet, View, Text } from 'react-native';
import DownloadScreen from './screens/DownloadScreen';
import ChatScreen from './screens/ChatScreen';

type Screen = 'download' | 'chat';

export default function App() {
  const [screen, setScreen] = useState<Screen>('download');

  useEffect(() => {
    StatusBar.setHidden(true, 'none');
    return () => {
      StatusBar.setHidden(false, 'none');
    };
  }, []);

  return (
    <>
      <StatusBar hidden translucent barStyle="light-content" backgroundColor="#08080c" />
      {screen === 'download' ? (
        <>
          <DownloadScreen />
          <TouchableOpacity
            style={styles.chatBtn}
            onPress={() => setScreen('chat')}
          >
            <Text style={styles.chatBtnText}>💬 Chat</Text>
          </TouchableOpacity>
        </>
      ) : (
        <ChatScreen onBack={() => setScreen('download')} />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  chatBtn: {
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
  chatBtnText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 14,
  },
});
