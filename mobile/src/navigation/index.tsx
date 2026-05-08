import React, { useEffect } from 'react';
import {
  AppState,
  Platform,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { NavigationContainer, DarkTheme, DefaultTheme, DrawerActions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  createDrawerNavigator,
  DrawerContentScrollView,
  type DrawerContentComponentProps,
} from '@react-navigation/drawer';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../shared/store/auth';
import { wsClient, initWsClient } from '../shared/api/websocket';
import { initApiClient } from '../shared/api/client';
import { initAuthApi, refreshAccessToken } from '../shared/api/auth';
import { useChatStore } from '../shared/store/chat';
import { useTheme } from '../shared/hooks/useTheme';
import { useSettingsStore } from '../shared/store/settings';
import { isEncrypted } from '../shared/crypto/e2ee';
import { navigationRef } from '../shared/navigation/ref';
import { InAppBanner } from '../shared/components/InAppBanner';
import { apiClient } from '../shared/api/client';
import type { ThemeColors } from '../shared/theme';
import type { User } from '../entities/user/types';

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

export type AppDrawerParams = {
  Main: undefined;
  Settings: undefined;
};

const AuthStack = createNativeStackNavigator<AuthStackParams>();
const ChatsStack = createNativeStackNavigator<ChatsStackParams>();
const AppDrawer = createDrawerNavigator<AppDrawerParams>();

function makeDrawerStyles(colors: ThemeColors) {
  return StyleSheet.create({
    drawerContainer: { flex: 1, backgroundColor: colors.background },
    header: {
      padding: 20,
      paddingTop: 16,
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    avatar: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: `${colors.primary}25`,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 10,
    },
    avatarText: { fontSize: 20, fontWeight: '700', color: colors.primary },
    username: { fontSize: 16, fontWeight: '600', color: colors.text },
    email: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
    navSection: { flex: 1, paddingTop: 8 },
    navItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingHorizontal: 20,
      paddingVertical: 13,
    },
    navItemActive: { backgroundColor: `${colors.primary}15`, borderRadius: 12, marginHorizontal: 8 },
    navLabel: { fontSize: 15, color: colors.text },
    navLabelActive: { color: colors.primary, fontWeight: '600' },
    footer: {
      paddingHorizontal: 12,
      paddingVertical: 16,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    logoutBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingHorizontal: 12,
      paddingVertical: 12,
      borderRadius: 12,
    },
    logoutLabel: { fontSize: 15, color: colors.destructive },
  });
}

function CustomDrawerContent({ state, navigation }: DrawerContentComponentProps) {
  const { colors } = useTheme();
  const { logout } = useAuthStore();
  const { toggleTheme, isDark } = useSettingsStore();
  const styles = React.useMemo(() => makeDrawerStyles(colors), [colors]);

  const { data: me } = useQuery<User>({
    queryKey: ['users', 'me'],
    queryFn: async () => (await apiClient.get('/users/me')).data as User,
  });

  const activeRoute = state.routes[state.index]?.name;

  async function handleLogout() {
    try {
      const { refreshToken } = useAuthStore.getState();
      if (refreshToken) {
        await apiClient.post('/auth/logout', { refresh_token: refreshToken }).catch(() => {});
      }
      wsClient.disconnect();
      logout();
    } catch { /* ignore */ }
  }

  return (
    <DrawerContentScrollView
      scrollEnabled={false}
      contentContainerStyle={{ flex: 1 }}
      style={styles.drawerContainer}
    >
      {/* User profile header */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(me?.username?.[0] ?? '?').toUpperCase()}
          </Text>
        </View>
        <Text style={styles.username}>@{me?.username ?? '…'}</Text>
        {me?.email ? <Text style={styles.email}>{me.email}</Text> : null}
      </View>

      {/* Navigation items */}
      <View style={styles.navSection}>
        <TouchableOpacity
          style={[styles.navItem, activeRoute === 'Main' && styles.navItemActive]}
          onPress={() => navigation.navigate('Main')}
          activeOpacity={0.7}
        >
          <Ionicons
            name="chatbubbles-outline"
            size={22}
            color={activeRoute === 'Main' ? colors.primary : colors.textMuted}
          />
          <Text style={[styles.navLabel, activeRoute === 'Main' && styles.navLabelActive]}>
            Чаты
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navItem, activeRoute === 'Settings' && styles.navItemActive]}
          onPress={() => navigation.navigate('Settings')}
          activeOpacity={0.7}
        >
          <Ionicons
            name="person-outline"
            size={22}
            color={activeRoute === 'Settings' ? colors.primary : colors.textMuted}
          />
          <Text style={[styles.navLabel, activeRoute === 'Settings' && styles.navLabelActive]}>
            Профиль
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          onPress={toggleTheme}
          activeOpacity={0.7}
        >
          <Ionicons
            name={isDark ? 'moon-outline' : 'sunny-outline'}
            size={22}
            color={colors.textMuted}
          />
          <Text style={styles.navLabel}>
            {isDark ? 'Тёмная тема' : 'Светлая тема'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Footer: logout */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.7}>
          <Ionicons name="log-out-outline" size={22} color={colors.destructive} />
          <Text style={styles.logoutLabel}>Выйти</Text>
        </TouchableOpacity>
      </View>
    </DrawerContentScrollView>
  );
}

function MainStack() {
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
        options={({ navigation }) => ({
          title: 'Minimum',
          headerLeft: () => (
            <TouchableOpacity
              onPress={() =>
                navigation.getParent()?.dispatch(DrawerActions.openDrawer())
              }
              style={{ paddingRight: 8 }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="menu-outline" size={24} color={colors.text} />
            </TouchableOpacity>
          ),
        })}
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
          <AppDrawer.Navigator
            drawerContent={(props) => <CustomDrawerContent {...props} />}
            screenOptions={{
              headerShown: false,
              drawerType: 'slide',
              drawerStyle: { width: 280, backgroundColor: colors.background },
              overlayColor: 'rgba(0,0,0,0.4)',
              swipeEdgeWidth: 32,
            }}
          >
            <AppDrawer.Screen name="Main" component={MainStack} />
            <AppDrawer.Screen
              name="Settings"
              component={SettingsScreen}
              options={{
                headerShown: true,
                title: 'Профиль',
                headerStyle: { backgroundColor: colors.surface },
                headerTintColor: colors.text,
              }}
            />
          </AppDrawer.Navigator>
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
