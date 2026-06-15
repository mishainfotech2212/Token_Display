export type BranchCodeRequest = {
  branchCode: string;
};

export type BranchRequest = {
  branch_id: string;
};

export type Organization = {
  id: string;
  name: string;
  industry?: string | null;
  industry_type?: string | null;
  type?: string | null;
  labels?: DisplayLabels;
};

export type DisplayLabels = {
  organization?: string;
  branch?: string;
  customer?: string;
  staff?: string;
  department?: string;
  service?: string;
  counter?: string;
  appointment?: string;
  queue?: string;
  token?: string;
};

export type Branch = {
  id: string;
  name: string;
  address?: string | null;
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
  type?: string;
  ticker: TokenDisplayTicker | null;
};

export type DisplayMedia = {
  id: string;
  name: string;
  type: 'image' | 'video' | 'text' | string;
  url: string | null;
  text_content?: string | null;
  duration_seconds?: number | null;
};

export type AssignedDoctor = {
  id: string | null;
  name: string;
};

export type HealthTip = {
  id: string;
  title: string;
  message: string;
  assignedDoctor?: AssignedDoctor | null;
  status: 'active' | 'inactive' | string;
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
  assignedDoctor?: AssignedDoctor | null;
  assignedServices: ServiceMapping[];
  currentToken: CurrentToken | null;
  waitingTokens: WaitingToken[];
};

export type PublicCounterTokenDisplayResponse = {
  success: boolean;
  organization?: Organization;
  labels?: DisplayLabels;
  branch: Branch;
  counters: CounterTokenDisplayItem[];
  last_updated: string;
  displayAllowed?: boolean;
  displayStatus?: 'ONLINE' | 'OFFLINE' | string;
  display?: TokenDisplay | null;
  media?: DisplayMedia[];
  healthTips?: HealthTip[];
};
