import type { ApiResponse } from '../types/index.ts';
import type { SessionState } from './apiTypes.ts';

type RemoteApiClientOptions = {
  apiBaseUrl?: string;
  onSessionChange?: (session: SessionState) => void;
  requestTimeoutMs?: number;
};

const DEFAULT_REMOTE_REQUEST_TIMEOUT_MS = 15_000;

const signedOutSession: SessionState = {
  isAuthenticated: false,
  isAdminAuthenticated: false,
};

function isSessionState(value: unknown): value is SessionState {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && typeof (value as Partial<SessionState>).isAuthenticated === 'boolean'
    && typeof (value as Partial<SessionState>).isAdminAuthenticated === 'boolean';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getNonEmptyStringField(payload: unknown, key: 'error' | 'message'): string | null {
  if (!isRecord(payload)) {
    return null;
  }

  const value = payload[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function getErrorMessageFromPayload(payload: unknown, fallbackMessage: string): string {
  return getNonEmptyStringField(payload, 'error')
    ?? getNonEmptyStringField(payload, 'message')
    ?? fallbackMessage;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}

export class ApiRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
  }
}

export class RemoteApiClient {
  private readonly apiBaseUrl: string;
  private readonly onSessionChange?: (session: SessionState) => void;
  private readonly requestTimeoutMs: number;
  private unauthorizedSessionRefreshPromise: Promise<void> | null = null;

  constructor(options: RemoteApiClientOptions = {}) {
    this.apiBaseUrl = options.apiBaseUrl ?? '/api';
    this.onSessionChange = options.onSessionChange;
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REMOTE_REQUEST_TIMEOUT_MS;
  }

  private emitSessionChange(session: SessionState) {
    this.onSessionChange?.(session);
  }

  private async fetchWithTimeout(input: RequestInfo | URL, options: RequestInit = {}): Promise<Response> {
    const timeoutController = new AbortController();
    const externalSignal = options.signal;
    let timedOut = false;

    const timeoutId = setTimeout(() => {
      timedOut = true;
      timeoutController.abort();
    }, this.requestTimeoutMs);

    const handleExternalAbort = () => {
      timeoutController.abort();
    };

    if (externalSignal?.aborted) {
      handleExternalAbort();
    } else {
      externalSignal?.addEventListener('abort', handleExternalAbort, { once: true });
    }

    try {
      return await fetch(input, {
        ...options,
        signal: timeoutController.signal,
      });
    } catch (error) {
      if (timedOut && isAbortError(error)) {
        throw new ApiRequestError('远程请求超时，请稍后重试', 0);
      }

      throw error;
    } finally {
      clearTimeout(timeoutId);
      externalSignal?.removeEventListener('abort', handleExternalAbort);
    }
  }

  private async performRequest<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    const response = await this.fetchWithTimeout(`${this.apiBaseUrl}${endpoint}`, {
      credentials: 'same-origin',
      ...options,
    });

    if (!response.ok) {
      let message = `HTTP error! status: ${response.status}`;

      try {
        const errorPayload = await response.json() as unknown;
        message = getErrorMessageFromPayload(errorPayload, message);
      } catch {
        // Ignore invalid JSON error bodies.
      }

      if (response.status === 401) {
        await this.refreshSessionAfterUnauthorized(endpoint);
      }

      throw new ApiRequestError(message, response.status);
    }

    try {
      return await response.json() as ApiResponse<T>;
    } catch {
      throw new ApiRequestError('远程响应不是有效的 JSON', response.status);
    }
  }

  private async refreshSessionAfterUnauthorized(endpoint: string) {
    if (endpoint === '/auth/login') {
      return;
    }

    if (this.unauthorizedSessionRefreshPromise) {
      await this.unauthorizedSessionRefreshPromise;
      return;
    }

    this.unauthorizedSessionRefreshPromise = (async () => {
      try {
        const response = await this.fetchWithTimeout(`${this.apiBaseUrl}/auth/session`, {
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error('Failed to refresh session');
        }

        const payload = await response.json() as ApiResponse<SessionState>;
        const session = payload.success === true && isSessionState(payload.data)
          ? payload.data
          : signedOutSession;
        this.emitSessionChange(session);
      } catch {
        this.emitSessionChange(signedOutSession);
      }
    })().finally(() => {
      this.unauthorizedSessionRefreshPromise = null;
    });

    await this.unauthorizedSessionRefreshPromise;
  }

  async request<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    const headers = new Headers(options.headers);
    const body = options.body;

    if (!(body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    return this.performRequest<T>(endpoint, {
      ...options,
      headers,
    });
  }
}
