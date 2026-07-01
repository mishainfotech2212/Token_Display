export const API_BASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_FUNCTIONS_URL ??
  'https://api.caribbargains.com/queueflow-api/functions/v1';

export const API_ENDPOINTS = {
  publicBranches: '/public-branches',
  publicCounters: '/public-counters',
  publicCounterTokenDisplay: '/public-counter-token-display',
} as const;
