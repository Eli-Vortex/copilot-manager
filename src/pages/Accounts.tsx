import { useEffect, useState, useCallback, useRef, Fragment } from "react"
import { Plus, Pencil, Trash2, X, Copy, Eye, EyeOff, Github, KeyRound, Loader2, ExternalLink, ChevronDown, ChevronRight } from "lucide-react"

import { api, type AccountInfo, type GroupInfo, type CopilotAccountStatus } from "../api"

interface FormData {
  name: string
  github_token: string
  account_type: string
  tier: string
  active: boolean
  group_id: string
}

const emptyForm: FormData = { name: "", github_token: "", account_type: "individual", tier: "pro", active: true, group_id: "" }

type AuthMode = "choose" | "device-flow" | "manual-token"
type DeviceFlowState = "idle" | "waiting" | "success" | "error" | "expired"

export default function Accounts() {
  const [accounts, setAccounts] = useState<AccountInfo[]>([])
  const [groups, setGroups] = useState<GroupInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [modal, setModal] = useState<"create" | "edit" | null>(null)
  const [editId, setEditId] = useState("")
  const [form, setForm] = useState<FormData>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState({ group: "", search: "" })
  const [revealedTokens, setRevealedTokens] = useState<Set<string>>(new Set())
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set())
  const [copilotStatus, setCopilotStatus] = useState<Record<string, CopilotAccountStatus & { _groupName: string; _groupPort: number }>>({})

  const [authMode, setAuthMode] = useState<AuthMode>("choose")
  const [deviceFlowState, setDeviceFlowState] = useState<DeviceFlowState>("idle")
  const [userCode, setUserCode] = useState("")
  const [verificationUri, setVerificationUri] = useState("")
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(() => {
    Promise.all([api.accounts.list(), api.groups.list()])
      .then(([a, g]) => { setAccounts(a); setGroups(g); setLoading(false) })
      .catch((e) => { setError(e.message); setLoading(false) })
    api.copilotStatusAll().then(setCopilotStatus).catch(() => {})
  }, [])

  useEffect(() => { load() }, [load])

  const groupNameMap = new Map(groups.map((g) => [g.id, g.name]))

  const filtered = accounts.filter((a) => {
    if (filter.group && a.group_id !== filter.group) return false
    if (filter.search && !a.name.toLowerCase().includes(filter.search.toLowerCase())) return false
    return true
  })

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  const closeModal = () => {
    stopPolling()
    setModal(null)
    setAuthMode("choose")
    setDeviceFlowState("idle")
    setUserCode("")
    setVerificationUri("")
  }

  const openCreate = () => { setForm(emptyForm); setModal("create"); setAuthMode("choose") }

  const openEdit = (a: AccountInfo) => {
    setEditId(a.id)
    setForm({ name: a.name, github_token: a.github_token, account_type: a.account_type, tier: a.tier, active: Boolean(a.active), group_id: a.group_id || "" })
    setModal("edit")
    setAuthMode("manual-token")
  }

  const startDeviceFlow = async () => {
    setAuthMode("device-flow")
    setDeviceFlowState("waiting")
    try {
      const data = await api.auth.deviceCode()
      setUserCode(data.user_code)
      setVerificationUri(data.verification_uri)

      const interval = (data.interval + 1) * 1000
      pollRef.current = setInterval(async () => {
        try {
          const result = await api.auth.poll(data.device_code)
          if (result.status === "complete") {
            stopPolling()
            setDeviceFlowState("success")
            setForm((prev) => ({
              ...prev,
              github_token: result.access_token!,
              name: prev.name || result.username || "",
            }))
          } else if (result.status === "expired") {
            stopPolling()
            setDeviceFlowState("expired")
          }
        } catch {
          stopPolling()
          setDeviceFlowState("error")
        }
      }, interval)
    } catch {
      setDeviceFlowState("error")
    }
  }

  const submit = async () => {
    setSaving(true)
    try {
      const payload = { ...form, group_id: form.group_id || null }
      if (modal === "create") {
        await api.accounts.create(payload)
      } else {
        await api.accounts.update(editId, payload)
      }
      closeModal()
      load()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "操作失败")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`确认删除账号「${name}」？`)) return
    try {
      await api.accounts.delete(id)
      load()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "删除失败")
    }
  }

  const copyToken = (token: string) => { navigator.clipboard.writeText(token) }

  const toggleReveal = (id: string) => {
    setRevealedTokens((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const maskToken = (token: string) => token.slice(0, 8) + "..." + token.slice(-4)

  const toggleExpand = (id: string) => {
    setExpandedAccounts((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  if (loading) return <div className="p-8 text-gray-500">加载中...</div>
  if (error) return <div className="p-8"><div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">{error}</div></div>

  const renderCreateModal = () => {
    if (authMode === "choose") {
      return (
        <div className="space-y-3">
          <p className="text-sm text-gray-400 mb-4">选择添加方式</p>
          <button onClick={startDeviceFlow}
            className="w-full flex items-center gap-4 p-4 bg-surface-700 hover:bg-surface-600 border border-gray-700 hover:border-gray-600 rounded-xl transition-colors text-left">
            <div className="w-11 h-11 rounded-lg bg-white/10 flex items-center justify-center">
              <Github className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="font-medium">GitHub 登录</div>
              <div className="text-xs text-gray-400 mt-0.5">通过 GitHub Device Flow 授权，自动获取 Token</div>
            </div>
          </button>
          <button onClick={() => setAuthMode("manual-token")}
            className="w-full flex items-center gap-4 p-4 bg-surface-700 hover:bg-surface-600 border border-gray-700 hover:border-gray-600 rounded-xl transition-colors text-left">
            <div className="w-11 h-11 rounded-lg bg-emerald-500/15 flex items-center justify-center">
              <KeyRound className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="font-medium">手动输入 Token</div>
              <div className="text-xs text-gray-400 mt-0.5">直接粘贴已有的 GitHub Token</div>
            </div>
          </button>
        </div>
      )
    }

    if (authMode === "device-flow") {
      if (deviceFlowState === "waiting") {
        return (
          <div className="text-center py-4 space-y-5">
            <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" /> 等待 GitHub 授权...
            </div>
            <div>
              <p className="text-sm text-gray-400 mb-2">请在浏览器中打开以下链接，输入验证码：</p>
              <a href={verificationUri} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-blue-400 hover:text-blue-300 text-sm transition-colors">
                {verificationUri} <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-2">验证码</p>
              <div className="inline-flex items-center gap-2">
                <code className="text-3xl font-bold tracking-[0.3em] text-white bg-surface-700 px-6 py-3 rounded-xl border border-gray-600">
                  {userCode}
                </code>
                <button onClick={() => navigator.clipboard.writeText(userCode)}
                  className="p-2 text-gray-400 hover:text-gray-200 transition-colors" title="复制">
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )
      }
      if (deviceFlowState === "success") {
        return renderAccountForm()
      }
      if (deviceFlowState === "expired") {
        return (
          <div className="text-center py-6 space-y-4">
            <p className="text-amber-400">验证码已过期</p>
            <button onClick={startDeviceFlow} className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium transition-colors">重新获取</button>
          </div>
        )
      }
      if (deviceFlowState === "error") {
        return (
          <div className="text-center py-6 space-y-4">
            <p className="text-red-400">授权失败，请重试</p>
            <button onClick={startDeviceFlow} className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium transition-colors">重试</button>
          </div>
        )
      }
    }

    return renderAccountForm()
  }

  const renderAccountForm = () => (
    <>
      <div className="space-y-4">
        {authMode === "device-flow" && deviceFlowState === "success" && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 text-emerald-400 text-sm">
            ✓ GitHub 授权成功！Token 已自动填入，请补充其他信息后保存。
          </div>
        )}
        <FormField label="账号名称" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="例如: my-account" />
        {authMode === "manual-token" && (
          <FormField label="GitHub Token" value={form.github_token} onChange={(v) => setForm({ ...form, github_token: v })} placeholder="gho_xxxxxxxxxxxx" />
        )}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">账号类型</label>
            <select value={form.account_type} onChange={(e) => setForm({ ...form, account_type: e.target.value })}
              className="w-full px-3 py-2 bg-surface-700 border border-gray-700 rounded-lg text-sm text-gray-100 focus:outline-none focus:border-emerald-500/50 transition-colors">
              <option value="individual">Individual</option>
              <option value="business">Business</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">订阅等级</label>
            <select value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value })}
              className="w-full px-3 py-2 bg-surface-700 border border-gray-700 rounded-lg text-sm text-gray-100 focus:outline-none focus:border-emerald-500/50 transition-colors">
              <option value="free">Free</option>
              <option value="student">Student</option>
              <option value="pro">Pro</option>
              <option value="pro_plus">Pro+</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">所属分组</label>
          <select value={form.group_id} onChange={(e) => setForm({ ...form, group_id: e.target.value })}
            className="w-full px-3 py-2 bg-surface-700 border border-gray-700 rounded-lg text-sm text-gray-100 focus:outline-none focus:border-emerald-500/50 transition-colors">
            <option value="">未分配</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name} (:{g.port})</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
          <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })}
            className="rounded border-gray-600 bg-surface-700 text-emerald-500 focus:ring-emerald-500/30" />
          启用该账号
        </label>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <button onClick={closeModal} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors">取消</button>
        <button onClick={submit} disabled={saving || !form.name.trim() || !form.github_token.trim()}
          className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors">
          {saving ? "保存中..." : "保存"}
        </button>
      </div>
    </>
  )

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">账号管理</h1>
          <p className="text-gray-500 text-sm mt-1">管理 GitHub Copilot 账号和分组分配</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium transition-colors">
          <Plus className="w-4 h-4" /> 添加账号
        </button>
      </div>

      <div className="flex items-center gap-3">
        <input
          value={filter.search}
          onChange={(e) => setFilter({ ...filter, search: e.target.value })}
          placeholder="搜索名称..."
          className="w-64 px-3 py-2 bg-surface-800 border border-gray-800 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-emerald-500/50 transition-colors"
        />
        <select
          value={filter.group}
          onChange={(e) => setFilter({ ...filter, group: e.target.value })}
          className="px-3 py-2 bg-surface-800 border border-gray-800 rounded-lg text-sm text-gray-300 focus:outline-none focus:border-emerald-500/50 transition-colors"
        >
          <option value="">全部分组</option>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </div>

      <div className="bg-surface-800 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left px-5 py-3.5 text-gray-400 font-medium">名称</th>
              <th className="text-left px-5 py-3.5 text-gray-400 font-medium">Token</th>
              <th className="text-left px-5 py-3.5 text-gray-400 font-medium">分组</th>
              <th className="text-left px-5 py-3.5 text-gray-400 font-medium">类型</th>
              <th className="text-left px-5 py-3.5 text-gray-400 font-medium">等级</th>
              <th className="text-left px-5 py-3.5 text-gray-400 font-medium">状态</th>
              <th className="text-right px-5 py-3.5 text-gray-400 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-5 py-12 text-center text-gray-500">暂无账号</td></tr>
            ) : (
              filtered.map((a) => {
                const cs = copilotStatus[a.name]
                const isExpanded = expandedAccounts.has(a.id)
                return (
                  <Fragment key={a.id}>
                    <tr className={`border-b ${isExpanded ? "border-transparent" : "border-gray-800/50"} hover:bg-surface-700/30 transition-colors cursor-pointer`} onClick={() => cs && toggleExpand(a.id)}>
                      <td className="px-5 py-3.5 font-medium">
                        <div className="flex items-center gap-2">
                          {cs ? (
                            isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-500" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
                          ) : <span className="w-3.5" />}
                          {a.name}
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <code className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                            {revealedTokens.has(a.id) ? a.github_token : maskToken(a.github_token)}
                          </code>
                          <button onClick={(e) => { e.stopPropagation(); toggleReveal(a.id) }} className="p-1 text-gray-500 hover:text-gray-300 transition-colors">
                            {revealedTokens.has(a.id) ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); copyToken(a.github_token) }} className="p-1 text-gray-500 hover:text-gray-300 transition-colors">
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        {a.group_id ? (
                          <span className="bg-blue-500/15 text-blue-400 border border-blue-500/30 px-2.5 py-0.5 rounded-full text-xs font-medium">
                            {groupNameMap.get(a.group_id) || "未知"}
                          </span>
                        ) : (
                          <span className="text-gray-500 text-xs">未分配</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-gray-300 text-xs">{a.account_type}</td>
                      <td className="px-5 py-3.5">
                        <TierBadge tier={a.tier} />
                      </td>
                      <td className="px-5 py-3.5">
                        {cs ? (
                          <CopilotStatusBadge status={cs.status} />
                        ) : (
                          <span className={`inline-flex items-center gap-1.5 text-xs ${a.active ? "text-emerald-400" : "text-gray-500"}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${a.active ? "bg-emerald-400" : "bg-gray-500"}`} />
                            {a.active ? "启用" : "禁用"}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => openEdit(a)} title="编辑" className="p-1.5 rounded-md text-gray-400 hover:text-gray-200 hover:bg-gray-500/15 transition-colors">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDelete(a.id, a.name)} title="删除" className="p-1.5 rounded-md text-red-400 hover:bg-red-500/15 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {cs && isExpanded && (
                      <tr className="border-b border-gray-800/50">
                        <td colSpan={7} className="px-5 pb-4 pt-0">
                          <div className="bg-surface-700/50 rounded-lg p-4 space-y-3 ml-5">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-gray-400">
                                {cs.plan ? <span className="text-purple-400">{cs.plan.name}</span> : ""}
                                {cs.quotaResetDate && <span className="text-gray-500 ml-3">重置: {cs.quotaResetDate}</span>}
                              </span>
                            </div>
                            {cs.quota && (
                              <div className="space-y-2">
                                <InlineQuotaBar label="Premium" q={cs.quota.premium} />
                                <InlineQuotaBar label="Chat" q={cs.quota.chat} />
                                <InlineQuotaBar label="Completions" q={cs.quota.completions} />
                              </div>
                            )}
                            {cs.availableModels && cs.availableModels.length > 0 && (
                              <div className="text-xs text-gray-500">
                                <span className="text-gray-400">模型 ({cs.availableModelCount}): </span>
                                {cs.availableModels.slice(0, 8).join(", ")}
                                {cs.availableModels.length > 8 && ` ... +${cs.availableModels.length - 8}`}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={closeModal}>
          <div className="bg-surface-800 border border-gray-700 rounded-xl shadow-2xl p-6 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold">{modal === "create" ? "添加账号" : "编辑账号"}</h3>
              <button onClick={closeModal} className="p-1 text-gray-500 hover:text-gray-300 transition-colors"><X className="w-5 h-5" /></button>
            </div>
            {modal === "create" ? renderCreateModal() : renderAccountForm()}
          </div>
        </div>
      )}
    </div>
  )
}

function TierBadge({ tier }: { tier: string }) {
  const styles: Record<string, string> = {
    free: "bg-gray-500/15 text-gray-400 border-gray-500/30",
    student: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    pro: "bg-purple-500/15 text-purple-400 border-purple-500/30",
    pro_plus: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${styles[tier] || styles.free}`}>
      {tier}
    </span>
  )
}

function FormField({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-1.5">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2 bg-surface-700 border border-gray-700 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition-colors" />
    </div>
  )
}

function CopilotStatusBadge({ status }: { status: string }) {
  const m: Record<string, { style: string; label: string }> = {
    ready: { style: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", label: "就绪" },
    quota_exhausted: { style: "bg-red-500/15 text-red-400 border-red-500/30", label: "额度耗尽" },
    error: { style: "bg-red-500/15 text-red-400 border-red-500/30", label: "错误" },
    disabled: { style: "bg-gray-500/15 text-gray-400 border-gray-500/30", label: "已禁用" },
  }
  const v = m[status] || { style: "bg-gray-500/15 text-gray-400 border-gray-500/30", label: status }
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${v.style}`}>{v.label}</span>
}

function InlineQuotaBar({ label, q }: { label: string; q: { used: number; total: number; remaining: number; unlimited: boolean } }) {
  if (q.unlimited) return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-gray-400 w-24">{label}</span>
      <span className="text-gray-500">unlimited</span>
    </div>
  )
  const pct = q.total > 0 ? Math.min(100, (q.used / q.total) * 100) : 0
  const color = pct > 90 ? "bg-red-500" : pct > 70 ? "bg-amber-500" : "bg-emerald-500"
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-400 w-24">{label}</span>
        <span className="text-gray-300">{q.used} / {q.total} <span className="text-gray-500">(剩余 {q.remaining})</span></span>
      </div>
      <div className="h-1 bg-surface-950 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
