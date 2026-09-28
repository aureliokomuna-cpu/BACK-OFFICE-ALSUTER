import mqtt, { type MqttClient } from 'mqtt';
import type { BreakSession, Employee } from '../types';

// Topic dedicated to Informa Alam Sutera Break Management
export const SYNC_TOPIC = 'informa/alamsutera/v1/sessions_state';

interface SyncPayload {
  type: 'SYNC_STATE';
  sessions: BreakSession[];
  employees?: Employee[];
  updatedAt: number;
  lastResetTime?: number;
  senderId: string;
}

type SyncStatus = 'connected' | 'connecting' | 'disconnected' | 'error';
type SyncListener = (sessions: BreakSession[], employees?: Employee[], lastResetTime?: number) => void;
type StatusListener = (status: SyncStatus) => void;

class CloudSyncService {
  private client: MqttClient | null = null;
  private clientId: string;
  private currentStatus: SyncStatus = 'disconnected';
  private syncListeners: Set<SyncListener> = new Set();
  private statusListeners: Set<StatusListener> = new Set();
  private lastPublishedAt = 0;
  private isConnecting = false;

  // Single reliable high-speed public MQTT WebSocket broker
  private brokerUrl = 'wss://broker.emqx.io:8084/mqtt';

  constructor() {
    this.clientId = 'mgr_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now().toString(36);
    if (typeof window !== 'undefined') {
      this.init();
      this.setupLifecycleHooks();
    }
  }

  public getStatus(): SyncStatus {
    return this.currentStatus;
  }

  public onSync(listener: SyncListener): () => void {
    this.syncListeners.add(listener);
    return () => this.syncListeners.delete(listener);
  }

  public onStatusChange(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.currentStatus);
    return () => this.statusListeners.delete(listener);
  }

  private setStatus(status: SyncStatus) {
    if (this.currentStatus !== status) {
      this.currentStatus = status;
      this.statusListeners.forEach((l) => {
        try {
          l(status);
        } catch {}
      });
    }
  }

  public init() {
    if (this.isConnecting || (this.client && this.client.connected)) return;
    this.isConnecting = true;
    this.setStatus('connecting');

    try {
      this.client = mqtt.connect(this.brokerUrl, {
        clientId: this.clientId,
        clean: true,
        connectTimeout: 8000,
        reconnectPeriod: 2500,
        keepalive: 20,
      });

      this.client.on('connect', () => {
        this.isConnecting = false;
        this.setStatus('connected');

        // Subscribe to retain message & live updates
        this.client?.subscribe(SYNC_TOPIC, { qos: 1 }, (err) => {
          if (err) {
            console.warn('[CloudSync] Subscription error:', err);
          }
        });
      });

      this.client.on('message', (topic, message) => {
        if (topic !== SYNC_TOPIC) return;
        try {
          const payload: SyncPayload = JSON.parse(message.toString());
          if (!payload || !Array.isArray(payload.sessions)) return;

          // Ignore own echoing updates if received within 1 second of sending
          if (payload.senderId === this.clientId && Date.now() - this.lastPublishedAt < 1000) {
            return;
          }

          this.syncListeners.forEach((listener) => {
            try {
              listener(payload.sessions, payload.employees, payload.lastResetTime);
            } catch (e) {
              console.error('[CloudSync] Listener error:', e);
            }
          });
        } catch (e) {
          console.warn('[CloudSync] Failed to parse payload:', e);
        }
      });

      this.client.on('close', () => {
        this.setStatus('disconnected');
      });

      this.client.on('offline', () => {
        this.setStatus('disconnected');
      });

      this.client.on('error', (err) => {
        console.warn('[CloudSync] Broker connection notice:', err?.message || err);
        this.setStatus('error');
      });
    } catch (e) {
      this.isConnecting = false;
      this.setStatus('error');
    }
  }

  private setupLifecycleHooks() {
    // When browser tab gains focus or mobile screen unlocks, refresh connection
    const handleReactivate = () => {
      if (!this.client || !this.client.connected) {
        this.init();
      }
    };

    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        handleReactivate();
      }
    });

    window.addEventListener('focus', handleReactivate);
    window.addEventListener('pageshow', handleReactivate);
    window.addEventListener('online', handleReactivate);
  }

  /**
   * Broadcast current sessions state to all connected devices.
   * Uses MQTT Retain flag so any newly opened device immediately gets this state.
   */
  public publishState(sessions: BreakSession[], employees?: Employee[], lastResetTime: number = 0) {
    if (!this.client || !this.client.connected) {
      this.init();
    }

    const payload: SyncPayload = {
      type: 'SYNC_STATE',
      sessions,
      employees,
      updatedAt: Date.now(),
      lastResetTime,
      senderId: this.clientId,
    };

    this.lastPublishedAt = Date.now();

    try {
      this.client?.publish(SYNC_TOPIC, JSON.stringify(payload), { retain: true, qos: 1 });
    } catch (e) {
      console.warn('[CloudSync] Publish failed:', e);
    }
  }
}

export const cloudSync = new CloudSyncService();
