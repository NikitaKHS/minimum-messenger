export interface Chat {
  id: string;
  type: "direct" | "group" | "system";
  title: string | null;
  avatarUrl: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMember {
  userId: string;
  role: "owner" | "admin" | "member";
  joinedAt: string;
  leftAt: string | null;
  mutedUntil: string | null;
}
