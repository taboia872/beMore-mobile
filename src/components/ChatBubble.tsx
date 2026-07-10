import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import type { ChatMessage } from '../types';

interface ChatBubbleProps {
  message: ChatMessage;
}

export default function ChatBubble({ message }: ChatBubbleProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  return (
    <View style={[styles.container, isUser ? styles.userContainer : styles.assistantContainer]}>
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble, message.isError && styles.errorBubble]}>
        <Text style={[styles.label, isUser ? styles.userLabel : styles.assistantLabel]}>
          {isUser ? 'YOU' : isSystem ? 'SYS' : 'BMO'}
        </Text>
        <Text style={styles.content}>
          {message.content}
          {message.isStreaming && <Text style={styles.cursor}>▊</Text>}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: 16,
    marginVertical: 4,
    flexDirection: 'row',
  },
  userContainer: {
    justifyContent: 'flex-end',
  },
  assistantContainer: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '82%',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userBubble: {
    backgroundColor: '#1a2a4a',
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: '#111118',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#1a1a2e',
  },
  errorBubble: {
    borderColor: '#4a1a1a',
    backgroundColor: '#1a1010',
  },
  label: {
    fontSize: 10,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    marginBottom: 4,
    letterSpacing: 1,
  },
  userLabel: {
    color: '#5588ff',
  },
  assistantLabel: {
    color: '#00E5FF',
  },
  content: {
    fontSize: 15,
    color: '#E0E0E0',
    lineHeight: 22,
  },
  cursor: {
    color: '#00E5FF',
    fontSize: 14,
  },
});
