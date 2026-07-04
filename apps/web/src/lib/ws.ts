import { useCallback, useEffect, useRef, useState } from 'react';

// --- Types based on Contract ---

export interface WsEnvelope<T = any> {
  op: string;
  d: T;
  id?: string;
}

export type ServerOp = 
  | "ready"
  | "message.created"
  | "message.updated"
  | "message.deleted"
  | "typing"
  | "presence"
  | "pong"
  | "error";

export type ClientOp = 
  | "subscribe"
  | "unsubscribe"
  | "message.send"
  | "typing.start"
  | "presence.update"
  | "ping";

// Payload types inferred from contract descriptions
interface ReadyPayload {
  user: any; // Simplified based on contract
  servers: any[];
}

interface MessageCreatedPayload {
  message: any;
}

interface MessageUpdatedPayload {
  message: any;
}

interface MessageDeletedPayload {
  id: string;
  channelId: string;
}

interface TypingPayload {
  channelId: string;
  userId: string;
}

interface PresencePayload {
  userId: string;
  status: string; // UserStatus enum values
}

interface ErrorPayload {
  message: string;
}

// --- Client Implementation ---

export class WsClient {
  private ws: WebSocket | null = null;
  private url: string | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private baseDelay = 1000;
  private listeners: Map<string, Set<(data: any) => void>> = new Map();
  private globalListeners: Set<(op: string, data: any) => void> = new Set();
  private subscriptions: Set<string> = new Set();

  constructor() {
    // Bind methods to preserve 'this' context if needed, though class instance is usually stable
    this.connect = this.connect.bind(this);
    this.disconnect = this.disconnect.bind(this);
    this.subscribe = this.subscribe.bind(this);
    this.unsubscribe = this.unsubscribe.bind(this);
    this.sendMessage = this.sendMessage.bind(this);
  }

  private getReconnectDelay(): number {
    const delay = this.baseDelay * Math.pow(2, this.reconnectAttempts);
    return Math.min(delay, 30000); // Cap at 30s
  }

  async connect(ticket: string): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host || 'localhost';
    this.url = `${protocol}//${host}/ws?ticket=${encodeURIComponent(ticket)}`;

    try {
      this.ws = new WebSocket(this.url);
      
      this.ws.onopen = () => {
        console.log('[WS] Connected');
        this.reconnectAttempts = 0;
        
        // Re-subscribe to previous channels if any
        for (const channelId of this.subscriptions) {
          this.send({ op: 'subscribe', d: { channelId } });
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const envelope: WsEnvelope = JSON.parse(event.data);
          this.handleMessage(envelope);
        } catch (e) {
          console.error('[WS] Failed to parse message', e);
        }
      };

      this.ws.onclose = () => {
        console.log('[WS] Disconnected');
        this.ws = null;
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          const delay = this.getReconnectDelay();
          console.log(`[WS] Reconnecting in ${delay}ms...`);
          setTimeout(() => {
            this.connect(ticket); // Note: In a real app, you might want to refresh ticket if it expires
          }, delay);
        } else {
          console.error('[WS] Max reconnect attempts reached');
        }
      };

      this.ws.onerror = (error) => {
        console.error('[WS] Error', error);
      };

    } catch (e) {
      console.error('[WS] Connection failed', e);
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private handleMessage(envelope: WsEnvelope) {
    const { op, d } = envelope;
    
    // Dispatch to specific channel listeners
    if (d && typeof d === 'object' && 'channelId' in d) {
      const channelId = (d as any).channelId;
      const channelListeners = this.listeners.get(channelId);
      if (channelListeners) {
        channelListeners.forEach(cb => cb(envelope));
      }
    }

    // Dispatch to global listeners
    this.globalListeners.forEach(cb => cb(op, d));
  }

  send<T>(envelope: WsEnvelope<T>) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(envelope));
    } else {
      console.warn('[WS] Cannot send message: not connected');
    }
  }

  subscribe(channelId: string) {
    this.subscriptions.add(channelId);
    if (!this.listeners.has(channelId)) {
      this.listeners.set(channelId, new Set());
    }
    
    // Send subscription to server
    this.send({ op: 'subscribe', d: { channelId } });
  }

  unsubscribe(channelId: string) {
    this.subscriptions.delete(channelId);
    this.listeners.delete(channelId);
    this.send({ op: 'unsubscribe', d: { channelId } });
  }

  on(op: ServerOp | '*', callback: (data: any, envelope?: WsEnvelope) => void): () => void {
    const listener = (eventOp: string, data: any) => {
      if (op === '*' || eventOp === op) {
        // We need to reconstruct the envelope or pass it. 
        // Since we don't have the full envelope here easily without refactoring handleMessage slightly,
        // let's assume the callback just needs data for now, or we can improve this later.
        // For strict contract adherence, let's try to pass minimal info.
        callback(data);
      }
    };
    
    this.globalListeners.add(listener as any);
    return () => {
      this.globalListeners.delete(listener as any);
    };
  }

  onChannel(channelId: string, callback: (envelope: WsEnvelope) => void): () => void {
    if (!this.listeners.has(channelId)) {
      this.listeners.set(channelId, new Set());
    }
    const channelListeners = this.listeners.get(channelId)!;
    channelListeners.add(callback);

    return () => {
      channelListeners.delete(callback);
      if (channelListeners.size === 0) {
        this.listeners.delete(channelId);
      }
    };
  }

  sendMessage(channelId: string, content: string, nonce?: string, attachments?: any[]) {
    this.send({
      op: 'message.send',
      d: { channelId, content, nonce, attachments },
    });
  }

  ping() {
    this.send({ op: 'ping', d: {} });
  }
}

// --- React Hook ---

export function useWsClient() {
  const clientRef = useRef<WsClient | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize client once
  if (!clientRef.current) {
    clientRef.current = new WsClient();
    
    clientRef.current.on('ready', () => {
      setIsConnected(true);
      setError(null);
    });

    clientRef.current.on('error', (data: ErrorPayload) => {
      setError(data.message);
    });
  }

  const connect = useCallback(async () => {
    try {
      // Fetch ticket from API
      const response = await fetch('/api/auth/ws-ticket');
      if (!response.ok) {
        throw new Error('Failed to get WS ticket');
      }
      const { ticket, expiresAt } = await response.json();
      
      clientRef.current?.connect(ticket);
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    // Auto-connect on mount if needed, or let component trigger it. 
    // Usually better to trigger explicitly after auth check in parent.
    // For this hook, we'll just expose the connect function.
    
    return () => {
      clientRef.current?.disconnect();
    };
  }, []);

  const subscribe = useCallback((channelId: string) => {
    clientRef.current?.subscribe(channelId);
  }, []);

  const unsubscribe = useCallback((channelId: string) => {
    clientRef.current?.unsubscribe(channelId);
  }, []);

  const sendMessage = useCallback((channelId: string, content: string, nonce?: string, attachments?: any[]) => {
    clientRef.current?.sendMessage(channelId, content, nonce, attachments);
  }, []);

  return {
    isConnected,
    error,
    connect,
    subscribe,
    unsubscribe,
    sendMessage,
    on: (op: ServerOp | '*', cb: any) => clientRef.current?.on(op, cb),
    onChannel: (channelId: string, cb: any) => clientRef.current?.onChannel(channelId, cb),
  };
}

// Singleton instance for non-React usage if needed
export const wsClient = new WsClient();
