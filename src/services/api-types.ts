export type BranchCodeRequest = {
  branchCode: string;
};

export type BranchRequest = {
  branch_id: string;
};

export type Organization = {
  id: string;
  name: string;
};

export type Branch = {
  id: string;
  name: string;
  address?: string;
};

export type Counter = {
  id: string;
  name: string;
  number: number;
  status: 'active' | 'inactive' | string;
};

export type ServiceMapping = {
  id: string;
  name: string;
  color: string;
  code: string;
};

export type CurrentToken = {
  ticket_number: string;
  status: 'serving' | string;
  service_name: string;
  service_color: string;
  called_at: string;
};

export type WaitingToken = {
  ticket_number: string;
  service_name: string;
  service_color: string;
};

export type TokenDisplayTicker = {
  enabled: boolean;
  message: string;
  speed: 'slow' | 'normal' | 'fast' | string;
  position: 'top' | 'bottom' | string;
};

export type TokenDisplay = {
  id: string;
  name: string;
  code: string;
  status: 'online' | 'offline' | string;
  ticker: TokenDisplayTicker | null;
};

export type PublicBranchesResponse = {
  success: boolean;
  organization: Organization;
  branches: Branch[];
};

export type PublicCountersResponse = {
  success: boolean;
  branch: Branch;
  counters: Counter[];
};

export type CounterTokenDisplayItem = {
  counter: Counter;
  assignedServices: ServiceMapping[];
  currentToken: CurrentToken | null;
  waitingTokens: WaitingToken[];
};

export type PublicCounterTokenDisplayResponse = {
  success: boolean;
  branch: Branch;
  counters: CounterTokenDisplayItem[];
  last_updated: string;
  displayAllowed?: boolean;
  displayStatus?: 'ONLINE' | 'OFFLINE' | string;
  display?: TokenDisplay | null;
};
