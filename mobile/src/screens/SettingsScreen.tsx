import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Clipboard,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../shared/api/client';
import { useAuthStore } from '../shared/store/auth';
import { wsClient } from '../shared/api/websocket';
import { useTheme } from '../shared/hooks/useTheme';
import { useSettingsStore } from '../shared/store/settings';
import type { ThemeColors } from '../shared/theme';
import type { User } from '../entities/user/types';

function initials(name: string): string {
  return (name[0] ?? '?').toUpperCase();
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 16, gap: 16, paddingBottom: 32 },
    profileCard: {
      backgroundColor: colors.card,
      borderRadius: 20,
      padding: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    avatar: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: `${colors.primary}30`,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: { fontSize: 22, fontWeight: '700', color: colors.primary },
    profileInfo: { flex: 1 },
    username: { fontSize: 17, fontWeight: '600', color: colors.text },
    email: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
    section: {
      backgroundColor: colors.card,
      borderRadius: 20,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
    },
    sectionTitle: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 8,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      gap: 8,
    },
    rowLabel: { fontSize: 13, color: colors.textSecondary, minWidth: 110, flexShrink: 0 },
    rowValue: { flex: 1, fontSize: 13, color: colors.text, textAlign: 'right' },
    rowValueMono: {
      flex: 1,
      fontSize: 11,
      color: colors.textSecondary,
      fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
      textAlign: 'right',
    },
    copyHint: { fontSize: 11, color: colors.primary, marginLeft: 4 },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    toggleLabel: { flex: 1, fontSize: 15, color: colors.text },
    toggleTrack: {
      width: 44,
      height: 26,
      borderRadius: 13,
      justifyContent: 'center',
      paddingHorizontal: 2,
    },
    toggleThumb: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: '#fff',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.2,
      shadowRadius: 2,
      elevation: 2,
    },
    logoutBtn: {
      backgroundColor: `${colors.destructive}15`,
      borderRadius: 20,
      paddingVertical: 14,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: `${colors.destructive}30`,
    },
    logoutBtnDisabled: { opacity: 0.5 },
    logoutText: { color: colors.destructive, fontSize: 15, fontWeight: '600' },
  });
}

export function SettingsScreen() {
  const { userId, deviceId, logout } = useAuthStore();
  const { colors, isDark } = useTheme();
  const { toggleTheme } = useSettingsStore();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [loggingOut, setLoggingOut] = useState(false);

  const { data: me, isLoading } = useQuery<User>({
    queryKey: ['users', 'me'],
    queryFn: async () => {
      const res = await apiClient.get('/users/me');
      return res.data as User;
    },
  });

  async function handleLogout() {
    Alert.alert('Выйти из аккаунта?', 'Вам нужно будет войти снова', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Выйти',
        style: 'destructive',
        onPress: async () => {
          setLoggingOut(true);
          try {
            const { refreshToken } = useAuthStore.getState();
            if (refreshToken) {
              await apiClient.post('/auth/logout', { refresh_token: refreshToken }).catch(() => {});
            }
            wsClient.disconnect();
            logout();
          } finally {
            setLoggingOut(false);
          }
        },
      },
    ]);
  }

  function copyFingerprint() {
    if (me?.public_key_fingerprint) {
      Clipboard.setString(me.public_key_fingerprint);
      Alert.alert('Скопировано', 'Отпечаток ключа скопирован в буфер обмена');
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <>
          <Animated.View entering={FadeInDown.duration(400)} style={styles.profileCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials(me?.username ?? '?')}</Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.username}>@{me?.username}</Text>
              {me?.email && <Text style={styles.email}>{me.email}</Text>}
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(60).duration(400)} style={styles.section}>
            <Text style={styles.sectionTitle}>Внешний вид</Text>
            <TouchableOpacity style={styles.toggleRow} onPress={toggleTheme} activeOpacity={0.7}>
              <Ionicons
                name={isDark ? 'moon-outline' : 'sunny-outline'}
                size={20}
                color={colors.primary}
                style={{ marginRight: 10 }}
              />
              <Text style={styles.toggleLabel}>
                {isDark ? 'Тёмная тема' : 'Светлая тема'}
              </Text>
              <View style={[styles.toggleTrack, { backgroundColor: isDark ? colors.primary : colors.border }]}>
                <View
                  style={[
                    styles.toggleThumb,
                    { alignSelf: isDark ? 'flex-end' : 'flex-start' },
                  ]}
                />
              </View>
            </TouchableOpacity>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(120).duration(400)} style={styles.section}>
            <Text style={styles.sectionTitle}>Безопасность</Text>

            <View style={styles.row}>
              <Text style={styles.rowLabel}>ID устройства</Text>
              <Text style={styles.rowValue} numberOfLines={1} ellipsizeMode="middle">
                {deviceId ?? '—'}
              </Text>
            </View>

            {me?.public_key_fingerprint && (
              <TouchableOpacity style={styles.row} onPress={copyFingerprint} activeOpacity={0.7}>
                <Text style={styles.rowLabel}>Отпечаток ключа</Text>
                <Text style={styles.rowValueMono} numberOfLines={2}>
                  {me.public_key_fingerprint.slice(0, 16)}…
                </Text>
                <Text style={styles.copyHint}>копировать</Text>
              </TouchableOpacity>
            )}
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(180).duration(400)} style={styles.section}>
            <Text style={styles.sectionTitle}>О приложении</Text>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Версия</Text>
              <Text style={styles.rowValue}>1.0.0</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Шифрование</Text>
              <Text style={styles.rowValue}>ECDH P-256 · AES-GCM-256</Text>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(240).duration(400)}>
            <TouchableOpacity
              style={[styles.logoutBtn, loggingOut && styles.logoutBtnDisabled]}
              onPress={handleLogout}
              disabled={loggingOut}
              activeOpacity={0.8}
            >
              {loggingOut ? (
                <ActivityIndicator color={colors.destructive} size="small" />
              ) : (
                <Text style={styles.logoutText}>Выйти из аккаунта</Text>
              )}
            </TouchableOpacity>
          </Animated.View>
        </>
      )}
    </ScrollView>
  );
}
