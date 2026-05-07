import React, { useCallback, useState } from 'react';
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
import Animated, { FadeInRight } from 'react-native-reanimated';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { apiClient } from '../shared/api/client';
import { useChatStore } from '../shared/store/chat';
import { useAuthStore } from '../shared/store/auth';
import { theme } from '../shared/theme';
import type { Chat } from '../entities/chat/types';
import type { User } from '../entities/user/types';
import type { ChatsStackParams } from '../navigation';

type Props = NativeStackScreenProps<ChatsStackParams, 'ChatList'>;

function formatSidebarTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
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

function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={[styles.avatarText, { fontSize: size * 0.38 }]}>{initials(name)}</Text>
    </View>
  );
}

interface CreateDirectModalProps {
  onClose: () => void;
  onCreated: (chat: Chat) => void;
}

function CreateDirectModal({ onClose, onCreated }: CreateDirectModalProps) {
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
            placeholderTextColor={theme.colors.textMuted}
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
                  <ActivityIndicator color={theme.colors.primary} style={{ margin: 16 }} />
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
                  <Avatar name={item.username} size={36} />
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
            placeholderTextColor={theme.colors.textMuted}
            autoFocus
          />

          <TextInput
            style={[styles.searchInput, { marginTop: theme.spacing.sm }]}
            value={query}
            onChangeText={setQuery}
            placeholder="Добавить участников..."
            placeholderTextColor={theme.colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />

          {selected.length > 0 && (
            <View style={styles.chips}>
              {selected.map((u) => (
                <TouchableOpacity
                  key={u.id}
                  style={styles.chip}
                  onPress={() => toggle(u)}
                >
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
                  <ActivityIndicator color={theme.colors.primary} style={{ margin: 16 }} />
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
                    <Avatar name={item.username} size={36} />
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
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [showDirect, setShowDirect] = useState(false);
  const [showGroup, setShowGroup] = useState(false);
  const { unreadCounts, lastMessages } = useChatStore();
  const { userId } = useAuthStore();

  const { data: chats = [], isLoading, refetch, isRefetching } = useQuery<Chat[]>({
    queryKey: ['chats'],
    queryFn: async () => {
      const res = await apiClient.get('/chats');
      return res.data as Chat[];
    },
  });

  const renderItem = useCallback(
    ({ item, index }: { item: Chat; index: number }) => {
      const name = chatDisplayName(item);
      const unread = unreadCounts[item.id] ?? 0;
      const last = lastMessages[item.id];

      return (
        <Animated.View entering={FadeInRight.delay(index * 40).duration(300)}>
          <TouchableOpacity
            style={styles.chatItem}
            onPress={() => {
              navigation.navigate('Chat', {
                chatId: item.id,
                chatTitle: name,
                chatType: item.type,
              });
            }}
            activeOpacity={0.7}
          >
            <View style={styles.chatItemInner}>
              <Avatar name={name} />
              <View style={styles.chatMeta}>
                <View style={styles.chatTopRow}>
                  <Text style={styles.chatName} numberOfLines={1}>{name}</Text>
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
    [unreadCounts, lastMessages, userId, navigation],
  );

  return (
    <View style={styles.container}>
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.primary} size="large" />
        </View>
      ) : (
        <FlashList
          data={chats}
          keyExtractor={(c) => c.id}
          renderItem={renderItem}
          estimatedItemSize={72}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={theme.colors.primary}
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

      <TouchableOpacity
        style={styles.fab}
        onPress={() => setShowNewMenu(true)}
        activeOpacity={0.8}
      >
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyText: { fontSize: theme.font.lg, color: theme.colors.text, fontWeight: '500' },
  emptyHint: {
    fontSize: theme.font.sm,
    color: theme.colors.textMuted,
    marginTop: theme.spacing.xs,
  },
  chatItem: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  chatItemInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: 12,
    gap: theme.spacing.md,
  },
  avatar: {
    backgroundColor: `${theme.colors.primary}30`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: theme.colors.primary, fontWeight: '600' },
  chatMeta: { flex: 1, gap: 3 },
  chatTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chatName: {
    flex: 1,
    fontSize: theme.font.md,
    fontWeight: '600',
    color: theme.colors.text,
    marginRight: theme.spacing.sm,
  },
  chatTime: { fontSize: 12, color: theme.colors.textMuted },
  chatBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chatPreview: {
    flex: 1,
    fontSize: theme.font.sm,
    color: theme.colors.textMuted,
    marginRight: theme.spacing.sm,
  },
  badge: {
    backgroundColor: theme.colors.primary,
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
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  fabIcon: { color: '#fff', fontSize: 26, lineHeight: 30 },
  menuOverlay: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'flex-end',
    paddingBottom: 100,
    paddingRight: 20,
    alignItems: 'flex-end',
  },
  menu: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    minWidth: 160,
    overflow: 'hidden',
  },
  menuItem: { paddingHorizontal: theme.spacing.lg, paddingVertical: 14 },
  menuItemText: { fontSize: theme.font.md, color: theme.colors.text },
  menuDivider: { height: 1, backgroundColor: theme.colors.border },
  modalOverlay: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: theme.colors.card,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    padding: theme.spacing.xl,
    paddingTop: theme.spacing.md,
    maxHeight: '75%',
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  modalHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    marginBottom: theme.spacing.md,
  },
  modalTitle: {
    fontSize: theme.font.lg,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  searchInput: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 11,
    color: theme.colors.text,
    fontSize: theme.font.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  searchResults: { marginTop: theme.spacing.sm, maxHeight: 240 },
  searchEmpty: {
    textAlign: 'center',
    color: theme.colors.textMuted,
    padding: theme.spacing.md,
    fontSize: theme.font.sm,
  },
  searchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
    gap: theme.spacing.sm,
    borderRadius: theme.radius.sm,
  },
  searchItemSelected: { backgroundColor: `${theme.colors.primary}15` },
  searchItemText: { flex: 1, fontSize: theme.font.md, color: theme.colors.text },
  checkmark: { color: theme.colors.primary, fontWeight: '700', fontSize: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: theme.spacing.sm },
  chip: {
    backgroundColor: `${theme.colors.primary}20`,
    borderRadius: theme.radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipText: { fontSize: 12, color: theme.colors.primary, fontWeight: '500' },
  createButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: theme.spacing.md,
  },
  createButtonDisabled: { opacity: 0.4 },
  createButtonText: { color: '#fff', fontSize: theme.font.md, fontWeight: '600' },
});
