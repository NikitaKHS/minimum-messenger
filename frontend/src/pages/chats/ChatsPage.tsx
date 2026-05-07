import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/shared/api/client";
import { wsClient } from "@/shared/api/websocket";
import { useAuthStore } from "@/shared/store/auth";
import { useChatStore } from "@/shared/store/chat";
import { requestNotificationPermission, showNewMessageNotification } from "@/shared/notifications";
import type { Chat } from "@/entities/chat/types";
import type { Message } from "@/entities/message/types";
import type { User } from "@/entities/user/types";

// ─── helpers ────────────────────────────────────────────────────────────────

function formatSidebarTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diffDays === 0) return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "Вчера";
  if (diffDays < 7) return d.toLocaleDateString("ru-RU", { weekday: "short" });
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

function formatMsgTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function formatDateLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diffDays === 0) return "Сегодня";
  if (diffDays === 1) return "Вчера";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

function sameDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

function chatDisplayName(chat: Chat): string {
  if (chat.type === "direct") return chat.other_username ? `@${chat.other_username}` : "Личный чат";
  return chat.title ?? "Группа";
}

function initials(name: string): string {
  return (name.replace("@", "")[0] ?? "?").toUpperCase();
}

// ─── DeliveryIcon ────────────────────────────────────────────────────────────

function DeliveryIcon({ delivered, read }: { delivered: boolean; read: boolean }) {
  if (!delivered && !read) {
    return (
      <svg
        className="w-3.5 h-3.5 inline-block text-primary-foreground/50"
        viewBox="0 0 14 10"
        fill="none"
        aria-label="Отправлено"
      >
        <path
          d="M1.5 5L5 8.5L12.5 1.5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  const color = read ? "text-blue-400" : "text-primary-foreground/50";
  return (
    <svg
      className={`w-[1.1rem] h-3.5 inline-block ${color}`}
      viewBox="0 0 18 10"
      fill="none"
      aria-label={read ? "Прочитано" : "Доставлено"}
    >
      <path
        d="M1.5 5L5 8.5L12.5 1.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.5 5L9 8.5L16.5 1.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── TypingDots ──────────────────────────────────────────────────────────────

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-[3px] translate-y-px">
      {[0, 150, 300].map((delay, i) => (
        <span
          key={i}
          className="w-1 h-1 rounded-full bg-current animate-bounce"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}

// ─── CreateGroupModal ────────────────────────────────────────────────────────

function CreateGroupModal({
  onClose,
  onCreate,
  isPending,
}: {
  onClose: () => void;
  onCreate: (title: string, memberIds: string[]) => void;
  isPending: boolean;
}) {
  const [title, setTitle] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<User[]>([]);

  const { data: results = [], isFetching } = useQuery<User[]>({
    queryKey: ["users-search-group", query],
    queryFn: async () => {
      const res = await apiClient.get("/users/search", { params: { q: query } });
      return res.data;
    },
    enabled: query.length >= 2,
  });

  function toggle(user: User) {
    setSelected((s) =>
      s.find((u) => u.id === user.id) ? s.filter((u) => u.id !== user.id) : [...s, user],
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-background rounded-2xl shadow-xl w-full max-w-md flex flex-col gap-4 p-5 max-h-[82vh]">
        {/* Title row */}
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-base">Новая группа</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-accent transition-colors"
            aria-label="Закрыть"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Group name */}
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Название группы"
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />

        {/* Selected chips */}
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {selected.map((u) => (
              <button
                key={u.id}
                onClick={() => toggle(u)}
                className="flex items-center gap-1 bg-primary/10 text-primary rounded-full px-2.5 py-0.5 text-xs font-medium hover:bg-destructive/10 hover:text-destructive transition-colors"
              >
                @{u.username}
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            ))}
          </div>
        )}

        {/* Member search */}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Добавить участников..."
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />

        {query.length >= 2 && (
          <div className="overflow-y-auto border rounded-lg divide-y max-h-40">
            {isFetching && (
              <p className="text-xs text-muted-foreground px-3 py-2">Поиск...</p>
            )}
            {!isFetching && results.length === 0 && (
              <p className="text-xs text-muted-foreground px-3 py-2">Не найдено</p>
            )}
            {results.map((user) => {
              const isSelected = !!selected.find((u) => u.id === user.id);
              return (
                <button
                  key={user.id}
                  onClick={() => toggle(user)}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors hover:bg-accent flex items-center justify-between ${isSelected ? "bg-primary/5" : ""}`}
                >
                  <span className="font-medium">@{user.username}</span>
                  {isSelected && (
                    <svg className="w-4 h-4 text-primary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <button
          onClick={() => {
            if (title.trim() && selected.length > 0) {
              onCreate(title.trim(), selected.map((u) => u.id));
            }
          }}
          disabled={!title.trim() || selected.length === 0 || isPending}
          className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          {isPending ? "Создание..." : "Создать группу"}
        </button>
      </div>
    </div>
  );
}

// ─── ChatWindow ──────────────────────────────────────────────────────────────

function ChatWindow({
  chat,
  messages,
  currentUserId,
  onBack,
}: {
  chat: Chat;
  messages: Message[];
  currentUserId: string;
  onBack: () => void;
}) {
  const [text, setText] = useState("");
  const queryClient = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);
  const markedReadRef = useRef(new Set<string>());
  const { typingUsers, deliveryStatuses } = useChatStore();

  const chatId = chat.id;
  const isGroup = chat.type === "group";
  const chatTitle = chatDisplayName(chat);
  const typing = typingUsers[chatId] ?? [];

  // Build username map from loaded messages for typing indicator labels
  const usernameMap = useMemo(() => {
    const map: Record<string, string> = {};
    messages.forEach((m) => {
      if (m.sender_username) map[m.sender_user_id] = m.sender_username;
    });
    return map;
  }, [messages]);

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Reset read-tracking when switching chats
  useEffect(() => {
    markedReadRef.current = new Set();
  }, [chatId]);

  // Mark messages as read when they arrive while chat is open
  useEffect(() => {
    if (messages.length === 0) return;
    const toRead = messages.filter(
      (m) => m.sender_user_id !== currentUserId && !markedReadRef.current.has(m.id),
    );
    toRead.forEach((m) => {
      markedReadRef.current.add(m.id);
      void apiClient.post(`/messages/${m.id}/read`).catch(() => {});
    });
  }, [messages, currentUserId]);

  const sendMutation = useMutation({
    mutationFn: async (msg: string) => {
      await apiClient.post("/messages", {
        chat_id: chatId,
        client_message_id: crypto.randomUUID(),
        encrypted_payload: msg,
        encryption_version: "v1",
        message_type: "text",
        group_keys: [],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", chatId] });
      setText("");
    },
  });

  function handleTyping(value: string) {
    setText(value);
    if (!isTypingRef.current && value.trim()) {
      isTypingRef.current = true;
      wsClient.send("typing.started", { chat_id: chatId });
    }
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      if (isTypingRef.current) {
        isTypingRef.current = false;
        wsClient.send("typing.stopped", { chat_id: chatId });
      }
    }, 3000);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || sendMutation.isPending) return;
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    if (isTypingRef.current) {
      isTypingRef.current = false;
      wsClient.send("typing.stopped", { chat_id: chatId });
    }
    sendMutation.mutate(text.trim());
  }

  const sorted = [...messages].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  // Typing label for header
  const typingLabel = useMemo(() => {
    if (typing.length === 0) return null;
    if (!isGroup) return "печатает";
    const names = typing.slice(0, 2).map((uid) => usernameMap[uid] ?? "кто-то");
    return typing.length > 2
      ? `${names.join(", ")} и ещё ${typing.length - 2} печатают`
      : names.join(" и ") + " печатает";
  }, [typing, isGroup, usernameMap]);

  return (
    <>
      {/* Header */}
      <div className="border-b px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <button
          onClick={onBack}
          className="md:hidden p-1 -ml-1 rounded hover:bg-accent transition-colors"
          aria-label="Назад"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-semibold flex-shrink-0">
          {initials(chatTitle)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm truncate">{chatTitle}</p>
          {typingLabel ? (
            <p className="text-xs text-primary flex items-center gap-1">
              {typingLabel} <TypingDots />
            </p>
          ) : isGroup ? (
            <p className="text-xs text-muted-foreground">группа</p>
          ) : null}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-0.5">
        {sorted.length === 0 && (
          <p className="text-center text-muted-foreground text-sm mt-10">
            Нет сообщений. Напишите первым!
          </p>
        )}
        {sorted.map((m, i) => {
          const isMine = m.sender_user_id === currentUserId;
          const prev = sorted[i - 1];
          const showDateSep = !prev || !sameDay(prev.created_at, m.created_at);
          const showSender =
            isGroup &&
            !isMine &&
            (!prev || prev.sender_user_id !== m.sender_user_id || showDateSep);
          const ds = deliveryStatuses[m.id];

          return (
            <div key={m.id}>
              {showDateSep && (
                <div className="flex items-center justify-center my-4">
                  <span className="text-xs text-muted-foreground bg-accent rounded-full px-3 py-0.5">
                    {formatDateLabel(m.created_at)}
                  </span>
                </div>
              )}
              {showSender && m.sender_username && (
                <p className="text-[11px] font-semibold text-primary/80 ml-3 mb-0.5 mt-2">
                  @{m.sender_username}
                </p>
              )}
              <div className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`
                    rounded-2xl px-3 py-2 max-w-[75%] text-sm break-words
                    ${isMine
                      ? "bg-primary text-primary-foreground rounded-tr-sm"
                      : "bg-secondary text-secondary-foreground rounded-tl-sm"}
                  `}
                >
                  <span>{m.encrypted_payload}</span>
                  {/* Time + delivery status — pinned to bottom-right */}
                  <span
                    className={`inline-flex items-center gap-0.5 ml-2 float-right mt-1 text-[11px] leading-none select-none ${
                      isMine ? "text-primary-foreground/60" : "text-muted-foreground"
                    }`}
                  >
                    {formatMsgTime(m.created_at)}
                    {isMine && (
                      <DeliveryIcon
                        delivered={ds?.delivered ?? false}
                        read={ds?.read ?? false}
                      />
                    )}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <form
        onSubmit={handleSubmit}
        className="border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex gap-2 flex-shrink-0"
      >
        <input
          value={text}
          onChange={(e) => handleTyping(e.target.value)}
          placeholder="Сообщение..."
          className="flex-1 border rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <button
          type="submit"
          disabled={!text.trim() || sendMutation.isPending}
          aria-label="Отправить"
          className="bg-primary text-primary-foreground rounded-full w-9 h-9 flex items-center justify-center disabled:opacity-50 hover:opacity-90 transition-opacity flex-shrink-0"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </form>
    </>
  );
}

// ─── ChatsPage ───────────────────────────────────────────────────────────────

export default function ChatsPage() {
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);

  const activeChatIdRef = useRef<string | null>(null);
  const typingTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const openChatRef = useRef<(id: string) => void>(() => {});
  const searchRef = useRef<HTMLDivElement>(null);

  const queryClient = useQueryClient();
  const { accessToken, userId } = useAuthStore();
  const {
    typingUsers,
    onlineUsers,
    unreadCounts,
    lastMessages,
    setTyping,
    setOnline,
    incUnread,
    clearUnread,
    setLastMessage,
    setDelivered,
    setRead,
  } = useChatStore();

  // Keep refs current
  useEffect(() => { activeChatIdRef.current = activeChatId; }, [activeChatId]);

  const openChat = useCallback(
    (id: string) => {
      setActiveChatId(id);
      setMobileChatOpen(true);
      clearUnread(id);
    },
    [clearUnread],
  );
  useEffect(() => { openChatRef.current = openChat; }, [openChat]);

  // Request notification permission
  useEffect(() => { void requestNotificationPermission(); }, []);

  // WebSocket lifecycle
  useEffect(() => {
    if (accessToken) wsClient.connect();
    return () => wsClient.disconnect();
  }, [accessToken]);

  // WebSocket event handlers — stable, uses refs for dynamic values
  useEffect(() => {
    const unsubs = [
      wsClient.on("message.new", (payload) => {
        const p = payload as {
          chat_id: string;
          message_id: string;
          sender_user_id: string;
          sender_username?: string | null;
          encrypted_payload?: string;
          created_at: string;
        };

        queryClient.invalidateQueries({ queryKey: ["messages", p.chat_id] });
        queryClient.invalidateQueries({ queryKey: ["chats"] });

        if (p.encrypted_payload) {
          setLastMessage(p.chat_id, {
            text: p.encrypted_payload,
            at: p.created_at,
            senderId: p.sender_user_id,
          });
        }

        if (p.sender_user_id !== userId) {
          // Acknowledge delivery immediately
          void apiClient.post(`/messages/${p.message_id}/delivered`).catch(() => {});

          const isActiveChat = activeChatIdRef.current === p.chat_id;
          const isTabVisible = document.visibilityState === "visible";

          if (isActiveChat && isTabVisible) {
            void apiClient.post(`/messages/${p.message_id}/read`).catch(() => {});
          } else {
            incUnread(p.chat_id);
            const chats = queryClient.getQueryData<Chat[]>(["chats"]) ?? [];
            const chat = chats.find((c) => c.id === p.chat_id);
            const notifTitle = p.sender_username
              ? chat && chat.type === "group"
                ? `${p.sender_username} · ${chatDisplayName(chat)}`
                : `@${p.sender_username}`
              : chat
                ? chatDisplayName(chat)
                : "Minimum";
            showNewMessageNotification(
              notifTitle,
              p.encrypted_payload ?? "Новое сообщение",
              p.chat_id,
              (id) => openChatRef.current(id),
            );
          }
        }
      }),

      wsClient.on("message.delivered", (payload) => {
        const p = payload as { message_id: string };
        setDelivered(p.message_id);
      }),

      wsClient.on("message.read", (payload) => {
        const p = payload as { message_id: string };
        setRead(p.message_id);
      }),

      wsClient.on("typing.started", (payload) => {
        const p = payload as { chat_id: string; user_id: string };
        if (p.user_id === userId) return;
        setTyping(p.chat_id, p.user_id, true);
        const key = `${p.chat_id}:${p.user_id}`;
        const existing = typingTimers.current.get(key);
        if (existing) clearTimeout(existing);
        const timer = setTimeout(() => {
          setTyping(p.chat_id, p.user_id, false);
          typingTimers.current.delete(key);
        }, 7000);
        typingTimers.current.set(key, timer);
      }),

      wsClient.on("typing.stopped", (payload) => {
        const p = payload as { chat_id: string; user_id: string };
        setTyping(p.chat_id, p.user_id, false);
        const key = `${p.chat_id}:${p.user_id}`;
        const timer = typingTimers.current.get(key);
        if (timer) {
          clearTimeout(timer);
          typingTimers.current.delete(key);
        }
      }),

      wsClient.on("presence.updated", (payload) => {
        const p = payload as { user_id: string; status: "online" | "offline" };
        setOnline(p.user_id, p.status);
      }),
    ];

    return () => unsubs.forEach((fn) => fn());
  }, [queryClient, userId, setLastMessage, incUnread, setDelivered, setRead, setTyping, setOnline]);

  // Close search on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearch(false);
        setSearchQuery("");
      }
    }
    if (showSearch) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showSearch]);

  // ─── queries ───────────────────────────────────────────────────────────────

  const { data: chats = [] } = useQuery<Chat[]>({
    queryKey: ["chats"],
    queryFn: async () => {
      const res = await apiClient.get("/chats");
      return res.data;
    },
    enabled: !!accessToken,
  });

  const { data: searchResults = [], isFetching: searching } = useQuery<User[]>({
    queryKey: ["users-search", searchQuery],
    queryFn: async () => {
      const res = await apiClient.get("/users/search", { params: { q: searchQuery } });
      return res.data;
    },
    enabled: searchQuery.length >= 2,
  });

  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ["messages", activeChatId],
    queryFn: async () => {
      const res = await apiClient.get(`/chats/${activeChatId}/messages`);
      return res.data.items;
    },
    enabled: !!activeChatId,
  });

  // ─── mutations ─────────────────────────────────────────────────────────────

  const createDirectMutation = useMutation({
    mutationFn: async (otherUserId: string) => {
      const res = await apiClient.post("/chats/direct", { other_user_id: otherUserId });
      return res.data as Chat;
    },
    onSuccess: (chat) => {
      queryClient.invalidateQueries({ queryKey: ["chats"] });
      openChat(chat.id);
      setShowSearch(false);
      setSearchQuery("");
    },
  });

  const createGroupMutation = useMutation({
    mutationFn: async ({ title, memberIds }: { title: string; memberIds: string[] }) => {
      const res = await apiClient.post("/chats/group", { title, member_ids: memberIds });
      return res.data as Chat;
    },
    onSuccess: (chat) => {
      queryClient.invalidateQueries({ queryKey: ["chats"] });
      setShowGroupModal(false);
      openChat(chat.id);
    },
  });

  const activeChat = chats.find((c) => c.id === activeChatId) ?? null;

  // ─── render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-[100dvh] bg-background overflow-hidden">
      {showGroupModal && (
        <CreateGroupModal
          onClose={() => setShowGroupModal(false)}
          onCreate={(title, memberIds) => createGroupMutation.mutate({ title, memberIds })}
          isPending={createGroupMutation.isPending}
        />
      )}

      {/* ── Sidebar ── */}
      <aside
        className={`flex flex-col border-r bg-background w-full md:w-72 md:flex flex-shrink-0 ${
          mobileChatOpen ? "hidden md:flex" : "flex"
        }`}
      >
        {/* Header */}
        <div className="p-4 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img src="/icon.png" alt="Minimum" className="w-7 h-7" />
              <span className="font-semibold text-lg">Minimum</span>
            </div>
            <div className="flex items-center gap-0.5">
              {/* New group */}
              <button
                onClick={() => setShowGroupModal(true)}
                className="rounded-full p-1.5 hover:bg-accent transition-colors"
                title="Новая группа"
                aria-label="Новая группа"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm-9 8a3 3 0 100-6 3 3 0 000 6z" />
                </svg>
              </button>
              {/* New direct */}
              <button
                onClick={() => { setShowSearch(true); setSearchQuery(""); }}
                className="rounded-full p-1.5 hover:bg-accent transition-colors"
                title="Новый чат"
                aria-label="Новый чат"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* User search panel */}
        {showSearch && (
          <div ref={searchRef} className="border-b flex-shrink-0">
            <div className="p-2">
              <input
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Найти пользователя..."
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            {searchQuery.length >= 2 && (
              <div className="max-h-48 overflow-y-auto">
                {searching && (
                  <p className="text-xs text-muted-foreground px-4 py-2">Поиск...</p>
                )}
                {!searching && searchResults.length === 0 && (
                  <p className="text-xs text-muted-foreground px-4 py-2">Не найдено</p>
                )}
                {searchResults.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => createDirectMutation.mutate(user.id)}
                    disabled={createDirectMutation.isPending}
                    className="w-full text-left px-4 py-2 hover:bg-accent text-sm transition-colors"
                  >
                    <span className="font-medium">@{user.username}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Chat list */}
        <div className="flex-1 overflow-y-auto">
          {chats.length === 0 && !showSearch && (
            <div className="p-6 text-center">
              <p className="text-muted-foreground text-sm">Нет чатов</p>
              <p className="text-xs text-muted-foreground mt-1">Нажмите + чтобы начать</p>
            </div>
          )}
          {chats.map((chat) => {
            const name = chatDisplayName(chat);
            const unread = unreadCounts[chat.id] ?? 0;
            const lastMsg = lastMessages[chat.id];
            const typing = typingUsers[chat.id] ?? [];
            const isOnline =
              chat.type === "direct" && chat.other_user_id
                ? (onlineUsers[chat.other_user_id] ?? false)
                : false;
            const isActive = activeChatId === chat.id;
            const timeLabel = lastMsg
              ? formatSidebarTime(lastMsg.at)
              : formatSidebarTime(chat.updated_at);

            return (
              <button
                key={chat.id}
                onClick={() => openChat(chat.id)}
                className={`w-full text-left px-4 py-3 hover:bg-accent transition-colors border-b border-border/40 ${
                  isActive ? "bg-accent" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  {/* Avatar + online dot */}
                  <div className="relative flex-shrink-0">
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-base font-semibold">
                      {initials(name)}
                    </div>
                    {isOnline && (
                      <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-background" />
                    )}
                  </div>
                  {/* Name + preview */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-1">
                      <p className="font-medium truncate text-sm">{name}</p>
                      <span className="text-[11px] text-muted-foreground flex-shrink-0">
                        {timeLabel}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-1 mt-0.5">
                      <p className="text-xs text-muted-foreground truncate">
                        {typing.length > 0 ? (
                          <span className="text-primary inline-flex items-center gap-1">
                            печатает <TypingDots />
                          </span>
                        ) : lastMsg ? (
                          lastMsg.text.length > 38
                            ? lastMsg.text.slice(0, 38) + "…"
                            : lastMsg.text
                        ) : (
                          <span className="capitalize">
                            {chat.type === "direct" ? "личный" : "группа"}
                          </span>
                        )}
                      </p>
                      {unread > 0 && (
                        <span className="flex-shrink-0 min-w-[1.25rem] h-5 bg-primary text-primary-foreground text-[11px] font-semibold rounded-full flex items-center justify-center px-1.5">
                          {unread > 99 ? "99+" : unread}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* ── Main area ── */}
      <main
        className={`flex-1 flex flex-col min-w-0 ${
          mobileChatOpen ? "flex" : "hidden md:flex"
        }`}
      >
        {activeChatId && activeChat ? (
          <ChatWindow
            chat={activeChat}
            messages={messages}
            currentUserId={userId ?? ""}
            onBack={() => setMobileChatOpen(false)}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
            <img src="/logo.png" alt="" className="w-20 h-20 opacity-20" />
            <p className="text-sm">Выберите чат или начните новый</p>
          </div>
        )}
      </main>
    </div>
  );
}
