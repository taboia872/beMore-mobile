import React, { useEffect, useState } from 'react';
import { StatusBar, TouchableOpacity, StyleSheet, View, Text, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DownloadScreen from './screens/DownloadScreen';
import ChatScreen from './screens/ChatScreen';

type Screen = 'download' | 'chat';

const FIRST_RUN_KEY = '@bmo/first_run_complete';

export default function App() {
  const [screen, setScreen] = useState<Screen>('download');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    StatusBar.setHidden(true, 'none');
    return () => {
      StatusBar.setHidden(false, 'none');
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const done = await AsyncStorage.getItem(FIRST_RUN_KEY);
        if (done === 'true') {
          setScreen('chat');
        }
      } catch {
        // ignore
      }
      setLoading(false);
    })();
  }, []);

  const handleEnterChat = async () => {
    try {
      await AsyncStorage.setItem(FIRST_RUN_KEY, 'true');
    } catch {
      // ignore
    }
    setScreen('chat');
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#00E5FF" />
      </View>
    );
  }

  return (
    <>
      <StatusBar hidden translucent barStyle="light-content" backgroundColor="#08080c" />
      {screen === 'download' ? (
        <>
          <DownloadScreen />
          <TouchableOpacity
            style={styles.chatBtn}
            onPress={handleEnterChat}
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
  loading: {
    flex: 1,
    backgroundColor: '#08080c',
    justifyContent: 'center',
    alignItems: 'center',
  },
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
