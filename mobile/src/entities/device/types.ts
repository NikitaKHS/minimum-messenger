export interface Device {
  id: string;
  user_id: string;
  device_name: string;
  device_type: string;
  platform: string | null;
  public_identity_key: string | null;
  public_key_fingerprint: string;
  is_active: boolean;
  created_at: string;
  last_seen_at: string | null;
  revoked_at: string | null;
}
