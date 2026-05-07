import React, { useState } from 'react';
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
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../shared/api/client';
import { useAuthStore } from '../shared/store/auth';
import { wsClient } from '../shared/api/websocket';
import { deleteIdentityKey } from '../shared/crypto/e2ee';
import { theme } from '../shared/theme';
import type { User } from '../entities/user/types';

function initials(name: string): string {
  return (name[0] ?? '?').toUpperCase();
}

export function SettingsScreen() {
  const { userId, deviceId, logout } = useAuthStore();
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
        <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 40 }} />
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

          <Animated.View entering={FadeInDown.delay(80).duration(400)} style={styles.section}>
            <Text style={styles.sectionTitle}>Безопасность</Text>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>ID устройства</Text>
              <Text style={styles.infoValue} numberOfLines={1} ellipsizeMode="middle">
                {deviceId ?? '—'}
              </Text>
            </View>

            {me?.public_key_fingerprint && (
              <TouchableOpacity style={styles.infoRow} onPress={copyFingerprint} activeOpacity={0.7}>
                <Text style={styles.infoLabel}>Отпечаток ключа</Text>
                <Text style={styles.infoValueMono} numberOfLines={2}>
                  {me.public_key_fingerprint.slice(0, 16)}…
                </Text>
                <Text style={styles.copyHint}>копировать</Text>
              </TouchableOpacity>
            )}
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(160).duration(400)} style={styles.section}>
            <Text style={styles.sectionTitle}>О приложении</Text>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Версия</Text>
              <Text style={styles.infoValue}>1.0.0</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Шифрование</Text>
              <Text style={styles.infoValue}>ECDH P-256 · AES-GCM-256</Text>
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
                <ActivityIndicator color={theme.colors.destructive} size="small" />
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: {
    padding: theme.spacing.lg,
    gap: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
  },
  profileCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: `${theme.colors.primary}30`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 22, fontWeight: '700', color: theme.colors.primary },
  profileInfo: { flex: 1 },
  username: { fontSize: theme.font.lg, fontWeight: '600', color: theme.colors.text },
  email: { fontSize: theme.font.sm, color: theme.colors.textMuted, marginTop: 2 },
  section: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    gap: theme.spacing.sm,
  },
  infoLabel: {
    fontSize: theme.font.sm,
    color: theme.colors.textSecondary,
    minWidth: 110,
    flexShrink: 0,
  },
  infoValue: {
    flex: 1,
    fontSize: theme.font.sm,
    color: theme.colors.text,
    textAlign: 'right',
  },
  infoValueMono: {
    flex: 1,
    fontSize: 11,
    color: theme.colors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    textAlign: 'right',
  },
  copyHint: { fontSize: 11, color: theme.colors.primary, marginLeft: 4 },
  logoutBtn: {
    backgroundColor: `${theme.colors.destructive}15`,
    borderRadius: theme.radius.xl,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: `${theme.colors.destructive}30`,
  },
  logoutBtnDisabled: { opacity: 0.5 },
  logoutText: {
    color: theme.colors.destructive,
    fontSize: theme.font.md,
    fontWeight: '600',
  },
});
