export interface Chat {
  id: string;
  type: "direct" | "group" | "system";
  title: string | null;
  avatar_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  other_username: string | null;
  other_user_id?: string | null;
}

export interface ChatMember {
  user_id: string;
  role: "owner" | "admin" | "member";
  joined_at: string;
  left_at: string | null;
  muted_until: string | null;
}
