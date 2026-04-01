const BASE = "/api"

export function getToken(): string | null {
  return localStorage.getItem("token")
}

export function clearToken(): void {
  localStorage.removeItem("token")
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (token) headers["Authorization"] = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, { headers, ...options })

  if (res.status === 401 && !path.startsWith("/auth/")) {
    clearToken()
    window.location.href = "/login"
    throw new Error("Unauthorized")
  }

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

export interface EmailAccountInfo {
  id: string; name: string; email: string; imap_host: string; imap_port: number
  use_tls: number; active: number; note: string; last_error: string | null; created_at: string
}
export interface EmailInfo {
  id: string; account_id: string; message_id: string; subject: string
  from_name: string; from_address: string; to_address: string; date: string
  body_text: string; body_html: string; is_read: number; folder: string
  fetched_at: string; account_name?: string; account_email?: string
}

export interface TempInboxInfo {
  id: string
  address: string
  token: string
  service: string
  status: string
  expires_at: string
  note: string
  created_at: string
}

export interface TempEmailInfo {
  id: string
  inbox_id: string
  message_key: string
  sender: string
  subject: string
  text_body: string
  html_body: string
  received_at: string
  created_at: string
}

export interface AccountSubmissionInfo {
  id: string
  user_id: string
  user_username: string
  name: string
  github_token: string
  detected_login: string
  status: "pending" | "approved" | "rejected" | "cancelled"
  review_note: string
  user_note?: string
  assigned_group_id?: string | null
  created_at: string
  updated_at: string
}

export const api = {
  dashboard: () => request<DashboardData>("/dashboard"),

  auth: {
    deviceCode: () => request<DeviceCodeResponse>("/auth/device-code", { method: "POST" }),
    poll: (device_code: string) => request<PollResponse>("/auth/poll", { method: "POST", body: JSON.stringify({ device_code }) }),
    register: (username: string, password: string) =>
      request<{ token: string; username: string; role: string }>("/auth/register", { method: "POST", body: JSON.stringify({ username, password }) }),
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
    submit: (data: { name: string; github_token: string }) =>
      request<AccountInfo>("/accounts/submit", { method: "POST", body: JSON.stringify(data) }),
  },

  submissions: {
    validate: (github_token: string) =>
      request<{ ok: boolean; login?: string; error?: string }>("/account-submissions/validate", { method: "POST", body: JSON.stringify({ github_token }) }),
    create: (data: { name: string; github_token: string; user_note?: string }) =>
      request<AccountSubmissionInfo>("/accounts/submit", { method: "POST", body: JSON.stringify(data) }),
    mine: () => request<AccountSubmissionInfo[]>("/account-submissions/me"),
    cancel: (id: string) => request<AccountSubmissionInfo>(`/account-submissions/${id}/cancel`, { method: "POST" }),
    list: (params?: { q?: string; status?: string }) => {
      const q = new URLSearchParams()
      if (params?.q) q.set("q", params.q)
      if (params?.status) q.set("status", params.status)
      return request<AccountSubmissionInfo[]>(`/account-submissions?${q.toString()}`)
    },
    approve: (id: string, data?: { group_id?: string | null; account_type?: string; tier?: string }) => request<{ submission: AccountSubmissionInfo; account: AccountInfo }>(`/account-submissions/${id}/approve`, { method: "POST", body: JSON.stringify(data || {}) }),
    reject: (id: string, review_note: string) => request<AccountSubmissionInfo>(`/account-submissions/${id}/reject`, { method: "POST", body: JSON.stringify({ review_note }) }),
    delete: (id: string) => request<{ ok: boolean }>(`/account-submissions/${id}`, { method: "DELETE" }),
    bulkDelete: (ids: string[]) => request<{ ok: boolean }>("/account-submissions/bulk-delete", { method: "POST", body: JSON.stringify({ ids }) }),
  },

  system: {
    info: () => request<{ version: string; gitBranch: string; gitHash: string; gitMessage: string; gitTime: string; gitRemote: string; updateRunning: boolean }>("/system/info"),
    checkUpdate: () => request<{ behind: number; commits: string[] }>("/system/check-update", { method: "POST" }),
    update: () => request<{ ok: boolean; error?: string; log: string[] }>("/system/update", { method: "POST" }),
    updateLog: () => request<{ log: string[]; running: boolean }>("/system/update-log"),
    operationLogs: (limit = 100) => request<Array<{ id: string; actor_username: string; actor_role: string; action: string; target_type: string; target_id: string; details_json: string; created_at: string }>>(`/system/operation-logs?limit=${limit}`),
    opsStats: () => request<{ operationLogCount: number; imapEmailCount: number; tempEmailCount: number; dbSizeBytes: number }>("/system/ops-stats"),
    changePassword: (oldPassword: string, newPassword: string) =>
      request<{ ok: boolean }>("/auth/change-password", { method: "POST", body: JSON.stringify({ oldPassword, newPassword }) }),
  },

  emailAccounts: {
    list: () => request<EmailAccountInfo[]>("/email-accounts"),
    create: (data: { name: string; email: string; password: string; imap_host: string; imap_port: number; use_tls: boolean; note?: string }) =>
      request<EmailAccountInfo>("/email-accounts", { method: "POST", body: JSON.stringify(data) }),
    test: (data: { email: string; password: string; imap_host: string; imap_port: number; use_tls: boolean }) =>
      request<{ ok: boolean; error?: string }>("/email-accounts/test", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: { name: string; email: string; password?: string; imap_host: string; imap_port: number; use_tls: boolean; note?: string }) =>
      request<EmailAccountInfo>(`/email-accounts/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) => request(`/email-accounts/${id}`, { method: "DELETE" }),
  },
  emails: {
    list: (params?: { account_id?: string; limit?: number; offset?: number; unread_only?: boolean; has_body?: boolean; source?: string; filter?: "all" | "unread" | "has_body" }) => {
      const q = new URLSearchParams()
      if (params?.account_id) q.set("account_id", params.account_id)
      if (params?.limit) q.set("limit", String(params.limit))
      if (params?.offset) q.set("offset", String(params.offset))
      if (params?.unread_only) q.set("unread_only", "true")
      if (params?.has_body) q.set("has_body", "true")
      if (params?.source) q.set("source", params.source)
      if (params?.filter) q.set("filter", params.filter)
      return request<EmailInfo[]>(`/emails?${q.toString()}`)
    },
    get: (id: string) => request<EmailInfo>(`/emails/${id}`),
    unreadCount: () => request<{ count: number }>("/emails/unread-count"),
    fetchAll: () => request<Array<{ accountId: string; name: string; newCount: number; error?: string }>>("/emails/fetch", { method: "POST" }),
    fetchOne: (accountId: string) => request<{ accountId: string; name: string; newCount: number }>(`/emails/fetch/${accountId}`, { method: "POST" }),
    clear: () => request<{ ok: boolean }>("/emails/clear", { method: "POST" }),
    markAllRead: () => request<{ ok: boolean }>("/emails/mark-all-read", { method: "POST" }),
  },

  tempmail: {
    listInboxes: () => request<TempInboxInfo[]>("/tempmail/inboxes"),
    createInbox: (note?: string) => request<TempInboxInfo>("/tempmail/inboxes", { method: "POST", body: JSON.stringify({ note }) }),
    updateNote: (id: string, note: string) => request<TempInboxInfo>(`/tempmail/inboxes/${id}/note`, { method: "PATCH", body: JSON.stringify({ note }) }),
    deleteInbox: (id: string) => request<{ ok: boolean }>(`/tempmail/inboxes/${id}`, { method: "DELETE" }),
    refreshInbox: (id: string) => request<{ inbox: TempInboxInfo | null; emails: TempEmailInfo[]; expired: boolean }>(`/tempmail/inboxes/${id}/refresh`, { method: "POST" }),
    listEmails: (id: string) => request<{ inbox: TempInboxInfo; emails: TempEmailInfo[] }>(`/tempmail/inboxes/${id}/emails`),
    cleanup: () => request<{ deleted: number }>("/tempmail/inboxes/cleanup", { method: "POST" }),
  },
}
