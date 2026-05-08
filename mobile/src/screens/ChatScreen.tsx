import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
  ActivityIndicator,
  Image,
  Pressable,
  Modal,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
} from 'react-native-reanimated';
import { KeyboardAvoidingView } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { apiClient } from '../shared/api/client';
import { wsClient } from '../shared/api/websocket';
import { useChatStore } from '../shared/store/chat';
import { useAuthStore } from '../shared/store/auth';
import { useTheme } from '../shared/hooks/useTheme';
import type { ThemeColors } from '../shared/theme';
import type { Message } from '../entities/message/types';
import type { User } from '../entities/user/types';
import {
  loadIdentityKey,
  deriveSharedAesKey,
  encryptWithKey,
  decryptWithKey,
  isEncrypted,
  spkiB64ToPubKey,
} from '../shared/crypto/e2ee';
import type { Device } from '../entities/device/types';
import type { ChatsStackParams } from '../navigation';

type Props = NativeStackScreenProps<ChatsStackParams, 'Chat'>;

type ListItem =
  | { kind: 'message'; data: Message }
  | { kind: 'date'; label: string; key: string };

function formatMsgTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function calDay(iso: string): number {
  const d = new Date(iso);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function formatDateLabel(iso: string): string {
  const todayStart = calDay(new Date().toISOString());
  const dStart = calDay(iso);
  const diffDays = Math.round((todayStart - dStart) / 86_400_000);
  if (diffDays === 0) return 'Сегодня';
  if (diffDays === 1) return 'Вчера';
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function sameDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / 1_048_576).toFixed(1)} МБ`;
}

interface AttachmentMeta {
  name: string;
  type: string;
}

function parseAttachmentMeta(payload: string): AttachmentMeta {
  try {
    const p = JSON.parse(payload) as AttachmentMeta;
    if (p.name) return p;
  } catch {
    // not JSON
  }
  return { name: payload || 'файл', type: '' };
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    listContent: { paddingHorizontal: 12, paddingVertical: 8 },
    typingBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 16,
      paddingVertical: 6,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    typingDots: { flexDirection: 'row', gap: 3, alignItems: 'center' },
    typingDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: colors.primary },
    typingLabel: { fontSize: 12, color: colors.primary },
    emptyChat: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
    emptyChatText: { fontSize: 15, color: colors.textSecondary, fontWeight: '500' },
    emptyChatHint: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
    dateSepWrap: { alignItems: 'center', marginVertical: 12 },
    dateSep: {
      backgroundColor: colors.card,
      borderRadius: 9999,
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderWidth: 1,
      borderColor: colors.border,
    },
    dateSepText: { fontSize: 11, color: colors.textMuted },
    msgRow: { flexDirection: 'row', marginVertical: 2, alignItems: 'flex-end', gap: 4 },
    msgRowLeft: { justifyContent: 'flex-start' },
    msgRowRight: { justifyContent: 'flex-end' },
    msgAvatar: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: `${colors.primary}30`,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    msgAvatarText: { fontSize: 11, fontWeight: '600', color: colors.primary },
    bubble: { maxWidth: '78%', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8 },
    bubbleMine: { backgroundColor: colors.outgoing, borderBottomRightRadius: 4 },
    bubbleTheirs: {
      backgroundColor: colors.incoming,
      borderBottomLeftRadius: 4,
      borderWidth: 1,
      borderColor: colors.border,
    },
    senderName: { fontSize: 11, fontWeight: '600', color: colors.primary, marginBottom: 3 },
    msgText: { fontSize: 15, lineHeight: 21 },
    msgTextMine: { color: colors.outgoingText },
    msgTextTheirs: { color: colors.incomingText },
    deletedText: { fontSize: 13, fontStyle: 'italic', color: colors.textMuted },
    deletedTextMine: { color: `${colors.outgoingText}70` },
    msgMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 3,
      marginTop: 3,
    },
    msgTime: { fontSize: 10 },
    msgTimeMine: { color: `${colors.outgoingText}70` },
    msgTimeTheirs: { color: colors.textMuted },
    deliveryCheck: { fontSize: 11, fontWeight: '700' },
    imgContainer: { maxWidth: 220 },
    imgPlaceholder: {
      width: 180,
      height: 120,
      borderRadius: 12,
      backgroundColor: `${colors.primary}15`,
      alignItems: 'center',
      justifyContent: 'center',
    },
    attachImage: { width: 220, height: 160, borderRadius: 12 },
    attachName: { fontSize: 11, marginTop: 3 },
    fileCard: { flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: 220 },
    fileIcon: {
      width: 36,
      height: 36,
      borderRadius: 8,
      backgroundColor: `${colors.primary}20`,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    fileIconText: { fontSize: 18 },
    fileMeta: { flex: 1 },
    fileName: { fontSize: 13, fontWeight: '500' },
    fileHint: { fontSize: 11, marginTop: 1 },
    attachBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: colors.card,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      gap: 8,
    },
    attachBarName: { flex: 1, fontSize: 13, color: colors.textSecondary },
    attachBarRemove: { fontSize: 14, color: colors.textMuted, padding: 4 },
    composer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      gap: 4,
    },
    attachBtn: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      marginBottom: 2,
    },
    attachBtnIcon: { fontSize: 20 },
    input: {
      flex: 1,
      backgroundColor: colors.card,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingTop: Platform.OS === 'ios' ? 10 : 8,
      paddingBottom: Platform.OS === 'ios' ? 10 : 8,
      color: colors.text,
      fontSize: 15,
      maxHeight: 120,
      borderWidth: 1,
      borderColor: colors.border,
    },
    sendBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      marginBottom: 2,
    },
    sendBtnDisabled: { backgroundColor: colors.border },
    sendBtnIcon: { color: '#fff', fontSize: 18, fontWeight: '700', lineHeight: 22 },
    verifyOverlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    verifyCard: {
      backgroundColor: colors.card,
      borderRadius: 20,
      padding: 24,
      width: '100%',
      borderWidth: 1,
      borderColor: colors.border,
    },
    verifyTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 6 },
    verifySubtitle: { fontSize: 13, color: colors.textSecondary, marginBottom: 20, lineHeight: 18 },
    verifySection: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 12,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    verifySectionLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: 6,
    },
    verifyFingerprint: {
      fontSize: 13,
      color: colors.text,
      fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
      lineHeight: 20,
    },
    verifyClose: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
      marginTop: 4,
    },
    verifyCloseText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  });
}

function DeliveryIcon({
  delivered,
  read,
  colors,
}: {
  delivered: boolean;
  read: boolean;
  colors: ThemeColors;
}) {
  const color = read
    ? '#60a5fa'
    : delivered
      ? `${colors.outgoingText}80`
      : `${colors.outgoingText}50`;
  return (
    <Text style={{ fontSize: 11, fontWeight: '700', color }}>
      {delivered || read ? '✓✓' : '✓'}
    </Text>
  );
}

function TypingDots({ colors }: { colors: ThemeColors }) {
  const dot1 = useSharedValue(0);
  const dot2 = useSharedValue(0);
  const dot3 = useSharedValue(0);

  useEffect(() => {
    dot1.value = withRepeat(
      withSequence(withTiming(1, { duration: 300 }), withTiming(0, { duration: 300 })),
      -1,
    );
    setTimeout(() => {
      dot2.value = withRepeat(
        withSequence(withTiming(1, { duration: 300 }), withTiming(0, { duration: 300 })),
        -1,
      );
    }, 150);
    setTimeout(() => {
      dot3.value = withRepeat(
        withSequence(withTiming(1, { duration: 300 }), withTiming(0, { duration: 300 })),
        -1,
      );
    }, 300);
  }, []);

  const s1 = useAnimatedStyle(() => ({ opacity: 0.3 + dot1.value * 0.7, transform: [{ translateY: -dot1.value * 3 }] }));
  const s2 = useAnimatedStyle(() => ({ opacity: 0.3 + dot2.value * 0.7, transform: [{ translateY: -dot2.value * 3 }] }));
  const s3 = useAnimatedStyle(() => ({ opacity: 0.3 + dot3.value * 0.7, transform: [{ translateY: -dot3.value * 3 }] }));

  const dotStyle = {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.primary,
  };

  return (
    <View style={{ flexDirection: 'row', gap: 3, alignItems: 'center' }}>
      <Animated.View style={[dotStyle, s1]} />
      <Animated.View style={[dotStyle, s2]} />
      <Animated.View style={[dotStyle, s3]} />
    </View>
  );
}

function AttachmentPreview({
  attachmentId,
  payload,
  isMine,
  colors,
  styles,
}: {
  attachmentId: string;
  payload: string;
  isMine: boolean;
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
}) {
  const meta = parseAttachmentMeta(payload);
  const isImage = meta.type.startsWith('image/');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(isImage);

  useEffect(() => {
    if (!isImage) return;
    let cancelled = false;
    apiClient
      .get(`/attachments/${attachmentId}/download`, { responseType: 'arraybuffer' })
      .then((res) => {
        if (cancelled) return;
        const bytes = new Uint8Array(res.data as ArrayBuffer);
        let binary = '';
        bytes.forEach((b) => (binary += String.fromCharCode(b)));
        setImageUri(`data:${meta.type};base64,${btoa(binary)}`);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    return () => { cancelled = true; };
  }, [attachmentId, isImage, meta.type]);

  async function handleDownload() {
    try {
      await apiClient.get(`/attachments/${attachmentId}/download`, { responseType: 'arraybuffer' });
      Alert.alert('Скачано', `Файл "${meta.name}" загружен`);
    } catch {
      Alert.alert('Ошибка', 'Не удалось скачать файл');
    }
  }

  if (isImage) {
    return (
      <Pressable onPress={handleDownload}>
        <View style={styles.imgContainer}>
          {loading || !imageUri ? (
            <View style={styles.imgPlaceholder}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <Image source={{ uri: imageUri }} style={styles.attachImage} resizeMode="cover" />
          )}
          <Text style={[styles.attachName, { color: isMine ? `${colors.outgoingText}80` : colors.textMuted }]}>
            {meta.name}
          </Text>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable style={styles.fileCard} onPress={handleDownload}>
      <View style={styles.fileIcon}>
        <Text style={styles.fileIconText}>📎</Text>
      </View>
      <View style={styles.fileMeta}>
        <Text
          style={[styles.fileName, { color: isMine ? colors.outgoingText : colors.text }]}
          numberOfLines={1}
        >
          {meta.name}
        </Text>
        <Text style={[styles.fileHint, { color: isMine ? `${colors.outgoingText}70` : colors.textMuted }]}>
          скачать
        </Text>
      </View>
    </Pressable>
  );
}

interface PendingAttachment {
  uri: string;
  name: string;
  type: string;
  size: number;
  serverId: string | null;
  uploading: boolean;
}

export function ChatScreen({ route, navigation }: Props) {
  const { chatId, chatType, otherUserId } = route.params;
  const isGroup = chatType === 'group';
  const { userId } = useAuthStore();
  const { typingUsers, deliveryStatuses, clearUnread, setActiveChatId } = useChatStore();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const listRef = useRef<FlashList<ListItem>>(null);
  const [text, setText] = useState('');
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const [showVerify, setShowVerify] = useState(false);
  const [sharedKey, setSharedKey] = useState<Uint8Array | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);
  const markedReadRef = useRef(new Set<string>());
  const activeChatIdRef = useRef(chatId);
  const sendScale = useSharedValue(1);

  useEffect(() => { activeChatIdRef.current = chatId; }, [chatId]);

  useEffect(() => {
    setActiveChatId(chatId);
    return () => setActiveChatId(null);
  }, [chatId, setActiveChatId]);

  useEffect(() => {
    clearUnread(chatId);
    return () => { markedReadRef.current.clear(); };
  }, [chatId, clearUnread]);

  const { data: theirDevices } = useQuery<Device[]>({
    queryKey: ['user-devices', otherUserId],
    queryFn: async () => (await apiClient.get(`/users/${otherUserId}/devices`)).data as Device[],
    enabled: !!otherUserId,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (!otherUserId || !theirDevices?.length) return;
    const dev = theirDevices.find((d) => d.is_active && d.public_identity_key)
      ?? theirDevices.find((d) => d.public_identity_key);
    if (!dev?.public_identity_key) return;
    loadIdentityKey()
      .then((myPriv) => {
        if (!myPriv) return;
        const theirPub = spkiB64ToPubKey(dev.public_identity_key!);
        setSharedKey(deriveSharedAesKey(myPriv, theirPub));
      })
      .catch(() => {});
  }, [otherUserId, theirDevices]);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', gap: 8, marginRight: 4 }}>
          {!!otherUserId && (
            <TouchableOpacity onPress={() => setShowVerify(true)} hitSlop={8}>
              <Ionicons name="shield-checkmark-outline" size={22} color={colors.primary} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => Alert.alert('Звонки', 'Появятся в следующем обновлении')}
            hitSlop={8}
          >
            <Ionicons name="call-outline" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, otherUserId, colors]);

  const { data: messages = [], isLoading } = useQuery<Message[]>({
    queryKey: ['messages', chatId],
    queryFn: async () => {
      const res = await apiClient.get(`/chats/${chatId}/messages`, { params: { limit: 50 } });
      return (res.data as { items: Message[] }).items;
    },
  });

  const { data: me } = useQuery<User>({
    queryKey: ['users', 'me'],
    queryFn: async () => (await apiClient.get('/users/me')).data as User,
  });

  const { data: otherUser } = useQuery<User>({
    queryKey: ['users', otherUserId],
    queryFn: async () => (await apiClient.get(`/users/${otherUserId}`)).data as User,
    enabled: !!otherUserId && showVerify,
  });

  const [liveMessages, setLiveMessages] = useState<Message[]>([]);

  useEffect(() => { setLiveMessages([]); }, [chatId]);

  useEffect(() => {
    const off = wsClient.on('message.new', (raw) => {
      const p = raw as Message & {
        message_id: string;
        sender_username?: string;
        attachment_id?: string;
      };
      if (p.chat_id !== activeChatIdRef.current) return;

      const msg: Message = {
        id: p.message_id ?? p.id,
        chat_id: p.chat_id,
        sender_user_id: p.sender_user_id,
        sender_device_id: p.sender_device_id ?? '',
        client_message_id: p.client_message_id ?? '',
        encrypted_payload: p.encrypted_payload,
        encryption_version: p.encryption_version ?? 'v1',
        message_type: p.message_type ?? 'text',
        created_at: p.created_at,
        edited_at: null,
        deleted_at: null,
        sender_username: p.sender_username,
        attachment_id: p.attachment_id,
      };

      setLiveMessages((prev) => {
        if (prev.find((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });

      if (msg.sender_user_id !== userId) {
        void apiClient.post(`/messages/${msg.id}/delivered`).catch(() => {});
        void apiClient.post(`/messages/${msg.id}/read`).catch(() => {});
        markedReadRef.current.add(msg.id);
      }
    });
    return off;
  }, [userId]);

  const allMessages = useMemo(() => {
    const combined = [...messages];
    liveMessages.forEach((m) => {
      if (!combined.find((x) => x.id === m.id)) combined.push(m);
    });
    return combined.sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
  }, [messages, liveMessages]);

  useEffect(() => {
    const toRead = allMessages.filter(
      (m) => m.sender_user_id !== userId && !markedReadRef.current.has(m.id),
    );
    toRead.forEach((m) => {
      markedReadRef.current.add(m.id);
      void apiClient.post(`/messages/${m.id}/delivered`).catch(() => {});
      void apiClient.post(`/messages/${m.id}/read`).catch(() => {});
    });
  }, [allMessages, userId]);

  const listData = useMemo<ListItem[]>(() => {
    const items: ListItem[] = [];
    allMessages.forEach((m, i) => {
      const prev = allMessages[i - 1];
      if (!prev || !sameDay(prev.created_at, m.created_at)) {
        items.push({ kind: 'date', label: formatDateLabel(m.created_at), key: `d-${m.created_at}` });
      }
      items.push({ kind: 'message', data: m });
    });
    return items;
  }, [allMessages]);

  const invertedData = useMemo(() => [...listData].reverse(), [listData]);

  const typing = typingUsers[chatId] ?? [];

  const usernameMap = useMemo(() => {
    const map: Record<string, string> = {};
    allMessages.forEach((m) => { if (m.sender_username) map[m.sender_user_id] = m.sender_username; });
    return map;
  }, [allMessages]);

  const typingLabel = useMemo(() => {
    if (typing.length === 0) return null;
    if (!isGroup) return 'печатает';
    const names = typing.slice(0, 2).map((uid) => usernameMap[uid] ?? 'кто-то');
    return typing.length > 2
      ? `${names.join(', ')} и ещё ${typing.length - 2} печатают`
      : `${names.join(' и ')} печатает`;
  }, [typing, isGroup, usernameMap]);

  const sendMutation = useMutation({
    mutationFn: async ({ msg, attachmentId }: { msg: string; attachmentId?: string }) => {
      await apiClient.post('/messages', {
        chat_id: chatId,
        client_message_id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        encrypted_payload: msg,
        encryption_version: 'v1',
        message_type: attachmentId ? 'attachment' : 'text',
        group_keys: [],
        ...(attachmentId ? { attachment_id: attachmentId } : {}),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', chatId] });
      setText('');
      setPendingAttachment(null);
    },
    onError: () => Alert.alert('Ошибка', 'Не удалось отправить сообщение'),
  });

  async function handlePickImage() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Нет доступа', 'Разрешите доступ к галерее в настройках');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.9,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if ((asset.fileSize ?? 0) > 100 * 1024 * 1024) {
      Alert.alert('Файл слишком большой', 'Максимум 100 МБ');
      return;
    }

    const fileName = asset.fileName ?? `image_${Date.now()}.jpg`;
    const mimeType = asset.mimeType ?? 'image/jpeg';

    setPendingAttachment({ uri: asset.uri, name: fileName, type: mimeType, size: asset.fileSize ?? 0, serverId: null, uploading: true });

    try {
      const form = new FormData();
      form.append('file', { uri: asset.uri, name: fileName, type: mimeType } as unknown as Blob);
      const res = await apiClient.post<{ id: string }>('/attachments/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setPendingAttachment((prev) => prev ? { ...prev, serverId: res.data.id, uploading: false } : null);
    } catch {
      setPendingAttachment(null);
      Alert.alert('Ошибка', 'Не удалось загрузить файл');
    }
  }

  function handleTyping(value: string) {
    setText(value);
    if (!isTypingRef.current && value.trim()) {
      isTypingRef.current = true;
      wsClient.send('typing.started', { chat_id: chatId });
    }
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      if (isTypingRef.current) {
        isTypingRef.current = false;
        wsClient.send('typing.stopped', { chat_id: chatId });
      }
    }, 3000);
  }

  function handleSend() {
    const hasAttachment = pendingAttachment?.serverId != null;
    const hasText = text.trim().length > 0;
    if ((!hasText && !hasAttachment) || sendMutation.isPending || pendingAttachment?.uploading) return;

    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    if (isTypingRef.current) {
      isTypingRef.current = false;
      wsClient.send('typing.stopped', { chat_id: chatId });
    }

    sendScale.value = withSequence(
      withSpring(0.9, { duration: 80 }),
      withSpring(1, { duration: 120 }),
    );

    const encrypt = (s: string) => !isGroup && sharedKey ? encryptWithKey(s, sharedKey) : s;

    if (hasAttachment) {
      const att = pendingAttachment!;
      const payload = JSON.stringify({ name: att.name, type: att.type });
      sendMutation.mutate({ msg: encrypt(text.trim() || payload), attachmentId: att.serverId! });
    } else {
      sendMutation.mutate({ msg: encrypt(text.trim()) });
    }
  }

  const sendButtonStyle = useAnimatedStyle(() => ({ transform: [{ scale: sendScale.value }] }));

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => {
      if (item.kind === 'date') {
        return (
          <View style={styles.dateSepWrap}>
            <View style={styles.dateSep}>
              <Text style={styles.dateSepText}>{item.label}</Text>
            </View>
          </View>
        );
      }

      const m = item.data;
      const isMine = m.sender_user_id === userId;
      const ds = deliveryStatuses[m.id];
      const isDeleted = !!m.deleted_at;

      return (
        <Animated.View
          entering={FadeInDown.duration(250).springify()}
          style={[styles.msgRow, isMine ? styles.msgRowRight : styles.msgRowLeft]}
        >
          {isGroup && !isMine && (
            <View style={styles.msgAvatar}>
              <Text style={styles.msgAvatarText}>
                {(m.sender_username ?? '?')[0]?.toUpperCase()}
              </Text>
            </View>
          )}
          <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
            {isGroup && !isMine && m.sender_username && (
              <Text style={styles.senderName}>@{m.sender_username}</Text>
            )}
            {isDeleted ? (
              <Text style={[styles.deletedText, isMine && styles.deletedTextMine]}>
                Сообщение удалено
              </Text>
            ) : m.message_type === 'attachment' && m.attachment_id ? (
              <AttachmentPreview
                attachmentId={m.attachment_id}
                payload={m.encrypted_payload}
                isMine={isMine}
                colors={colors}
                styles={styles}
              />
            ) : (
              <Text style={[styles.msgText, isMine ? styles.msgTextMine : styles.msgTextTheirs]}>
                {!isGroup && sharedKey
                  ? decryptWithKey(m.encrypted_payload, sharedKey)
                  : m.encrypted_payload}
              </Text>
            )}
            <View style={styles.msgMeta}>
              <Text style={[styles.msgTime, isMine ? styles.msgTimeMine : styles.msgTimeTheirs]}>
                {formatMsgTime(m.created_at)}
              </Text>
              {isMine && !isDeleted && (
                <DeliveryIcon delivered={ds?.delivered ?? false} read={ds?.read ?? false} colors={colors} />
              )}
            </View>
          </View>
        </Animated.View>
      );
    },
    [userId, deliveryStatuses, isGroup, sharedKey, styles, colors],
  );

  const keyExtractor = useCallback(
    (item: ListItem) => (item.kind === 'date' ? item.key : item.data.id),
    [],
  );

  const canSend =
    (text.trim().length > 0 || pendingAttachment?.serverId != null) &&
    !sendMutation.isPending &&
    !pendingAttachment?.uploading;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {typingLabel && (
        <View style={styles.typingBar}>
          <TypingDots colors={colors} />
          <Text style={styles.typingLabel}>{typingLabel}</Text>
        </View>
      )}

      {isLoading ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlashList
          ref={listRef}
          data={invertedData}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          estimatedItemSize={64}
          inverted
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <Text style={styles.emptyChatText}>Нет сообщений</Text>
              <Text style={styles.emptyChatHint}>Напишите первым!</Text>
            </View>
          }
        />
      )}

      {pendingAttachment && (
        <View style={styles.attachBar}>
          <Text style={styles.attachBarName} numberOfLines={1}>
            {pendingAttachment.uploading ? '⏳ ' : '📎 '}
            {pendingAttachment.name}
            {pendingAttachment.size > 0 ? ` · ${formatBytes(pendingAttachment.size)}` : ''}
          </Text>
          <TouchableOpacity onPress={() => setPendingAttachment(null)}>
            <Text style={styles.attachBarRemove}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.composer}>
        <TouchableOpacity style={styles.attachBtn} onPress={handlePickImage} activeOpacity={0.7}>
          <Text style={styles.attachBtnIcon}>📎</Text>
        </TouchableOpacity>

        <TextInput
          style={styles.input}
          value={text}
          onChangeText={handleTyping}
          placeholder="Сообщение..."
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={4000}
          returnKeyType="default"
        />

        <Animated.View style={sendButtonStyle}>
          <TouchableOpacity
            style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!canSend}
            activeOpacity={0.8}
          >
            <Text style={styles.sendBtnIcon}>↑</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>

      <Modal
        visible={showVerify}
        transparent
        animationType="fade"
        onRequestClose={() => setShowVerify(false)}
      >
        <TouchableOpacity
          style={styles.verifyOverlay}
          activeOpacity={1}
          onPress={() => setShowVerify(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.verifyCard}>
            <Text style={styles.verifyTitle}>Проверка шифрования</Text>
            <Text style={styles.verifySubtitle}>
              Сравните отпечатки ключей с собеседником для подтверждения безопасности
            </Text>

            <View style={styles.verifySection}>
              <Text style={styles.verifySectionLabel}>Ваш ключ</Text>
              <Text style={styles.verifyFingerprint} selectable>
                {me?.public_key_fingerprint ?? '—'}
              </Text>
            </View>

            <View style={styles.verifySection}>
              <Text style={styles.verifySectionLabel}>Ключ собеседника</Text>
              <Text style={styles.verifyFingerprint} selectable>
                {otherUser?.public_key_fingerprint ?? (otherUserId ? '...' : '—')}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.verifyClose}
              onPress={() => setShowVerify(false)}
            >
              <Text style={styles.verifyCloseText}>Закрыть</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}
