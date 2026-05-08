import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { p256 } from '@noble/curves/p256';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { apiClient } from '../shared/api/client';
import { useAuthStore } from '../shared/store/auth';
import {
  generateIdentityKeyPair,
  storeIdentityKey,
  loadIdentityKey,
  pubKeyToSpkiB64,
  computeFingerprint,
} from '../shared/crypto/e2ee';
import { theme } from '../shared/theme';
import type { AuthStackParams } from '../navigation';

type Props = NativeStackScreenProps<AuthStackParams, 'Login'>;

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  user_id: string;
  device_id: string;
}

export function LoginScreen({ navigation }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const passwordRef = useRef<TextInput>(null);
  const { setSession } = useAuthStore();

  async function handleLogin() {
    if (!username.trim() || !password.trim()) return;
    setLoading(true);
    let keyPair: { privateKey: Uint8Array; publicKey: Uint8Array; publicKeySpki: string; fingerprint: string } | null = null;

    try {
      const storedPrivKey = await loadIdentityKey().catch(() => null);
      if (storedPrivKey) {
        const pub = p256.getPublicKey(storedPrivKey, false);
        const spki = pubKeyToSpkiB64(pub);
        const fp = computeFingerprint(spki);
        keyPair = { privateKey: storedPrivKey, publicKey: pub, publicKeySpki: spki, fingerprint: fp };
      } else {
        keyPair = await generateIdentityKeyPair();
        await storeIdentityKey(keyPair.privateKey).catch(() => null);
      }
    } catch (cryptoErr: unknown) {
      Alert.alert(
        'Ошибка устройства',
        `Не удалось создать ключ шифрования: ${(cryptoErr as Error)?.message ?? String(cryptoErr)}`,
      );
      setLoading(false);
      return;
    }

    try {
      const res = await apiClient.post<TokenResponse>('/auth/login', {
        username: username.trim(),
        password,
        device_name: `${Platform.OS === 'ios' ? 'iPhone' : 'Android'} App`,
        device_type: 'mobile',
        platform: Platform.OS,
        public_identity_key: keyPair.publicKeySpki,
        public_key_fingerprint: keyPair.fingerprint,
      });

      setSession(res.data.access_token, res.data.refresh_token, res.data.user_id, res.data.device_id);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: unknown } }; message?: string };
      const rawDetail = e?.response?.data?.detail;
      const msg =
        typeof rawDetail === 'string'
          ? rawDetail
          : Array.isArray(rawDetail)
            ? (rawDetail as Array<{ msg?: string }>).map((d) => d.msg ?? JSON.stringify(d)).join('; ')
            : e?.message ?? 'Неизвестная ошибка';
      Alert.alert('Ошибка входа', msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View entering={FadeInUp.duration(600).springify()} style={styles.logo}>
          <Text style={styles.logoText}>Minimum</Text>
          <Text style={styles.tagline}>Безопасный мессенджер</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(100).duration(500).springify()} style={styles.card}>
          <Text style={styles.cardTitle}>Войти</Text>

          <View style={styles.field}>
            <Text style={styles.label}>Имя пользователя</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              blurOnSubmit={false}
              placeholderTextColor={theme.colors.textMuted}
              placeholder="username"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Пароль</Text>
            <TextInput
              ref={passwordRef}
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              returnKeyType="done"
              onSubmitEditing={handleLogin}
              placeholderTextColor={theme.colors.textMuted}
              placeholder="••••••••"
            />
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.buttonText}>Войти</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.link}
            onPress={() => navigation.navigate('Register')}
          >
            <Text style={styles.linkText}>
              Нет аккаунта?{' '}
              <Text style={styles.linkAccent}>Зарегистрироваться</Text>
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.xxl,
  },
  logo: { alignItems: 'center', marginBottom: theme.spacing.xxl },
  logoText: {
    fontSize: 32,
    fontWeight: '700',
    color: theme.colors.text,
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: theme.font.sm,
    color: theme.colors.textMuted,
    marginTop: theme.spacing.xs,
  },
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cardTitle: {
    fontSize: theme.font.xl,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
  },
  field: { marginBottom: theme.spacing.md },
  label: {
    fontSize: theme.font.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
    fontWeight: '500',
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 12,
    color: theme.colors.text,
    fontSize: theme.font.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  button: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: theme.spacing.sm,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: {
    color: '#fff',
    fontSize: theme.font.md,
    fontWeight: '600',
  },
  link: { marginTop: theme.spacing.lg, alignItems: 'center' },
  linkText: { fontSize: theme.font.sm, color: theme.colors.textMuted },
  linkAccent: { color: theme.colors.primary, fontWeight: '500' },
});
