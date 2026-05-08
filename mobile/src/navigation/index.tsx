import React, { useEffect } from 'react';
import { AppState, Platform, View, ActivityIndicator } from 'react-native';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { useAuthStore } from '../shared/store/auth';
import { wsClient, initWsClient } from '../shared/api/websocket';
import { initApiClient } from '../shared/api/client';
import { initAuthApi, refreshAccessToken } from '../shared/api/auth';
import { useChatStore } from '../shared/store/chat';
import { useTheme } from '../shared/hooks/useTheme';
import { isEncrypted } from '../shared/crypto/e2ee';
import { navigationRef } from '../shared/navigation/ref';
import { InAppBanner } from '../shared/components/InAppBanner';

import { LoginScreen } from '../screens/LoginScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { ChatListScreen } from '../screens/ChatListScreen';
import { ChatScreen } from '../screens/ChatScreen';
import { SettingsScreen } from '../screens/SettingsScreen';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

export type AuthStackParams = {
  Login: undefined;
  Register: undefined;
};

export type ChatsStackParams = {
  ChatList: undefined;
  Chat: {
    chatId: string;
    chatTitle: string;
    chatType: 'direct' | 'group' | 'system';
    otherUserId?: string;
  };
};

export type AppTabParams = {
  Chats: undefined;
  Settings: undefined;
};

const AuthStack = createNativeStackNavigator<AuthStackParams>();
const ChatsStack = createNativeStackNavigator<ChatsStackParams>();
const AppTab = createBottomTabNavigator<AppTabParams>();

function ChatsTab() {
  const { colors } = useTheme();
  return (
    <ChatsStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerTitleStyle: { color: colors.text, fontWeight: '600' },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <ChatsStack.Screen
        name="ChatList"
        component={ChatListScreen}
        options={{ title: 'Minimum' }}
      />
      <ChatsStack.Screen
        name="Chat"
        component={ChatScreen}
        options={({ route }) => ({ title: route.params.chatTitle })}
      />
    </ChatsStack.Navigator>
  );
}

export function Navigation() {
  const { accessToken, userId, initialized } = useAuthStore();
  const { incUnread, setLastMessage, setDelivered, setRead, setTyping } = useChatStore();
  const { colors, isDark } = useTheme();

  const navTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme : DefaultTheme).colors,
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
      primary: colors.primary,
    },
  };

  useEffect(() => {
    initApiClient(
      () => ({ accessToken: useAuthStore.getState().accessToken }),
      refreshAccessToken,
    );
    initAuthApi(() => ({
      refreshToken: useAuthStore.getState().refreshToken,
      setTokens: (a, r) => useAuthStore.getState().setTokens(a, r),
      logout: () => useAuthStore.getState().logout(),
    }));
    initWsClient(
      () => useAuthStore.getState().accessToken,
      () => !!useAuthStore.getState().accessToken,
    );

    async function setupNotifications() {
      try {
        const { status } = await Notifications.requestPermissionsAsync();
        if (status === 'granted' && Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('messages', {
            name: 'Сообщения',
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#3b82f6',
          });
        }
      } catch {
        // notifications not supported
      }
    }
    void setupNotifications();
  }, []);

  useEffect(() => {
    if (!accessToken) return;

    wsClient.connect();

    const offMsg = wsClient.on('message.new', (raw) => {
      const p = raw as {
        message_id: string;
        chat_id: string;
        sender_user_id: string;
        encrypted_payload: string;
        created_at: string;
        sender_username?: string;
        chat_title?: string;
      };

      if (p.sender_user_id !== userId) {
        incUnread(p.chat_id);

        const { activeChatId } = useChatStore.getState();
        if (p.chat_id !== activeChatId && AppState.currentState !== 'active') {
          const title =
            p.chat_title ??
            (p.sender_username ? `@${p.sender_username}` : 'Minimum');
          const rawBody = isEncrypted(p.encrypted_payload)
            ? 'Новое сообщение'
            : p.encrypted_payload;
          const body = rawBody.length > 80 ? `${rawBody.slice(0, 80)}…` : rawBody;
          void Notifications.scheduleNotificationAsync({
            content: { title, body, data: { chatId: p.chat_id } },
            trigger: null,
          }).catch(() => {});
        }
      }

      const previewText = isEncrypted(p.encrypted_payload)
        ? '🔒 Зашифровано'
        : p.encrypted_payload;
      setLastMessage(p.chat_id, {
        text: previewText,
        at: p.created_at,
        senderId: p.sender_user_id,
      });
    });

    const offDelivered = wsClient.on('message.delivered', (raw) => {
      const p = raw as { message_id: string };
      setDelivered(p.message_id);
    });

    const offRead = wsClient.on('message.read', (raw) => {
      const p = raw as { message_id: string };
      setRead(p.message_id);
    });

    const offTypingStart = wsClient.on('typing.started', (raw) => {
      const p = raw as { chat_id: string; user_id: string };
      setTyping(p.chat_id, p.user_id, true);
    });

    const offTypingStop = wsClient.on('typing.stopped', (raw) => {
      const p = raw as { chat_id: string; user_id: string };
      setTyping(p.chat_id, p.user_id, false);
    });

    return () => {
      offMsg();
      offDelivered();
      offRead();
      offTypingStart();
      offTypingStop();
      wsClient.disconnect();
    };
  }, [accessToken, userId, incUnread, setLastMessage, setDelivered, setRead, setTyping]);

  if (!initialized) {
    return (
      <View
        style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}
      >
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      {accessToken ? (
        <>
          <AppTab.Navigator
            screenOptions={{
              headerShown: false,
              tabBarStyle: {
                backgroundColor: colors.surface,
                borderTopColor: colors.border,
                borderTopWidth: 1,
              },
              tabBarActiveTintColor: colors.primary,
              tabBarInactiveTintColor: colors.textMuted,
              tabBarLabelStyle: { fontSize: 11 },
            }}
          >
            <AppTab.Screen
              name="Chats"
              component={ChatsTab}
              options={{
                tabBarLabel: 'Чаты',
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="chatbubbles-outline" size={size} color={color} />
                ),
              }}
            />
            <AppTab.Screen
              name="Settings"
              component={SettingsScreen}
              options={{
                tabBarLabel: 'Профиль',
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="person-outline" size={size} color={color} />
                ),
                headerShown: true,
                title: 'Профиль',
                headerStyle: { backgroundColor: colors.surface },
                headerTintColor: colors.text,
              }}
            />
          </AppTab.Navigator>
          <InAppBanner />
        </>
      ) : (
        <AuthStack.Navigator
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <AuthStack.Screen name="Login" component={LoginScreen} />
          <AuthStack.Screen name="Register" component={RegisterScreen} />
        </AuthStack.Navigator>
      )}
    </NavigationContainer>
  );
}
