import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/shared/api/client";
import { wsClient } from "@/shared/api/websocket";
import { useAuthStore } from "@/shared/store/auth";
import type { Chat } from "@/entities/chat/types";
import type { Message } from "@/entities/message/types";

export default function ChatsPage() {
  const { chatId } = useParams<{ chatId?: string }>();
  const [activeChatId, setActiveChatId] = useState<string | null>(chatId ?? null);
  const queryClient = useQueryClient();
  const { accessToken } = useAuthStore();

  // Connect WS on mount
  useEffect(() => {
    if (accessToken) wsClient.connect();
    return () => wsClient.disconnect();
  }, [accessToken]);

  // Subscribe to new messages
  useEffect(() => {
    const unsub = wsClient.on("message.new", (payload) => {
      const msg = payload as { chat_id: string };
      queryClient.invalidateQueries({ queryKey: ["messages", msg.chat_id] });
      queryClient.invalidateQueries({ queryKey: ["chats"] });
    });
    return unsub;
  }, [queryClient]);

  const { data: chats = [] } = useQuery<Chat[]>({
    queryKey: ["chats"],
    queryFn: async () => {
      const res = await apiClient.get("/chats");
      return res.data;
    },
    enabled: !!accessToken,
  });

  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ["messages", activeChatId],
    queryFn: async () => {
      const res = await apiClient.get(`/chats/${activeChatId}/messages`);
      return res.data.items;
    },
    enabled: !!activeChatId,
  });

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar — chat list */}
      <aside className="w-72 border-r flex flex-col">
        <div className="p-4 border-b">
          <div className="flex items-center gap-2">
            <img src="/icon.png" alt="Minimum" className="w-7 h-7" />
            <span className="font-semibold text-lg">Minimum</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {chats.map((chat) => (
            <button
              key={chat.id}
              onClick={() => setActiveChatId(chat.id)}
              className={`w-full text-left px-4 py-3 hover:bg-accent transition-colors ${
                activeChatId === chat.id ? "bg-accent" : ""
              }`}
            >
              <p className="font-medium truncate">
                {chat.title ?? (chat.type === "direct" ? "Direct" : "Group")}
              </p>
              <p className="text-xs text-muted-foreground truncate">{chat.type}</p>
            </button>
          ))}
          {chats.length === 0 && (
            <p className="text-muted-foreground text-sm p-4">No chats yet</p>
          )}
        </div>
      </aside>

      {/* Main area */}
      <main className="flex-1 flex flex-col">
        {activeChatId ? (
          <ChatWindow chatId={activeChatId} messages={messages} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            Select a chat to start messaging
          </div>
        )}
      </main>
    </div>
  );
}

function ChatWindow({ chatId, messages }: { chatId: string; messages: Message[] }) {
  const [text, setText] = useState("");
  const queryClient = useQueryClient();

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

  return (
    <>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {[...messages].reverse().map((m) => (
          <div key={m.id} className="max-w-xl">
            <div className="bg-secondary rounded-lg px-3 py-2 inline-block text-sm">
              <span className="text-muted-foreground">[encrypted] </span>
              {m.encrypted_payload.slice(0, 40)}…
            </div>
          </div>
        ))}
      </div>
      {/* Composer */}
      <form
        className="border-t p-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) sendMutation.mutate(text.trim());
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="flex-1 border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="Message…"
        />
        <button
          type="submit"
          disabled={!text.trim() || sendMutation.isPending}
          className="bg-primary text-primary-foreground rounded px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </>
  );
}
