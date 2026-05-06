export interface User {
  id: string;
  username: string;
  email: string | null;
  status: string;
  createdAt: string;
}

export interface Device {
  id: string;
  userId: string;
  deviceName: string;
  deviceType: string;
  platform: string | null;
  publicKeyFingerprint: string;
  isActive: boolean;
  createdAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
}
