import { API_BASE_URL } from './api-config';

type JsonBody = Record<string, unknown>;

export class ApiClient {
  constructor(private readonly baseUrl = API_BASE_URL) {}

  async post<TResponse>(endpoint: string, body: JsonBody, signal?: AbortSignal): Promise<TResponse> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const message = this.getErrorMessage(data) ?? `Request failed with status ${response.status}`;
      throw new Error(message);
    }

    if (!data?.success) {
      throw new Error(this.getErrorMessage(data) ?? 'Request was not successful');
    }

    return data as TResponse;
  }

  private getErrorMessage(data: unknown) {
    if (typeof data === 'object' && data !== null && 'message' in data) {
      const message = (data as { message?: unknown }).message;
      return typeof message === 'string' ? message : undefined;
    }

    if (typeof data === 'object' && data !== null && 'error' in data) {
      const error = (data as { error?: unknown }).error;
      return typeof error === 'string' ? error : undefined;
    }

    return undefined;
  }
}

export const apiClient = new ApiClient();
