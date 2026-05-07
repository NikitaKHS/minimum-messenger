import { create } from "zustand";

interface LastMessage {
  text: string;
  at: string;
  senderId: string;
}

interface DeliveryStatus {
  delivered: boolean;
  read: boolean;
}

interface ChatStore {
  typingUsers: Record<string, string[]>;
  onlineUsers: Record<string, boolean>;
  unreadCounts: Record<string, number>;
  lastMessages: Record<string, LastMessage>;
  deliveryStatuses: Record<string, DeliveryStatus>;

  setTyping: (chatId: string, userId: string, isTyping: boolean) => void;
  setOnline: (userId: string, status: "online" | "offline") => void;
  incUnread: (chatId: string) => void;
  clearUnread: (chatId: string) => void;
  setLastMessage: (chatId: string, msg: LastMessage) => void;
  setDelivered: (messageId: string) => void;
  setRead: (messageId: string) => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  typingUsers: {},
  onlineUsers: {},
  unreadCounts: {},
  lastMessages: {},
  deliveryStatuses: {},

  setTyping: (chatId, userId, isTyping) =>
    set((s) => {
      const current = s.typingUsers[chatId] ?? [];
      const updated = isTyping
        ? current.includes(userId) ? current : [...current, userId]
        : current.filter((u) => u !== userId);
      return { typingUsers: { ...s.typingUsers, [chatId]: updated } };
    }),

  setOnline: (userId, status) =>
    set((s) => ({
      onlineUsers: { ...s.onlineUsers, [userId]: status === "online" },
    })),

  incUnread: (chatId) =>
    set((s) => ({
      unreadCounts: { ...s.unreadCounts, [chatId]: (s.unreadCounts[chatId] ?? 0) + 1 },
    })),

  clearUnread: (chatId) =>
    set((s) => ({ unreadCounts: { ...s.unreadCounts, [chatId]: 0 } })),

  setLastMessage: (chatId, msg) =>
    set((s) => ({ lastMessages: { ...s.lastMessages, [chatId]: msg } })),

  setDelivered: (messageId) =>
    set((s) => ({
      deliveryStatuses: {
        ...s.deliveryStatuses,
        [messageId]: {
          delivered: true,
          read: s.deliveryStatuses[messageId]?.read ?? false,
        },
      },
    })),

  setRead: (messageId) =>
    set((s) => ({
      deliveryStatuses: {
        ...s.deliveryStatuses,
        [messageId]: { delivered: true, read: true },
      },
    })),
}));
