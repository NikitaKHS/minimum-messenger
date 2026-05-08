import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  FlatList,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInRight } from 'react-native-reanimated';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { apiClient } from '../shared/api/client';
import { useChatStore } from '../shared/store/chat';
import { useAuthStore } from '../shared/store/auth';
import { useSettingsStore } from '../shared/store/settings';
import { useTheme } from '../shared/hooks/useTheme';
import type { ThemeColors } from '../shared/theme';
import type { Chat } from '../entities/chat/types';
import type { User } from '../entities/user/types';
import type { ChatsStackParams } from '../navigation';

type Props = NativeStackScreenProps<ChatsStackParams, 'ChatList'>;

function calDay(iso: string): number {
  const d = new Date(iso);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function formatSidebarTime(iso: string): string {
  const d = new Date(iso);
  const todayStart = calDay(new Date().toISOString());
  const dStart = calDay(iso);
  const diffDays = Math.round((todayStart - dStart) / 86_400_000);
  if (diffDays === 0) return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Вчера';
  if (diffDays < 7) return d.toLocaleDateString('ru-RU', { weekday: 'short' });
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

function chatDisplayName(chat: Chat): string {
  if (chat.type === 'direct') return chat.other_username ? `@${chat.other_username}` : 'Личный чат';
  return chat.title ?? 'Группа';
}

function initials(name: string): string {
  const clean = name.replace('@', '');
  return (clean[0] ?? '?').toUpperCase();
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
    emptyText: { fontSize: 17, color: colors.text, fontWeight: '500' },
    emptyHint: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
    chatItem: { borderBottomWidth: 1, borderBottomColor: colors.border },
    chatItemInner: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 12,
    },
    avatar: { alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: colors.primary, fontWeight: '600' },
    pinnedAvatar: { backgroundColor: `${colors.pinned}25` },
    regularAvatar: { backgroundColor: `${colors.primary}25` },
    chatMeta: { flex: 1, gap: 3 },
    chatTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    chatNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1, marginRight: 8 },
    chatName: { fontSize: 15, fontWeight: '600', color: colors.text, flexShrink: 1 },
    chatTime: { fontSize: 12, color: colors.textMuted },
    chatBottomRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    chatPreview: { flex: 1, fontSize: 13, color: colors.textMuted, marginRight: 8 },
    badge: {
      backgroundColor: colors.primary,
      borderRadius: 10,
      minWidth: 20,
      height: 20,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 5,
    },
    badgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },
    fab: {
      position: 'absolute',
      bottom: 24,
      right: 20,
      width: 54,
      height: 54,
      borderRadius: 27,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.4,
      shadowRadius: 8,
      elevation: 8,
    },
    fabIcon: { color: '#fff', fontSize: 26, lineHeight: 30 },
    menuOverlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'flex-end',
      paddingBottom: 100,
      paddingRight: 20,
      alignItems: 'flex-end',
    },
    menu: {
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      minWidth: 160,
      overflow: 'hidden',
    },
    menuItem: { paddingHorizontal: 16, paddingVertical: 14 },
    menuItemText: { fontSize: 15, color: colors.text },
    menuDivider: { height: 1, backgroundColor: colors.border },
    modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
    modalSheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 24,
      paddingTop: 12,
      maxHeight: '75%',
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    modalHandle: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      marginBottom: 12,
    },
    modalTitle: { fontSize: 17, fontWeight: '600', color: colors.text, marginBottom: 12 },
    searchInput: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 11,
      color: colors.text,
      fontSize: 15,
      borderWidth: 1,
      borderColor: colors.border,
    },
    searchResults: { marginTop: 8, maxHeight: 240 },
    searchEmpty: { textAlign: 'center', color: colors.textMuted, padding: 12, fontSize: 13 },
    searchItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 8,
      borderRadius: 8,
    },
    searchItemSelected: { backgroundColor: `${colors.primary}15` },
    searchItemText: { flex: 1, fontSize: 15, color: colors.text },
    checkmark: { color: colors.primary, fontWeight: '700', fontSize: 16 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
    chip: {
      backgroundColor: `${colors.primary}20`,
      borderRadius: 9999,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    chipText: { fontSize: 12, color: colors.primary, fontWeight: '500' },
    createButton: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 12,
    },
    createButtonDisabled: { opacity: 0.4 },
    createButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  });
}

interface AvatarProps {
  name: string;
  size?: number;
  pinned?: boolean;
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
}

function Avatar({ name, size = 44, pinned, colors, styles }: AvatarProps) {
  return (
    <View
      style={[
        styles.avatar,
        pinned ? styles.pinnedAvatar : styles.regularAvatar,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={[styles.avatarText, { fontSize: size * 0.38, color: pinned ? colors.pinned : colors.primary }]}>
        {initials(name)}
      </Text>
    </View>
  );
}

interface CreateDirectModalProps {
  onClose: () => void;
  onCreated: (chat: Chat) => void;
}

function CreateDirectModal({ onClose, onCreated }: CreateDirectModalProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [query, setQuery] = useState('');
  const queryClient = useQueryClient();

  const { data: users = [], isFetching, isError } = useQuery<User[]>({
    queryKey: ['user-search-direct', query],
    queryFn: async () => {
      const res = await apiClient.get('/users/search', { params: { q: query } });
      return res.data as User[];
    },
    enabled: query.length >= 2,
    staleTime: 0,
  });

  const createMutation = useMutation({
    mutationFn: async (targetUserId: string) => {
      const res = await apiClient.post<Chat>('/chats/direct', { target_user_id: targetUserId });
      return res.data;
    },
    onSuccess: (chat) => {
      void queryClient.invalidateQueries({ queryKey: ['chats'] });
      onCreated(chat);
    },
    onError: () => Alert.alert('Ошибка', 'Не удалось создать чат'),
  });

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Новый чат</Text>
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Поиск пользователя..."
            placeholderTextColor={colors.textMuted}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length >= 2 && (
            <FlatList
              data={users}
              keyExtractor={(u) => u.id}
              style={styles.searchResults}
              ListEmptyComponent={
                isFetching ? (
                  <ActivityIndicator color={colors.primary} style={{ margin: 16 }} />
                ) : isError ? (
                  <Text style={styles.searchEmpty}>Ошибка поиска</Text>
                ) : (
                  <Text style={styles.searchEmpty}>Не найдено</Text>
                )
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.searchItem}
                  onPress={() => createMutation.mutate(item.id)}
                >
                  <Avatar name={item.username} size={36} colors={colors} styles={styles} />
                  <Text style={styles.searchItemText}>@{item.username}</Text>
                </TouchableOpacity>
              )}
            />
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

interface CreateGroupModalProps {
  onClose: () => void;
  onCreated: (chat: Chat) => void;
}

function CreateGroupModal({ onClose, onCreated }: CreateGroupModalProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [title, setTitle] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<User[]>([]);
  const queryClient = useQueryClient();

  const { data: results = [], isFetching } = useQuery<User[]>({
    queryKey: ['user-search-group', query],
    queryFn: async () => {
      const res = await apiClient.get('/users/search', { params: { q: query } });
      return res.data as User[];
    },
    enabled: query.length >= 2,
    staleTime: 0,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiClient.post<Chat>('/chats/group', {
        title: title.trim(),
        member_user_ids: selected.map((u) => u.id),
      });
      return res.data;
    },
    onSuccess: (chat) => {
      void queryClient.invalidateQueries({ queryKey: ['chats'] });
      onCreated(chat);
    },
    onError: () => Alert.alert('Ошибка', 'Не удалось создать группу'),
  });

  function toggle(user: User) {
    setSelected((s) =>
      s.find((u) => u.id === user.id) ? s.filter((u) => u.id !== user.id) : [...s, user],
    );
  }

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Новая группа</Text>
          <TextInput
            style={styles.searchInput}
            value={title}
            onChangeText={setTitle}
            placeholder="Название группы"
            placeholderTextColor={colors.textMuted}
            autoFocus
          />
          <TextInput
            style={[styles.searchInput, { marginTop: 8 }]}
            value={query}
            onChangeText={setQuery}
            placeholder="Добавить участников..."
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {selected.length > 0 && (
            <View style={styles.chips}>
              {selected.map((u) => (
                <TouchableOpacity key={u.id} style={styles.chip} onPress={() => toggle(u)}>
                  <Text style={styles.chipText}>@{u.username} ✕</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {query.length >= 2 && (
            <FlatList
              data={results}
              keyExtractor={(u) => u.id}
              style={styles.searchResults}
              ListEmptyComponent={
                isFetching ? (
                  <ActivityIndicator color={colors.primary} style={{ margin: 16 }} />
                ) : (
                  <Text style={styles.searchEmpty}>Не найдено</Text>
                )
              }
              renderItem={({ item }) => {
                const isSelected = !!selected.find((u) => u.id === item.id);
                return (
                  <TouchableOpacity
                    style={[styles.searchItem, isSelected && styles.searchItemSelected]}
                    onPress={() => toggle(item)}
                  >
                    <Avatar name={item.username} size={36} colors={colors} styles={styles} />
                    <Text style={styles.searchItemText}>@{item.username}</Text>
                    {isSelected && <Text style={styles.checkmark}>✓</Text>}
                  </TouchableOpacity>
                );
              }}
            />
          )}
          <TouchableOpacity
            style={[
              styles.createButton,
              (!title.trim() || selected.length === 0 || createMutation.isPending) &&
                styles.createButtonDisabled,
            ]}
            onPress={() => createMutation.mutate()}
            disabled={!title.trim() || selected.length === 0 || createMutation.isPending}
          >
            {createMutation.isPending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.createButtonText}>Создать группу</Text>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

export function ChatListScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [showDirect, setShowDirect] = useState(false);
  const [showGroup, setShowGroup] = useState(false);
  const { unreadCounts, lastMessages } = useChatStore();
  const { userId } = useAuthStore();
  const { pinnedChatIds, pinChat, unpinChat, isPinned } = useSettingsStore();

  const { data: chats = [], isLoading, refetch, isRefetching } = useQuery<Chat[]>({
    queryKey: ['chats'],
    queryFn: async () => {
      const res = await apiClient.get('/chats');
      return res.data as Chat[];
    },
  });

  const sortedChats = useMemo(() => {
    return [...chats].sort((a, b) => {
      const aPinned = pinnedChatIds.includes(a.id);
      const bPinned = pinnedChatIds.includes(b.id);
      if (aPinned !== bPinned) return aPinned ? -1 : 1;

      const aTime = lastMessages[a.id]?.at ?? a.updated_at ?? a.created_at;
      const bTime = lastMessages[b.id]?.at ?? b.updated_at ?? b.created_at;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });
  }, [chats, pinnedChatIds, lastMessages]);

  const renderItem = useCallback(
    ({ item, index }: { item: Chat; index: number }) => {
      const name = chatDisplayName(item);
      const unread = unreadCounts[item.id] ?? 0;
      const last = lastMessages[item.id];
      const pinned = isPinned(item.id);

      return (
        <Animated.View entering={FadeInRight.delay(index * 40).duration(300)}>
          <TouchableOpacity
            style={styles.chatItem}
            onPress={() => {
              navigation.navigate('Chat', {
                chatId: item.id,
                chatTitle: name,
                chatType: item.type,
                otherUserId: item.other_user_id ?? undefined,
              });
            }}
            onLongPress={() => {
              Alert.alert(name, undefined, [
                pinned
                  ? { text: 'Открепить', onPress: () => unpinChat(item.id) }
                  : { text: 'Закрепить', onPress: () => pinChat(item.id) },
                { text: 'Отмена', style: 'cancel' },
              ]);
            }}
            activeOpacity={0.7}
          >
            <View style={styles.chatItemInner}>
              <Avatar name={name} pinned={pinned} colors={colors} styles={styles} />
              <View style={styles.chatMeta}>
                <View style={styles.chatTopRow}>
                  <View style={styles.chatNameRow}>
                    {pinned && (
                      <Ionicons name="pin" size={12} color={colors.pinned} />
                    )}
                    <Text style={styles.chatName} numberOfLines={1}>{name}</Text>
                  </View>
                  {last && (
                    <Text style={styles.chatTime}>{formatSidebarTime(last.at)}</Text>
                  )}
                </View>
                <View style={styles.chatBottomRow}>
                  <Text style={styles.chatPreview} numberOfLines={1}>
                    {last
                      ? last.senderId === userId
                        ? `Вы: ${last.text}`
                        : last.text
                      : item.type === 'group' ? 'Группа' : ''}
                  </Text>
                  {unread > 0 && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          </TouchableOpacity>
        </Animated.View>
      );
    },
    [unreadCounts, lastMessages, userId, navigation, styles, colors, isPinned, pinChat, unpinChat],
  );

  return (
    <View style={styles.container}>
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlashList
          data={sortedChats}
          keyExtractor={(c) => c.id}
          renderItem={renderItem}
          estimatedItemSize={72}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>Нет чатов</Text>
              <Text style={styles.emptyHint}>Нажмите + чтобы начать переписку</Text>
            </View>
          }
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={() => setShowNewMenu(true)} activeOpacity={0.8}>
        <Text style={styles.fabIcon}>＋</Text>
      </TouchableOpacity>

      {showNewMenu && (
        <Modal transparent animationType="fade" onRequestClose={() => setShowNewMenu(false)}>
          <TouchableOpacity
            style={styles.menuOverlay}
            activeOpacity={1}
            onPress={() => setShowNewMenu(false)}
          >
            <View style={styles.menu}>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => { setShowNewMenu(false); setShowDirect(true); }}
              >
                <Text style={styles.menuItemText}>Личный чат</Text>
              </TouchableOpacity>
              <View style={styles.menuDivider} />
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => { setShowNewMenu(false); setShowGroup(true); }}
              >
                <Text style={styles.menuItemText}>Группа</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {showDirect && (
        <CreateDirectModal
          onClose={() => setShowDirect(false)}
          onCreated={(chat) => {
            setShowDirect(false);
            navigation.navigate('Chat', {
              chatId: chat.id,
              chatTitle: chatDisplayName(chat),
              chatType: chat.type,
              otherUserId: chat.other_user_id ?? undefined,
            });
          }}
        />
      )}

      {showGroup && (
        <CreateGroupModal
          onClose={() => setShowGroup(false)}
          onCreated={(chat) => {
            setShowGroup(false);
            navigation.navigate('Chat', {
              chatId: chat.id,
              chatTitle: chatDisplayName(chat),
              chatType: chat.type,
            });
          }}
        />
      )}
    </View>
  );
}
