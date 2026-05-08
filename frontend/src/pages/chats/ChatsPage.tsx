import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/shared/api/client";
import { wsClient } from "@/shared/api/websocket";
import { useAuthStore } from "@/shared/store/auth";
import { useChatStore } from "@/shared/store/chat";
import { requestNotificationPermission, showNewMessageNotification } from "@/shared/notifications";
import {
  deriveSharedKey,
  importPublicKey,
  encryptPayload,
  decryptPayload,
  isEncryptedPayload,
  loadMyKeyPair,
} from "@/shared/crypto/e2ee";
import type { Chat } from "@/entities/chat/types";
import type { Message } from "@/entities/message/types";
import type { User, Device } from "@/entities/user/types";

// ─── attachment helpers ──────────────────────────────────────────────────────

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MB

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / 1_048_576).toFixed(1)} МБ`;
}

interface AttachmentMeta { name: string; type: string }

function parseAttachmentPayload(payload: string): AttachmentMeta {
  try {
    const p = JSON.parse(payload) as AttachmentMeta;
    if (p.name) return p;
  } catch { /* not JSON */ }
  return { name: payload || "файл", type: "" };
}

// ─── AttachmentBubble ────────────────────────────────────────────────────────

function AttachmentBubble({
  attachmentId,
  payload,
  isMine,
}: {
  attachmentId: string;
  payload: string;
  isMine: boolean;
}) {
  const meta = parseAttachmentPayload(payload);
  const isImage = meta.type.startsWith("image/");

  const { data: blobUrl } = useQuery<string>({
    queryKey: ["attachment", attachmentId],
    queryFn: async () => {
      const res = await apiClient.get(`/attachments/${attachmentId}/download`, {
        responseType: "blob",
      });
      return URL.createObjectURL(res.data as Blob);
    },
    staleTime: Infinity,
    enabled: isImage,
  });

  async function handleDownload() {
    const res = await apiClient.get(`/attachments/${attachmentId}/download`, {
      responseType: "blob",
    });
    const url = URL.createObjectURL(res.data as Blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = meta.name;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (isImage) {
    return (
      <div className="rounded-xl overflow-hidden max-w-[240px] cursor-pointer" onClick={handleDownload}>
        {blobUrl ? (
          <img src={blobUrl} alt={meta.name} className="w-full object-cover" />
        ) : (
          <div className="w-40 h-28 bg-primary/10 flex items-center justify-center rounded-xl">
            <svg className="w-6 h-6 text-muted-foreground animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
        <p className="text-[11px] mt-1 opacity-70 truncate max-w-[240px]">{meta.name}</p>
      </div>
    );
  }

  return (
    <button
      onClick={handleDownload}
      className={`flex items-center gap-2 rounded-xl px-3 py-2 max-w-[240px] transition-opacity hover:opacity-80 ${
        isMine ? "bg-primary-foreground/10" : "bg-primary/10"
      }`}
    >
      <svg className="w-8 h-8 flex-shrink-0 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <div className="min-w-0 text-left">
        <p className="text-sm font-medium truncate">{meta.name}</p>
        <p className="text-[11px] opacity-60">скачать</p>
      </div>
      <svg className="w-4 h-4 flex-shrink-0 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
    </button>
  );
}

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

  const { data: results = [], isFetching, isError } = useQuery<User[]>({
    queryKey: ["users-search-group", query],
    queryFn: async () => {
      const res = await apiClient.get("/users/search", { params: { q: query } });
      return res.data as User[];
    },
    enabled: query.length >= 2,
    staleTime: 0,
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
            {isError && (
              <p className="text-xs text-destructive px-3 py-2">Ошибка поиска</p>
            )}
            {!isFetching && !isError && results.length === 0 && (
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

// ─── DecryptedText ───────────────────────────────────────────────────────────

function DecryptedText({
  payload,
  sharedKey,
  className,
}: {
  payload: string;
  sharedKey: CryptoKey | null;
  className?: string;
}) {
  const [text, setText] = useState<string>(() =>
    isEncryptedPayload(payload) ? (sharedKey ? "…" : "🔒") : payload,
  );

  useEffect(() => {
    if (!isEncryptedPayload(payload)) {
      setText(payload);
      return;
    }
    if (!sharedKey) {
      setText("🔒 Зашифровано");
      return;
    }
    void decryptPayload(sharedKey, payload).then(setText).catch(() => setText("[ошибка]"));
  }, [payload, sharedKey]);

  return <span className={className}>{text}</span>;
}

// ─── ChatWindow ──────────────────────────────────────────────────────────────

interface PendingAttachment {
  file: File;
  id: string | null;
  uploading: boolean;
}

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
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const [sharedKey, setSharedKey] = useState<CryptoKey | null>(null);
  const queryClient = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);
  const markedReadRef = useRef(new Set<string>());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { typingUsers, deliveryStatuses } = useChatStore();

  const chatId = chat.id;
  const isGroup = chat.type === "group";

  useEffect(() => {
    if (isGroup || !chat.other_user_id) { setSharedKey(null); return; }
    let cancelled = false;
    async function derive() {
      const myKeys = await loadMyKeyPair().catch(() => null);
      if (!myKeys || cancelled) return;
      const res = await apiClient.get<Device[]>(`/users/${chat.other_user_id}/devices`).catch(() => null);
      if (!res || cancelled) return;
      const dev = res.data.find((d) => d.is_active && d.public_identity_key)
        ?? res.data.find((d) => d.public_identity_key);
      if (!dev?.public_identity_key || cancelled) return;
      const theirPub = await importPublicKey(dev.public_identity_key).catch(() => null);
      if (!theirPub || cancelled) return;
      const key = await deriveSharedKey(myKeys.privateKey, theirPub).catch(() => null);
      if (!cancelled && key) setSharedKey(key);
    }
    void derive();
    return () => { cancelled = true; };
  }, [chat.id, chat.other_user_id, isGroup]);
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
    mutationFn: async ({ msg, attachmentId }: { msg: string; attachmentId?: string }) => {
      await apiClient.post("/messages", {
        chat_id: chatId,
        client_message_id: crypto.randomUUID(),
        encrypted_payload: msg,
        encryption_version: "v1",
        message_type: attachmentId ? "attachment" : "text",
        group_keys: [],
        ...(attachmentId ? { attachment_id: attachmentId } : {}),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", chatId] });
      setText("");
      setPendingAttachment(null);
    },
  });

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!e.target) return;
    (e.target as HTMLInputElement).value = "";
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      alert("Файл слишком большой (макс. 100 МБ)");
      return;
    }

    setPendingAttachment({ file, id: null, uploading: true });
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await apiClient.post<{ id: string }>("/attachments/upload", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setPendingAttachment({ file, id: res.data.id, uploading: false });
    } catch {
      setPendingAttachment(null);
      alert("Не удалось загрузить файл");
    }
  }

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const hasAttachment = pendingAttachment?.id != null;
    const hasText = text.trim().length > 0;
    if ((!hasText && !hasAttachment) || sendMutation.isPending || pendingAttachment?.uploading) return;

    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    if (isTypingRef.current) {
      isTypingRef.current = false;
      wsClient.send("typing.stopped", { chat_id: chatId });
    }

    const encrypt = async (s: string) =>
      !isGroup && sharedKey ? encryptPayload(sharedKey, s) : s;

    if (hasAttachment) {
      const att = pendingAttachment!;
      const rawPayload = JSON.stringify({ name: att.file.name, type: att.file.type });
      const msg = await encrypt(text.trim() || rawPayload);
      sendMutation.mutate({ msg, attachmentId: att.id! });
    } else {
      const msg = await encrypt(text.trim());
      sendMutation.mutate({ msg });
    }
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
                  {m.message_type === "attachment" && m.attachment_id ? (
                    <div className="py-0.5">
                      <AttachmentBubble
                        attachmentId={m.attachment_id}
                        payload={m.encrypted_payload}
                        isMine={isMine}
                      />
                      {/* caption if text differs from JSON payload */}
                      {(() => {
                        try {
                          const p = JSON.parse(m.encrypted_payload) as { name?: string };
                          return p.name ? null : <p className="mt-1">{m.encrypted_payload}</p>;
                        } catch { return <p className="mt-1">{m.encrypted_payload}</p>; }
                      })()}
                    </div>
                  ) : (
                    <DecryptedText payload={m.encrypted_payload} sharedKey={sharedKey} />
                  )}
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

      {/* Pending attachment preview */}
      {pendingAttachment && (
        <div className="border-t px-3 pt-2 pb-1 flex items-center gap-2 text-sm flex-shrink-0">
          <svg className="w-4 h-4 text-primary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
          <span className="truncate text-xs flex-1">
            {pendingAttachment.file.name}
            {" "}
            <span className="text-muted-foreground">({formatBytes(pendingAttachment.file.size)})</span>
            {pendingAttachment.uploading && (
              <span className="text-primary ml-1">загрузка...</span>
            )}
          </span>
          <button
            type="button"
            onClick={() => setPendingAttachment(null)}
            className="p-0.5 rounded-full hover:bg-accent transition-colors flex-shrink-0"
            aria-label="Убрать вложение"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Composer */}
      <form
        onSubmit={handleSubmit}
        className="border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex gap-2 flex-shrink-0"
      >
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileSelect}
        />
        {/* Attachment button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="rounded-full w-9 h-9 flex items-center justify-center hover:bg-accent transition-colors flex-shrink-0 text-muted-foreground"
          aria-label="Прикрепить файл"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
        </button>
        <input
          value={text}
          onChange={(e) => handleTyping(e.target.value)}
          placeholder={pendingAttachment ? "Подпись (необязательно)..." : "Сообщение..."}
          className="flex-1 border rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <button
          type="submit"
          disabled={
            (!text.trim() && !pendingAttachment?.id) ||
            sendMutation.isPending ||
            !!pendingAttachment?.uploading
          }
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
  const navigate = useNavigate();

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
                          isEncryptedPayload(lastMsg.text)
                            ? "🔒 Зашифровано"
                            : lastMsg.text.length > 38
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

        {/* Settings link */}
        <div className="border-t p-2 flex-shrink-0">
          <button
            onClick={() => navigate("/settings")}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent transition-colors text-sm text-muted-foreground"
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Настройки
          </button>
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
