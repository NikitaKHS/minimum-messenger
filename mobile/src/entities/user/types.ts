export interface User {
  id: string;
  username: string;
  email?: string | null;
  avatar_url?: string | null;
  public_key_fingerprint?: string | null;
  created_at?: string;
}
