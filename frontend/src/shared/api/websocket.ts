import { useAuthStore } from "@/shared/store/auth";
import { ensureAccessToken, refreshAccessToken } from "@/shared/api/auth";

type EventHandler = (payload: unknown) => void;

class WebSocketClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<EventHandler>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private maxDelay = 30_000;
  private shouldReconnect = false;
  private isConnecting = false;

  connect(): void {
    this.shouldReconnect = true;
    if (this.isConnecting || this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      return;
    }
    void this.open();
  }

  private async open(): Promise<void> {
    this.isConnecting = true;
    const token = await ensureAccessToken();
    if (!token) {
      this.isConnecting = false;
      return;
    }
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/ws?token=${token}`;

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.isConnecting = false;
      this.reconnectDelay = 1000;
      this.emit("__connected", null);
    };

    this.ws.onmessage = (event) => {
      try {
        const { type, payload } = JSON.parse(event.data as string);
        this.emit(type, payload);
      } catch {
        // ignore malformed
      }
    };

    this.ws.onclose = (event) => {
      this.ws = null;
      this.isConnecting = false;
      void this.handleClose(event.code);
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close(1000);
    this.ws = null;
  }

  send(type: string, payload: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }));
    }
  }

  on(event: string, handler: EventHandler): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
    return () => this.handlers.get(event)?.delete(handler);
  }

  private emit(event: string, payload: unknown): void {
    this.handlers.get(event)?.forEach((h) => h(payload));
  }

  private async handleClose(code: number): Promise<void> {
    if (!this.shouldReconnect) return;

    if (code === 4001 || !useAuthStore.getState().accessToken) {
      const refreshed = await refreshAccessToken();
      if (!refreshed) return;
    }

    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxDelay);
      this.connect();
    }, this.reconnectDelay);
  }
}

export const wsClient = new WebSocketClient();
