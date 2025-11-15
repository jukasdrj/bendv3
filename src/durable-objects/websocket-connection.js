import { DurableObject } from 'cloudflare:workers';

/**
 * WebSocket Connection Durable Object
 * 
 * Responsibility: WebSocket connection lifecycle management ONLY
 * - Manages WebSocket connections per job
 * - Handles authentication and token validation
 * - Routes messages to appropriate state manager
 * - Broadcasts messages to connected clients
 * 
 * This DO is part of the refactored architecture that separates concerns:
 * - WebSocketConnectionDO: Connection management (this file)
 * - JobStateManagerDO: State persistence
 * - Services: Business logic (csv-processor, batch-enrichment)
 * 
 * Related: Issue #68 - Refactor Monolithic ProgressWebSocketDO
 */
export class WebSocketConnectionDO extends DurableObject {
  constructor(state, env) {
    super(state, env);
    this.storage = state.storage;
    this.webSocket = null;
    this.jobId = null;
    this.isReady = false;
    this.readyPromise = null;
    this.readyResolver = null;
  }

  /**
   * Handle WebSocket upgrade request
   * 
   * @param {Request} request - Upgrade request with jobId and token
   * @returns {Promise<Response>} WebSocket upgrade response or error
   */
  async fetch(request) {
    const upgradeStartTime = Date.now();
    const url = new URL(request.url);
    const upgradeHeader = request.headers.get('Upgrade');

    console.log('[WebSocketConnectionDO] Incoming request', {
      url: url.toString(),
      upgradeHeader,
      method: request.method,
      timestamp: upgradeStartTime
    });

    // Validate WebSocket upgrade
    if (!upgradeHeader || upgradeHeader !== 'websocket') {
      console.warn('[WebSocketConnectionDO] Invalid upgrade header', { upgradeHeader });
      return new Response('Expected Upgrade: websocket', {
        status: 426,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'text/plain'
        }
      });
    }

    // Extract jobId from query params
    const jobId = url.searchParams.get('jobId');
    if (!jobId) {
      console.error('[WebSocketConnectionDO] Missing jobId parameter');
      return new Response('Missing jobId parameter', { 
        status: 400,
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    }

    // SECURITY: Validate authentication token
    const providedToken = url.searchParams.get('token');
    const storageStartTime = Date.now();
    const [storedToken, expiration] = await Promise.all([
      this.storage.get('authToken'),
      this.storage.get('authTokenExpiration')
    ]);
    const storageDuration = Date.now() - storageStartTime;

    console.log(`[${jobId}] Storage reads took ${storageDuration}ms`);

    if (!storedToken || !providedToken || storedToken !== providedToken) {
      console.warn(`[${jobId}] WebSocket authentication failed - invalid token`);
      return new Response('Unauthorized', {
        status: 401,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'text/plain'
        }
      });
    }

    if (Date.now() > expiration) {
      console.warn(`[${jobId}] WebSocket authentication failed - token expired`);
      return new Response('Token expired', {
        status: 401,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'text/plain'
        }
      });
    }

    console.log(`[${jobId}] ✅ WebSocket authentication successful`);

    // Create WebSocket pair
    const pairStartTime = Date.now();
    const [client, server] = Object.values(new WebSocketPair());
    const pairDuration = Date.now() - pairStartTime;

    // Store server-side WebSocket
    this.webSocket = server;
    this.jobId = jobId;

    // Accept connection
    const acceptStartTime = Date.now();
    this.webSocket.accept();
    const acceptDuration = Date.now() - acceptStartTime;

    // Initialize ready promise
    this.readyPromise = new Promise((resolve) => {
      this.readyResolver = resolve;
    });

    const totalUpgradeDuration = Date.now() - upgradeStartTime;
    console.log(`[${this.jobId}] WebSocket connection accepted, waiting for ready signal`);
    console.log(`[${this.jobId}] 📊 WebSocket upgrade timing:`, {
      storageDuration: `${storageDuration}ms`,
      pairCreation: `${pairDuration}ms`,
      accept: `${acceptDuration}ms`,
      totalUpgrade: `${totalUpgradeDuration}ms`
    });

    // Setup event handlers
    this.webSocket.addEventListener('message', (event) => {
      this.handleMessage(event.data);
    });

    this.webSocket.addEventListener('close', (event) => {
      console.log(`[${this.jobId}] WebSocket closed:`, event.code, event.reason);
      this.cleanup();
    });

    this.webSocket.addEventListener('error', (event) => {
      console.error(`[${this.jobId}] WebSocket error:`, event);
      this.cleanup();
    });

    // Return client-side WebSocket to client
    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: {
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  /**
   * Handle incoming WebSocket messages
   * 
   * @param {string} data - Message data from client
   */
  handleMessage(data) {
    console.log(`[${this.jobId}] Received message:`, data);

    try {
      const msg = JSON.parse(data);

      // Validate message structure
      if (!msg || typeof msg !== 'object') {
        console.warn(`[${this.jobId}] Invalid message structure: not an object`);
        return;
      }

      if (!msg.type || typeof msg.type !== 'string') {
        console.warn(`[${this.jobId}] Invalid message structure: missing or invalid 'type' field`, msg);
        return;
      }

      // Handle ready signal
      if (msg.type === 'ready') {
        console.log(`[${this.jobId}] ✅ Client ready signal received`);
        this.isReady = true;

        // Resolve the ready promise to unblock processing
        if (this.readyResolver) {
          this.readyResolver();
          this.readyResolver = null;
        }

        // Send acknowledgment back to client
        this.send({
          type: 'ready_ack',
          jobId: this.jobId,
          timestamp: Date.now(),
          version: '2.0.0'
        });
      } else {
        console.log(`[${this.jobId}] Unknown message type: ${msg.type}`);
      }
    } catch (error) {
      console.error(`[${this.jobId}] Failed to parse message:`, error);
    }
  }

  /**
   * RPC Method: Set authentication token for WebSocket connection
   * Called by handlers before starting background processing
   * 
   * @param {string} token - Authentication token (UUID)
   * @returns {Promise<{success: boolean}>}
   */
  async setAuthToken(token) {
    await this.storage.put('authToken', token);
    // Tokens expire after 2 hours
    await this.storage.put('authTokenExpiration', Date.now() + (2 * 60 * 60 * 1000));
    console.log(`[${this.jobId || 'unknown'}] Auth token set (expires in 2 hours)`);
    return { success: true };
  }

  /**
   * RPC Method: Wait for client ready signal
   * 
   * @param {number} timeoutMs - Timeout in milliseconds
   * @returns {Promise<{timedOut: boolean, disconnected: boolean}>}
   */
  async waitForReady(timeoutMs = 5000) {
    if (this.isReady) {
      return { timedOut: false, disconnected: false };
    }

    // Fix: Check BOTH webSocket AND readyPromise to prevent race condition
    if (!this.webSocket || !this.readyPromise) {
      return { timedOut: false, disconnected: true };
    }

    try {
      await Promise.race([
        this.readyPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeoutMs))
      ]);
      return { timedOut: false, disconnected: false };
    } catch (error) {
      if (error.message === 'Timeout') {
        return { timedOut: true, disconnected: false };
      }
      throw error;
    }
  }

  /**
   * RPC Method: Send message to connected client
   * 
   * @param {Object} message - Message to send
   * @returns {Promise<{success: boolean}>}
   */
  async send(message) {
    if (!this.webSocket) {
      console.warn(`[${this.jobId}] Cannot send message - no WebSocket connection`);
      return { success: false };
    }

    try {
      this.webSocket.send(JSON.stringify(message));
      return { success: true };
    } catch (error) {
      console.error(`[${this.jobId}] Failed to send message:`, error);
      return { success: false };
    }
  }

  /**
   * RPC Method: Close WebSocket connection
   * 
   * @param {string} reason - Reason for closing
   * @returns {Promise<{success: boolean}>}
   */
  async closeConnection(reason = 'Job completed') {
    if (this.webSocket) {
      console.log(`[${this.jobId}] Closing WebSocket: ${reason}`);
      try {
        this.webSocket.close(1000, reason);
      } catch (error) {
        console.error(`[${this.jobId}] Error closing WebSocket:`, error);
      }
    }
    this.cleanup();
    return { success: true };
  }

  /**
   * RPC Method: Clean up stored authentication data
   * Called by JobStateManagerDO during final cleanup to prevent storage leak
   *
   * @returns {Promise<{success: boolean}>}
   */
  async cleanupStorage() {
    await this.storage.delete('authToken');
    await this.storage.delete('authTokenExpiration');
    console.log(`[${this.jobId || 'unknown'}] Auth token storage cleaned up`);
    return { success: true };
  }

  /**
   * Internal cleanup
   */
  cleanup() {
    this.webSocket = null;
    this.jobId = null;
    this.isReady = false;
    this.readyPromise = null;
    this.readyResolver = null;
  }
}
