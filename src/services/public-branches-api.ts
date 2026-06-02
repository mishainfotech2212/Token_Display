import { API_ENDPOINTS } from './api-config';
import { apiClient } from './api-client';
import { BranchCodeRequest, PublicBranchesResponse } from './api-types';

export class PublicBranchesApi {
  getBranches(request: BranchCodeRequest, signal?: AbortSignal) {
    return apiClient.post<PublicBranchesResponse>(API_ENDPOINTS.publicBranches, request, signal);
  }
}

export const publicBranchesApi = new PublicBranchesApi();
