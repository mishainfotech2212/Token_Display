import { API_ENDPOINTS } from './api-config';
import { apiClient } from './api-client';
import { BranchRequest, PublicCounterTokenDisplayResponse } from './api-types';

export class PublicCounterTokenDisplayApi {
  getTokenDisplay(request: BranchRequest, signal?: AbortSignal) {
    return apiClient.post<PublicCounterTokenDisplayResponse>(
      API_ENDPOINTS.publicCounterTokenDisplay,
      request,
      signal,
    );
  }
}

export const publicCounterTokenDisplayApi = new PublicCounterTokenDisplayApi();
