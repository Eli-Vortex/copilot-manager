import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Server, Users, Activity, CircleDot, Monitor, Clock, Cpu, Send, ShieldCheck, ShieldX, Hourglass, RotateCcw } from "lucide-react"

import { api, type DashboardData, type AccountSubmissionInfo } from "../api"

function getRoleFromToken(): string {
  const token = localStorage.getItem("token")
  if (!token) return "user"
  try {
    const parts = token.split(".")
    if (parts.length < 2) return "user"
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))) as { role?: string }
    return payload.role || "user"
  } catch {
    return "user"
  }
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState("")
  const [role] = useState(() => getRoleFromToken())
  const [submitName, setSubmitName] = useState("")
  const [submitToken, setSubmitToken] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [validating, setValidating] = useState(false)
  const [validation, setValidation] = useState<{ ok: boolean; login?: string; error?: string } | null>(null)
  const [submissions, setSubmissions] = useState<AccountSubmissionInfo[]>([])
  const [cancellingId, setCancellingId] = useState("")
  const navigate = useNavigate()

  const load = () => {
    api.dashboard().then(setData).catch((e) => setError(e.message))
    if (role !== "admin") api.submissions.mine().then(setSubmissions).catch(() => undefined)
  }

  useEffect(() => {
    load()
    const timer = setInterval(load, 5000)
    return () => clearInterval(timer)
  }, [])

  const handleSubmitAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!submitName.trim() || !submitToken.trim()) return
    setSubmitting(true)
    try {
      const valid = await api.submissions.validate(submitToken.trim())
      setValidation(valid)
      if (!valid.ok) return
      await api.submissions.create({ name: submitName.trim(), github_token: submitToken.trim() })
      setSubmitName("")
      setSubmitToken("")
      setValidation(null)
      load()
    } catch (err: unknown) {
      setValidation({ ok: false, error: err instanceof Error ? err.message : "提交失败" })
    } finally {
      setSubmitting(false)
    }
  }

  const handleValidateToken = async () => {
    if (!submitToken.trim()) return
    setValidating(true)
    try {
      const result = await api.submissions.validate(submitToken.trim())
      setValidation(result)
    } catch (err: unknown) {
      setValidation({ ok: false, error: err instanceof Error ? err.message : "校验失败" })
    } finally {
      setValidating(false)
    }
  }

  const handleCancelSubmission = async (id: string) => {
    setCancellingId(id)
    try {
      await api.submissions.cancel(id)
      load()
    } finally {
      setCancellingId("")
    }
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">{error}</div>
      </div>
    )
  }

  if (!data) {
    return <div className="p-8 text-gray-500">加载中...</div>
  }

  const cards = [
    { label: "分组总数", value: data.totalGroups, icon: Server, color: "text-blue-400", bg: "bg-blue-500/10", click: () => navigate("/groups") },
    { label: "账号总数", value: data.totalAccounts, icon: Users, color: "text-purple-400", bg: "bg-purple-500/10", click: () => navigate("/accounts") },
    { label: "活跃账号", value: data.activeAccounts, icon: Activity, color: "text-emerald-400", bg: "bg-emerald-500/10", click: () => navigate("/accounts") },
    { label: "运行实例", value: data.runningInstances, icon: CircleDot, color: "text-amber-400", bg: "bg-amber-500/10", click: () => navigate("/groups") },
  ]

  const instanceEntries = Object.entries(data.instanceStatuses)

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">仪表盘</h1>
        <p className="text-gray-500 text-sm mt-1">Copilot API 多分组管理概览</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {cards.map((card) => (
          <button
            key={card.label}
            onClick={card.click}
            className="bg-surface-800 border border-gray-800 rounded-xl p-5 text-left hover:border-gray-700 transition-colors group"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">{card.label}</span>
              <div className={`w-9 h-9 rounded-lg ${card.bg} flex items-center justify-center`}>
                <card.icon className={`w-[18px] h-[18px] ${card.color}`} />
              </div>
            </div>
            <div className="mt-3 text-3xl font-bold">{card.value}</div>
          </button>
        ))}
      </div>

      {instanceEntries.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4">实例状态</h2>
          <div className="bg-surface-800 border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left px-5 py-3 text-gray-400 font-medium">分组名称</th>
                  <th className="text-left px-5 py-3 text-gray-400 font-medium">端口</th>
                  <th className="text-left px-5 py-3 text-gray-400 font-medium">状态</th>
                  <th className="text-left px-5 py-3 text-gray-400 font-medium">启动时间</th>
                </tr>
              </thead>
              <tbody>
                {instanceEntries.map(([id, status]) => (
                  <tr key={id} className="border-b border-gray-800/50 hover:bg-surface-700/30">
                    <td className="px-5 py-3 font-medium">{data.groupNames?.[id] || id.slice(0, 8)}</td>
                    <td className="px-5 py-3">{status.port}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={status.status} />
                    </td>
                    <td className="px-5 py-3 text-gray-400">
                      {status.startedAt ? new Date(status.startedAt).toLocaleString("zh-CN") : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold mb-4">系统信息</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { icon: Monitor, label: "版本", value: `v${data.systemInfo.version}`, color: "text-emerald-400" },
            { icon: Cpu, label: "运行环境", value: data.systemInfo.runtime, color: "text-blue-400" },
            { icon: Server, label: "平台", value: `${data.systemInfo.platform} (${data.systemInfo.hostname})`, color: "text-purple-400" },
            { icon: Clock, label: "运行时长", value: formatUptime(data.systemInfo.uptime), color: "text-amber-400" },
          ].map((item) => (
            <div key={item.label} className="bg-surface-800 border border-gray-800 rounded-xl px-4 py-3 flex items-center gap-3">
              <item.icon className={`w-4 h-4 ${item.color}`} />
              <div>
                <div className="text-xs text-gray-500">{item.label}</div>
                <div className="text-sm text-gray-200">{item.value}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {role !== "admin" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold mb-4">提交 Copilot 账号</h2>
            <div className="bg-surface-800 border border-gray-800 rounded-xl p-6 max-w-lg">
              <form onSubmit={handleSubmitAccount} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">名称</label>
                <input
                  type="text"
                  value={submitName}
                  onChange={(e) => setSubmitName(e.target.value)}
                  placeholder="账号名称"
                  className="w-full px-3 py-2 bg-surface-700 border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-emerald-500/50 transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">GitHub Token</label>
                <input
                  type="password"
                  value={submitToken}
                  onChange={(e) => setSubmitToken(e.target.value)}
                  placeholder="ghu_xxxxxxxxxxxxxxxxxxxx"
                  className="w-full px-3 py-2 bg-surface-700 border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-emerald-500/50 transition-colors font-mono"
                />
              </div>
              {validation && (
                <div className={`px-3 py-2 rounded-lg text-sm ${validation.ok ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400" : "bg-red-500/10 border border-red-500/30 text-red-400"}`}>
                  {validation.ok ? `账号校验成功${validation.login ? `：${validation.login}` : ""}` : validation.error}
                </div>
              )}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleValidateToken}
                    disabled={validating || !submitToken.trim()}
                    className="px-4 py-2 bg-surface-700 hover:bg-surface-600 disabled:opacity-50 disabled:cursor-not-allowed text-gray-200 text-sm font-medium rounded-lg transition-colors"
                  >
                    {validating ? "检测中..." : "检测账号"}
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || !submitName.trim() || !submitToken.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    <Send className="w-4 h-4" />
                    {submitting ? "提交中..." : "提交账号"}
                  </button>
                </div>
              </form>
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-4">我的提交记录</h2>
            <div className="bg-surface-800 border border-gray-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left px-5 py-3 text-gray-400 font-medium">名称</th>
                    <th className="text-left px-5 py-3 text-gray-400 font-medium">检测账号</th>
                    <th className="text-left px-5 py-3 text-gray-400 font-medium">状态</th>
                    <th className="text-left px-5 py-3 text-gray-400 font-medium">时间</th>
                    <th className="text-right px-5 py-3 text-gray-400 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {submissions.length === 0 ? (
                    <tr><td colSpan={5} className="px-5 py-10 text-center text-gray-500">暂无提交记录</td></tr>
                  ) : submissions.map((item) => (
                    <tr key={item.id} className="border-b border-gray-800/50">
                      <td className="px-5 py-3 text-gray-200">{item.name}</td>
                      <td className="px-5 py-3 text-gray-400">{item.detected_login || "-"}</td>
                      <td className="px-5 py-3"><SubmissionBadge status={item.status} note={item.review_note} /></td>
                      <td className="px-5 py-3 text-gray-500">{new Date(item.created_at).toLocaleString("zh-CN")}</td>
                      <td className="px-5 py-3 text-right">
                        {item.status === "pending" && (
                          <button
                            onClick={() => handleCancelSubmission(item.id)}
                            disabled={cancellingId === item.id}
                            className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-xs disabled:opacity-50"
                          >
                            {cancellingId === item.id ? "撤销中..." : "撤销提交"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SubmissionBadge({ status, note }: { status: string; note: string }) {
  const map: Record<string, { cls: string; label: string; icon: typeof Hourglass }> = {
    pending: { cls: "bg-amber-500/10 text-amber-400 border-amber-500/30", label: "审核中", icon: Hourglass },
    approved: { cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30", label: "审核成功", icon: ShieldCheck },
    rejected: { cls: "bg-red-500/10 text-red-400 border-red-500/30", label: "审核失败", icon: ShieldX },
    cancelled: { cls: "bg-gray-500/10 text-gray-400 border-gray-500/30", label: "已撤销", icon: RotateCcw },
  }
  const item = map[status] || map.pending
  const Icon = item.icon
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs ${item.cls}`} title={note || undefined}>
      <Icon className="w-3 h-3" />
      {item.label}
    </span>
  )
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}天 ${h}小时`
  if (h > 0) return `${h}小时 ${m}分钟`
  return `${m}分钟`
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    running: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    stopped: "bg-gray-500/15 text-gray-400 border-gray-500/30",
    starting: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    error: "bg-red-500/15 text-red-400 border-red-500/30",
  }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles[status] || styles.stopped}`}>
      {status}
    </span>
  )
}
