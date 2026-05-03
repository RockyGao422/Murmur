/**
 * Native Messaging client for Murmur Browser Extension.
 * Connects to the macOS Murmur app to sync detected sessions.
 * Uses chrome.runtime.connectNative for communication.
 *
 * P1 feature — extension works independently without this connection.
 */

const HOST_NAME = 'app.murmur.native_host';

class NativeMessagingClient {
  constructor() {
    this.port = null;
    this.connected = false;
    this.connectionListeners = [];
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
  }

  /**
   * Attempt to connect to the native messaging host.
   * @returns {boolean} true if connection attempt started
   */
  connect() {
    if (this.port) {
      return true;
    }

    try {
      this.port = chrome.runtime.connectNative(HOST_NAME);
      this.setupPortHandlers();
      return true;
    } catch (error) {
      console.debug('[Murmur NM] Native host not available:', error.message);
      this.port = null;
      this.connected = false;
      this.notifyListeners(false);
      return false;
    }
  }

  setupPortHandlers() {
    this.port.onMessage.addListener((message) => {
      this.handleMessage(message);
    });

    this.port.onDisconnect.addListener(() => {
      const wasConnected = this.connected;
      this.connected = false;
      this.port = null;

      if (wasConnected) {
        this.notifyListeners(false);
      }

      // Log disconnect reason
      if (chrome.runtime.lastError) {
        console.debug('[Murmur NM] Disconnected:', chrome.runtime.lastError.message);
      }

      // Attempt reconnect if previously connected
      if (wasConnected && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.scheduleReconnect();
      }
    });
  }

  handleMessage(message) {
    if (message.type === 'connection_ack') {
      this.connected = true;
      this.reconnectAttempts = 0;
      this.notifyListeners(true);
      console.debug('[Murmur NM] Connected to macOS app');
    }
  }

  /**
   * Send a detected session to the macOS app.
   * @param {DetectedSession} session
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
  async sendSession(session) {
    if (!this.port || !this.connected) {
      if (!this.connect()) {
        return { ok: false, error: 'Not connected to macOS app' };
      }
      // Wait briefly for connection acknowledgement
      await new Promise(resolve => setTimeout(resolve, 200));
      if (!this.connected) {
        return { ok: false, error: 'Connection not established' };
      }
    }

    const message = {
      type: 'detected_session',
      schemaVersion: 1,
      payload: {
        id: session.id || crypto.randomUUID(),
        sourcePlatform: 'browser',
        toolId: session.toolId,
        toolName: session.toolName,
        rawDomain: session.rawDomain,
        rawUrlPattern: session.rawUrlPattern,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        activeSeconds: session.activeSeconds,
        confidence: session.confidence,
        promptCount: session.promptCount || undefined
      }
    };

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ ok: false, error: 'Response timeout' });
      }, 5000);

      const responseHandler = (response) => {
        clearTimeout(timeout);
        this.port.onMessage.removeListener(responseHandler);
        resolve({
          ok: response?.status === 'ok',
          error: response?.status !== 'ok' ? response?.message : undefined
        });
      };

      this.port.onMessage.addListener(responseHandler);
      this.port.postMessage(message);
    });
  }

  /**
   * Send a batch of sessions to the macOS app.
   * @param {DetectedSession[]} sessions
   * @returns {Promise<{synced: number, failed: number}>}
   */
  async sendBatch(sessions) {
    let synced = 0;
    let failed = 0;

    for (const session of sessions) {
      const result = await this.sendSession(session);
      if (result.ok) {
        synced++;
      } else {
        failed++;
      }
    }

    return { synced, failed };
  }

  /**
   * Register a connection status listener.
   * @param {(connected: boolean) => void} listener
   */
  onConnectionChange(listener) {
    this.connectionListeners.push(listener);
    // Immediately notify with current status
    listener(this.connected);
  }

  notifyListeners(status) {
    for (const listener of this.connectionListeners) {
      try { listener(status); } catch (_) { /* ignore */ }
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.reconnectAttempts++;
    // Exponential backoff: 1s, 2s, 4s, 8s, ...
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 60000);
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Check if the native messaging host is available.
   * @returns {boolean}
   */
  isConnected() {
    return this.connected;
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = this.maxReconnectAttempts; // Prevent reconnect
    if (this.port) {
      this.port.disconnect();
      this.port = null;
    }
    this.connected = false;
    this.notifyListeners(false);
  }
}

// Singleton
const nativeMessaging = new NativeMessagingClient();
