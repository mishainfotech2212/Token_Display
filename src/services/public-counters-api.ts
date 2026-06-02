import { API_ENDPOINTS } from './api-config';
import { apiClient } from './api-client';
import { BranchRequest, PublicCountersResponse } from './api-types';

export class PublicCountersApi {
  getCounters(request: BranchRequest, signal?: AbortSignal) {
    return apiClient.post<PublicCountersResponse>(API_ENDPOINTS.publicCounters, request, signal);
  }
}

export const publicCountersApi = new PublicCountersApi();
