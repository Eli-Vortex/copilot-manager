const BASE = "/api"

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`)
  return data as T
}

export interface GroupInfo {
  id: string
  name: string
  description: string
  port: number
  auto_start: number
  account_count: number
  created_at: string
  updated_at: string
  instance: { status: string; port: number; startedAt: string | null; errorMessage: string | null }
}

export interface AccountInfo {
  id: string
  name: string
  github_token: string
  account_type: string
  tier: string
  active: number
  group_id: string | null
  created_at: string
  updated_at: string
}

export interface DashboardData {
  totalGroups: number
  totalAccounts: number
  activeAccounts: number
  runningInstances: number
  instanceStatuses: Record<string, { status: string; port: number; startedAt: string | null; errorMessage: string | null }>
  groupNames: Record<string, string>
  systemInfo: { version: string; runtime: string; platform: string; uptime: number; hostname: string }
}

export interface DeviceCodeResponse {
  device_code: string
  user_code: string
  verification_uri: string
  interval: number
}

export interface PollResponse {
  status: "pending" | "complete" | "expired"
  access_token?: string
  username?: string
}

export interface CopilotQuota {
  used: number
  total: number
  remaining: number
  unlimited: boolean
}

export interface CopilotAccountStatus {
  name: string
  accountType: string
  tier: string
  active: boolean
  status: string
  lastError: string | null
  activeSessions: number
  modelCatalogKnown: boolean
  availableModelCount: number
  availableModels: string[]
  plan: { name: string; raw: string } | null
  quota: { premium: CopilotQuota; chat: CopilotQuota; completions: CopilotQuota } | null
  quotaResetDate: string | null
}

export interface CopilotStatusResponse {
  mode: string
  accounts: CopilotAccountStatus[]
}

export const api = {
  dashboard: () => request<DashboardData>("/dashboard"),

  auth: {
    deviceCode: () => request<DeviceCodeResponse>("/auth/device-code", { method: "POST" }),
    poll: (device_code: string) => request<PollResponse>("/auth/poll", { method: "POST", body: JSON.stringify({ device_code }) }),
  },

  groups: {
    list: () => request<GroupInfo[]>("/groups"),
    create: (data: { name: string; description?: string; port: number; auto_start?: boolean }) =>
      request("/groups", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: { name: string; description?: string; port: number; auto_start?: boolean }) =>
      request(`/groups/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) => request(`/groups/${id}`, { method: "DELETE" }),
    start: (id: string) => request<{ ok: boolean; error?: string }>(`/groups/${id}/start`, { method: "POST" }),
    stop: (id: string) => request<{ ok: boolean; error?: string }>(`/groups/${id}/stop`, { method: "POST" }),
    restart: (id: string) => request<{ ok: boolean; error?: string }>(`/groups/${id}/restart`, { method: "POST" }),
    status: (id: string) => request(`/groups/${id}/status`),
    logs: (id: string, lines = 100) => request<{ logs: string[] }>(`/groups/${id}/logs?lines=${lines}`),
    accounts: (id: string) => request<AccountInfo[]>(`/groups/${id}/accounts`),
    copilotStatus: (id: string) => request<CopilotStatusResponse>(`/groups/${id}/copilot-status`),
    copilotModels: (id: string) => request<{ data: Array<{ id: string }> }>(`/groups/${id}/copilot-models`),
  },

  copilotStatusAll: () => request<Record<string, CopilotAccountStatus & { _groupName: string; _groupPort: number }>>("/copilot-status-all"),

  accounts: {
    list: () => request<AccountInfo[]>("/accounts"),
    create: (data: { name: string; github_token: string; account_type?: string; tier?: string; active?: boolean; group_id?: string | null }) =>
      request("/accounts", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: { name: string; github_token: string; account_type?: string; tier?: string; active?: boolean; group_id?: string | null }) =>
      request(`/accounts/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) => request(`/accounts/${id}`, { method: "DELETE" }),
  },

  system: {
    info: () => request<{ version: string; gitBranch: string; gitHash: string; gitMessage: string; gitTime: string; gitRemote: string; updateRunning: boolean }>("/system/info"),
    checkUpdate: () => request<{ behind: number; commits: string[] }>("/system/check-update", { method: "POST" }),
    update: () => request<{ ok: boolean; error?: string; log: string[] }>("/system/update", { method: "POST" }),
    updateLog: () => request<{ log: string[]; running: boolean }>("/system/update-log"),
  },
}
