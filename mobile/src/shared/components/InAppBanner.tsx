import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { wsClient } from '../api/websocket';
import { useChatStore } from '../store/chat';
import { useAuthStore } from '../store/auth';
import { useTheme } from '../hooks/useTheme';
import { navigationRef } from '../navigation/ref';
import { isEncrypted } from '../crypto/e2ee';
import type { Chat } from '../../entities/chat/types';

interface Banner {
  chatId: string;
  chatTitle: string;
  senderName: string;
  preview: string;
  chatType: 'direct' | 'group' | 'system';
}

const BANNER_DURATION = 4000;

export function InAppBanner() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [banner, setBanner] = useState<Banner | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const translateY = useSharedValue(-120);
  const opacity = useSharedValue(0);
  const { activeChatId } = useChatStore();
  const { userId } = useAuthStore();
  const queryClient = useQueryClient();

  const dismiss = useCallback(() => {
    translateY.value = withSpring(-120, { damping: 20 });
    opacity.value = withTiming(0, { duration: 200 });
    if (timerRef.current) clearTimeout(timerRef.current);
    setTimeout(() => setBanner(null), 250);
  }, [translateY, opacity]);

  const show = useCallback(
    (b: Banner) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setBanner(b);
      translateY.value = withSpring(0, { damping: 18, stiffness: 180 });
      opacity.value = withTiming(1, { duration: 150 });
      timerRef.current = setTimeout(dismiss, BANNER_DURATION);
    },
    [translateY, opacity, dismiss],
  );

  useEffect(() => {
    const off = wsClient.on('message.new', (raw) => {
      const p = raw as {
        message_id: string;
        chat_id: string;
        sender_user_id: string;
        encrypted_payload: string;
        sender_username?: string;
        chat_title?: string;
      };

      if (p.sender_user_id === userId) return;
      if (p.chat_id === activeChatId) return;

      const chats = queryClient.getQueryData<Chat[]>(['chats']) ?? [];
      const chat = chats.find((c) => c.id === p.chat_id);
      const chatType = chat?.type ?? 'direct';
      const chatTitle =
        p.chat_title ??
        chat?.title ??
        (p.sender_username ? `@${p.sender_username}` : 'Сообщение');

      const rawText = isEncrypted(p.encrypted_payload) ? 'Новое сообщение' : p.encrypted_payload;
      const text = rawText.length > 60 ? `${rawText.slice(0, 60)}…` : rawText;

      show({
        chatId: p.chat_id,
        chatTitle,
        senderName: p.sender_username ? `@${p.sender_username}` : '',
        preview: text,
        chatType,
      });
    });
    return off;
  }, [userId, activeChatId, show, queryClient]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  if (!banner) return null;

  return (
    <Animated.View
      style={[
        animStyle,
        {
          position: 'absolute',
          top: insets.top + 8,
          left: 12,
          right: 12,
          zIndex: 9999,
          borderRadius: 14,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.25,
          shadowRadius: 12,
          elevation: 12,
        },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => {
          dismiss();
          if (navigationRef.isReady()) {
            navigationRef.navigate('Chats' as never, {
              screen: 'Chat',
              params: {
                chatId: banner.chatId,
                chatTitle: banner.chatTitle,
                chatType: banner.chatType,
              },
            } as never);
          }
        }}
        style={{ flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 }}
      >
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: `${colors.primary}25`,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 18 }}>💬</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{ fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 2 }}
            numberOfLines={1}
          >
            {banner.chatTitle}
          </Text>
          <Text style={{ fontSize: 13, color: colors.textSecondary }} numberOfLines={1}>
            {banner.senderName ? `${banner.senderName}: ` : ''}{banner.preview}
          </Text>
        </View>
        <TouchableOpacity onPress={dismiss} hitSlop={12}>
          <Text style={{ fontSize: 16, color: colors.textMuted }}>✕</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}
