export interface Message {
  id: string;
  chat_id: string;
  sender_user_id: string;
  sender_device_id: string;
  client_message_id: string;
  encrypted_payload: string;
  encryption_version: string;
  message_type: "text" | "attachment" | "system";
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  sender_username?: string | null;
  decrypted_text?: string;
}

export interface DecryptedMessage extends Message {
  decrypted_text: string;
}
