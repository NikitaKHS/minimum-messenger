import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuthStore } from '../shared/store/auth';
import { wsClient, initWsClient } from '../shared/api/websocket';
import { initApiClient } from '../shared/api/client';
import { initAuthApi, refreshAccessToken } from '../shared/api/auth';
import { useChatStore } from '../shared/store/chat';
import { theme } from '../shared/theme';

import { LoginScreen } from '../screens/LoginScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { ChatListScreen } from '../screens/ChatListScreen';
import { ChatScreen } from '../screens/ChatScreen';
import { SettingsScreen } from '../screens/SettingsScreen';

export type AuthStackParams = {
  Login: undefined;
  Register: undefined;
};

export type ChatsStackParams = {
  ChatList: undefined;
  Chat: { chatId: string; chatTitle: string; chatType: 'direct' | 'group' | 'system' };
};

export type AppTabParams = {
  Chats: undefined;
  Settings: undefined;
};

const AuthStack = createNativeStackNavigator<AuthStackParams>();
const ChatsStack = createNativeStackNavigator<ChatsStackParams>();
const AppTab = createBottomTabNavigator<AppTabParams>();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: theme.colors.background,
    card: theme.colors.surface,
    text: theme.colors.text,
    border: theme.colors.border,
    primary: theme.colors.primary,
  },
};

function ChatsTab() {
  return (
    <ChatsStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.text,
        headerTitleStyle: { color: theme.colors.text, fontWeight: '600' },
        contentStyle: { backgroundColor: theme.colors.background },
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

function ChatIcon({ color, size }: { color: string; size: number }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: size * 0.9,
          height: size * 0.75,
          borderRadius: size * 0.2,
          borderWidth: 2,
          borderColor: color,
        }}
      />
    </View>
  );
}

function SettingsIcon({ color, size }: { color: string; size: number }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: size * 0.55,
          height: size * 0.55,
          borderRadius: size * 0.275,
          borderWidth: 2,
          borderColor: color,
        }}
      />
    </View>
  );
}

export function Navigation() {
  const { accessToken, refreshToken, userId, initialized, logout, setTokens } = useAuthStore();
  const { incUnread, setLastMessage, setDelivered, setRead, setTyping } = useChatStore();

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
      };
      if (p.sender_user_id !== userId) {
        incUnread(p.chat_id);
      }
      setLastMessage(p.chat_id, {
        text: p.encrypted_payload,
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
      <View style={{ flex: 1, backgroundColor: theme.colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={theme.colors.primary} size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      {accessToken ? (
        <AppTab.Navigator
          screenOptions={{
            headerShown: false,
            tabBarStyle: {
              backgroundColor: theme.colors.surface,
              borderTopColor: theme.colors.border,
              borderTopWidth: 1,
            },
            tabBarActiveTintColor: theme.colors.primary,
            tabBarInactiveTintColor: theme.colors.textMuted,
            tabBarLabelStyle: { fontSize: 11 },
          }}
        >
          <AppTab.Screen
            name="Chats"
            component={ChatsTab}
            options={{
              tabBarLabel: 'Чаты',
              tabBarIcon: ({ color, size }) => <ChatIcon color={color} size={size} />,
            }}
          />
          <AppTab.Screen
            name="Settings"
            component={SettingsScreen}
            options={{
              tabBarLabel: 'Профиль',
              tabBarIcon: ({ color, size }) => <SettingsIcon color={color} size={size} />,
              headerShown: true,
              title: 'Профиль',
              headerStyle: { backgroundColor: theme.colors.surface },
              headerTintColor: theme.colors.text,
            }}
          />
        </AppTab.Navigator>
      ) : (
        <AuthStack.Navigator
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: theme.colors.background },
          }}
        >
          <AuthStack.Screen name="Login" component={LoginScreen} />
          <AuthStack.Screen name="Register" component={RegisterScreen} />
        </AuthStack.Navigator>
      )}
    </NavigationContainer>
  );
}
