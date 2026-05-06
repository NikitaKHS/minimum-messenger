import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/shared/api/client";
import { wsClient } from "@/shared/api/websocket";
import { useAuthStore } from "@/shared/store/auth";
import type { Chat } from "@/entities/chat/types";
import type { Message } from "@/entities/message/types";
import type { User } from "@/entities/user/types";

export default function ChatsPage() {
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const queryClient = useQueryClient();
  const { accessToken, userId } = useAuthStore();
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (accessToken) wsClient.connect();
    return () => wsClient.disconnect();
  }, [accessToken]);

  useEffect(() => {
    const unsub = wsClient.on("message.new", (payload) => {
      const msg = payload as { chat_id: string };
      queryClient.invalidateQueries({ queryKey: ["messages", msg.chat_id] });
      queryClient.invalidateQueries({ queryKey: ["chats"] });
    });
    return unsub;
  }, [queryClient]);

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

  const createDirectMutation = useMutation({
    mutationFn: async (otherUserId: string) => {
      const res = await apiClient.post("/chats/direct", { other_user_id: otherUserId });
      return res.data as Chat;
    },
    onSuccess: (chat) => {
      queryClient.invalidateQueries({ queryKey: ["chats"] });
      setActiveChatId(chat.id);
      setShowSearch(false);
      setSearchQuery("");
      setMobileChatOpen(true);
    },
  });

  const activeChat = chats.find((c) => c.id === activeChatId) ?? null;

  function chatDisplayName(chat: Chat): string {
    if (chat.type === "direct") return chat.other_username ? `@${chat.other_username}` : "Личный чат";
    return chat.title ?? "Группа";
  }

  function openChat(id: string) {
    setActiveChatId(id);
    setMobileChatOpen(true);
  }

  return (
    <div className="flex h-[100dvh] bg-background overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`
          flex flex-col border-r bg-background
          w-full md:w-72 md:flex flex-shrink-0
          ${mobileChatOpen ? "hidden md:flex" : "flex"}
        `}
      >
        {/* Header */}
        <div className="p-4 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img src="/icon.png" alt="Minimum" className="w-7 h-7" />
              <span className="font-semibold text-lg">Minimum</span>
            </div>
            <button
              onClick={() => { setShowSearch(true); setSearchQuery(""); }}
              className="rounded-full p-1.5 hover:bg-accent transition-colors"
              title="Новый чат"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
        </div>

        {/* Search panel */}
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
          {chats.map((chat) => (
            <button
              key={chat.id}
              onClick={() => openChat(chat.id)}
              className={`w-full text-left px-4 py-3 hover:bg-accent transition-colors border-b border-border/40 ${
                activeChatId === chat.id ? "bg-accent" : ""
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 text-base font-semibold">
                  {(chatDisplayName(chat).replace("@", "") || "?")[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="font-medium truncate text-sm">{chatDisplayName(chat)}</p>
                  <p className="text-xs text-muted-foreground capitalize">{chat.type === "direct" ? "личный" : "группа"}</p>
                </div>
              </div>
            </button>
          ))}
          {chats.length === 0 && !showSearch && (
            <div className="p-6 text-center">
              <p className="text-muted-foreground text-sm">Нет чатов</p>
              <p className="text-xs text-muted-foreground mt-1">Нажмите + чтобы начать</p>
            </div>
          )}
        </div>
      </aside>

      {/* Main chat area */}
      <main
        className={`
          flex-1 flex flex-col min-w-0
          ${mobileChatOpen ? "flex" : "hidden md:flex"}
        `}
      >
        {activeChatId && activeChat ? (
          <ChatWindow
            chatId={activeChatId}
            chatTitle={chatDisplayName(activeChat)}
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

function ChatWindow({
  chatId,
  chatTitle,
  messages,
  currentUserId,
  onBack,
}: {
  chatId: string;
  chatTitle: string;
  messages: Message[];
  currentUserId: string;
  onBack: () => void;
}) {
  const [text, setText] = useState("");
  const queryClient = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

  const sorted = [...messages].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  return (
    <>
      {/* Header */}
      <div className="border-b px-4 py-3 flex items-center gap-3 flex-shrink-0">
        {/* Back button — mobile only */}
        <button
          onClick={onBack}
          className="md:hidden p-1 -ml-1 rounded hover:bg-accent transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-semibold flex-shrink-0">
          {chatTitle.replace("@", "")[0]?.toUpperCase() ?? "?"}
        </div>
        <span className="font-medium text-sm truncate">{chatTitle}</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        {sorted.length === 0 && (
          <p className="text-center text-muted-foreground text-sm mt-8">
            Нет сообщений. Напишите первым!
          </p>
        )}
        {sorted.map((m) => {
          const isMine = m.sender_user_id === currentUserId;
          return (
            <div key={m.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
              <div
                className={`
                  rounded-2xl px-3 py-2 max-w-[75%] text-sm break-words
                  ${isMine
                    ? "bg-primary text-primary-foreground rounded-tr-sm"
                    : "bg-secondary text-secondary-foreground rounded-tl-sm"
                  }
                `}
              >
                {m.encrypted_payload}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <form
        className="border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex gap-2 flex-shrink-0"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) sendMutation.mutate(text.trim());
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="flex-1 border rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="Сообщение..."
        />
        <button
          type="submit"
          disabled={!text.trim() || sendMutation.isPending}
          className="bg-primary text-primary-foreground rounded-full w-9 h-9 flex items-center justify-center disabled:opacity-50 flex-shrink-0"
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
