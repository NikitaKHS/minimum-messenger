import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface SettingsState {
  isDark: boolean;
  pinnedChatIds: string[];
  toggleTheme: () => void;
  pinChat: (id: string) => void;
  unpinChat: (id: string) => void;
  isPinned: (id: string) => boolean;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      isDark: true,
      pinnedChatIds: [],

      toggleTheme: () => set((s) => ({ isDark: !s.isDark })),

      pinChat: (id) =>
        set((s) => ({
          pinnedChatIds: s.pinnedChatIds.includes(id)
            ? s.pinnedChatIds
            : [id, ...s.pinnedChatIds],
        })),

      unpinChat: (id) =>
        set((s) => ({ pinnedChatIds: s.pinnedChatIds.filter((c) => c !== id) })),

      isPinned: (id) => get().pinnedChatIds.includes(id),
    }),
    {
      name: 'minimum-settings-v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ isDark: s.isDark, pinnedChatIds: s.pinnedChatIds }),
    },
  ),
);
