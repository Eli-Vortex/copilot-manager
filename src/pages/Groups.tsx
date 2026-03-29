import { useEffect, useState, useCallback } from "react"
import { Plus, Play, Square, RotateCcw, Pencil, Trash2, X, Terminal, Info, Loader2 } from "lucide-react"

import { api, type GroupInfo, type CopilotAccountStatus } from "../api"

interface FormData {
  name: string
  description: string
  port: string
  auto_start: boolean
}

const emptyForm: FormData = { name: "", description: "", port: "", auto_start: false }

export default function Groups() {
  const [groups, setGroups] = useState<GroupInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [modal, setModal] = useState<"create" | "edit" | null>(null)
  const [logsModal, setLogsModal] = useState<string | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [editId, setEditId] = useState("")
  const [form, setForm] = useState<FormData>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [detailModal, setDetailModal] = useState<string | null>(null)
  const [copilotAccounts, setCopilotAccounts] = useState<CopilotAccountStatus[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState("")

  const load = useCallback(() => {
    api.groups.list().then((d) => { setGroups(d); setLoading(false) }).catch((e) => { setError(e.message); setLoading(false) })
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(load, 4000)
    return () => clearInterval(timer)
  }, [load])

  const openCreate = () => {
    setForm(emptyForm)
    setModal("create")
  }

  const openEdit = (g: GroupInfo) => {
    setEditId(g.id)
    setForm({ name: g.name, description: g.description, port: String(g.port), auto_start: Boolean(g.auto_start) })
    setModal("edit")
  }

  const openLogs = async (groupId: string) => {
    setLogsModal(groupId)
    try {
      const data = await api.groups.logs(groupId, 200)
      setLogs(data.logs)
    } catch {
      setLogs(["Failed to fetch logs"])
    }
  }

  const openDetail = async (groupId: string) => {
    setDetailModal(groupId)
    setDetailLoading(true)
    setDetailError("")
    setCopilotAccounts([])
    try {
      const data = await api.groups.copilotStatus(groupId)
      setCopilotAccounts(data.accounts || [])
    } catch (e: unknown) {
      setDetailError(e instanceof Error ? e.message : "获取失败")
    } finally {
      setDetailLoading(false)
    }
  }

  const submit = async () => {
    setSaving(true)
    try {
      const payload = { name: form.name, description: form.description, port: Number(form.port), auto_start: form.auto_start }
      if (modal === "create") {
        await api.groups.create(payload)
      } else {
        await api.groups.update(editId, payload)
      }
      setModal(null)
      load()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "操作失败")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`确认删除分组「${name}」？所有该分组的账号将被取消分配。`)) return
    try {
      await api.groups.delete(id)
      load()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "删除失败")
    }
  }

  const handleAction = async (id: string, action: "start" | "stop" | "restart") => {
    try {
      const fn = action === "start" ? api.groups.start : action === "stop" ? api.groups.stop : api.groups.restart
      const result = await fn(id)
      if (!result.ok) alert(result.error || "操作失败")
      setTimeout(load, 1000)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "操作失败")
    }
  }

  if (loading) return <div className="p-8 text-gray-500">加载中...</div>
  if (error) return <div className="p-8"><div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">{error}</div></div>

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">分组管理</h1>
          <p className="text-gray-500 text-sm mt-1">管理 Copilot API 分组和实例</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium transition-colors">
          <Plus className="w-4 h-4" /> 创建分组
        </button>
      </div>

      <div className="bg-surface-800 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left px-5 py-3.5 text-gray-400 font-medium">名称</th>
              <th className="text-left px-5 py-3.5 text-gray-400 font-medium">端口</th>
              <th className="text-left px-5 py-3.5 text-gray-400 font-medium">账号数</th>
              <th className="text-left px-5 py-3.5 text-gray-400 font-medium">状态</th>
              <th className="text-left px-5 py-3.5 text-gray-400 font-medium">描述</th>
              <th className="text-right px-5 py-3.5 text-gray-400 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-500">暂无分组，点击右上角创建</td></tr>
            ) : (
              groups.map((g) => (
                <tr key={g.id} className="border-b border-gray-800/50 hover:bg-surface-700/30 transition-colors">
                  <td className="px-5 py-3.5 font-medium">{g.name}</td>
                  <td className="px-5 py-3.5">
                    <span className="font-mono text-emerald-400">{g.port}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="bg-blue-500/15 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full text-xs font-medium">
                      {g.account_count}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <StatusBadge status={g.instance.status} />
                  </td>
                  <td className="px-5 py-3.5 text-gray-400 max-w-[200px] truncate">{g.description || "-"}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-1">
                      {g.instance.status !== "running" && g.instance.status !== "starting" && (
                        <ActionBtn icon={Play} title="启动" onClick={() => handleAction(g.id, "start")} className="text-emerald-400 hover:bg-emerald-500/15" />
                      )}
                      {(g.instance.status === "running" || g.instance.status === "starting") && (
                        <>
                          <ActionBtn icon={Square} title="停止" onClick={() => handleAction(g.id, "stop")} className="text-red-400 hover:bg-red-500/15" />
                          <ActionBtn icon={RotateCcw} title="重启" onClick={() => handleAction(g.id, "restart")} className="text-amber-400 hover:bg-amber-500/15" />
                        </>
                      )}
                      <ActionBtn icon={Terminal} title="日志" onClick={() => openLogs(g.id)} className="text-gray-400 hover:bg-gray-500/15" />
                      {g.instance.status === "running" && (
                        <ActionBtn icon={Info} title="详情" onClick={() => openDetail(g.id)} className="text-blue-400 hover:bg-blue-500/15" />
                      )}
                      <ActionBtn icon={Pencil} title="编辑" onClick={() => openEdit(g)} className="text-gray-400 hover:bg-gray-500/15" />
                      <ActionBtn icon={Trash2} title="删除" onClick={() => handleDelete(g.id, g.name)} className="text-red-400 hover:bg-red-500/15" />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={modal === "create" ? "创建分组" : "编辑分组"} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <Field label="分组名称" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="例如: team-a" />
            <Field label="端口号" value={form.port} onChange={(v) => setForm({ ...form, port: v })} placeholder="1024-65535" type="number" />
            <Field label="描述" value={form.description} onChange={(v) => setForm({ ...form, description: v })} placeholder="可选" />
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input type="checkbox" checked={form.auto_start} onChange={(e) => setForm({ ...form, auto_start: e.target.checked })}
                className="rounded border-gray-600 bg-surface-700 text-emerald-500 focus:ring-emerald-500/30" />
              随服务启动自动运行
            </label>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button onClick={() => setModal(null)} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors">取消</button>
            <button onClick={submit} disabled={saving || !form.name.trim() || !form.port}
              className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors">
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
        </Modal>
      )}

      {logsModal && (
        <Modal title="实例日志" onClose={() => setLogsModal(null)} wide>
          <div className="bg-surface-950 rounded-lg p-4 h-[400px] overflow-y-auto font-mono text-xs leading-5">
            {logs.length === 0 ? (
              <span className="text-gray-600">暂无日志</span>
            ) : (
              logs.map((line, i) => <div key={i} className="text-gray-300 whitespace-pre-wrap break-all">{line}</div>)
            )}
          </div>
        </Modal>
      )}

      {detailModal && (
        <Modal title="Copilot 实例详情" onClose={() => setDetailModal(null)} wide>
          {detailLoading ? (
            <div className="flex items-center justify-center py-8 gap-2 text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" /> 加载中...
            </div>
          ) : detailError ? (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-sm">{detailError}</div>
          ) : copilotAccounts.length === 0 ? (
            <div className="text-center py-8 text-gray-500">无数据</div>
          ) : (
            <div className="space-y-5 max-h-[500px] overflow-y-auto">
              {copilotAccounts.map((acc) => (
                <div key={acc.name} className="bg-surface-700 rounded-xl p-5 border border-gray-700 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-base">{acc.name}</span>
                      <CopilotStatusBadge status={acc.status} />
                      {acc.plan && (
                        <span className="text-xs text-purple-400 bg-purple-500/15 border border-purple-500/30 px-2 py-0.5 rounded-full">
                          {acc.plan.name}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500">{acc.tier} / {acc.accountType}</span>
                  </div>

                  {acc.lastError && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-red-400 text-xs">{acc.lastError}</div>
                  )}

                  {acc.quota && (
                    <div className="space-y-2.5">
                      <QuotaBar label="Premium" quota={acc.quota.premium} color="emerald" />
                      <QuotaBar label="Chat" quota={acc.quota.chat} color="blue" />
                      <QuotaBar label="Completions" quota={acc.quota.completions} color="purple" />
                    </div>
                  )}

                  {acc.quotaResetDate && (
                    <div className="text-xs text-gray-500">重置时间: {acc.quotaResetDate}</div>
                  )}

                  <div className="text-xs text-gray-400">
                    <span className="font-medium text-gray-300">可用模型 ({acc.availableModelCount}):</span>{" "}
                    {acc.availableModels.length > 0 ? (
                      <span className="text-gray-500">
                        {acc.availableModels.slice(0, 8).join(", ")}
                        {acc.availableModels.length > 8 && ` ... +${acc.availableModels.length - 8}`}
                      </span>
                    ) : "无"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  )
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

function ActionBtn({ icon: Icon, title, onClick, className }: { icon: typeof Play; title: string; onClick: () => void; className: string }) {
  return (
    <button onClick={onClick} title={title} className={`p-1.5 rounded-md transition-colors ${className}`}>
      <Icon className="w-4 h-4" />
    </button>
  )
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className={`bg-surface-800 border border-gray-700 rounded-xl shadow-2xl p-6 ${wide ? "w-full max-w-3xl" : "w-full max-w-md"}`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-300 transition-colors"><X className="w-5 h-5" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-1.5">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2 bg-surface-700 border border-gray-700 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition-colors" />
    </div>
  )
}

function CopilotStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    ready: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    quota_exhausted: "bg-red-500/15 text-red-400 border-red-500/30",
    error: "bg-red-500/15 text-red-400 border-red-500/30",
    disabled: "bg-gray-500/15 text-gray-400 border-gray-500/30",
  }
  const labels: Record<string, string> = {
    ready: "就绪",
    quota_exhausted: "额度耗尽",
    error: "错误",
    disabled: "已禁用",
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${styles[status] || styles.error}`}>
      {labels[status] || status}
    </span>
  )
}

function QuotaBar({ label, quota, color }: { label: string; quota: { used: number; total: number; remaining: number; unlimited: boolean }; color: string }) {
  if (quota.unlimited) {
    return (
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-400 w-24">{label}</span>
        <span className="text-gray-300">unlimited</span>
      </div>
    )
  }
  const pct = quota.total > 0 ? Math.min(100, (quota.used / quota.total) * 100) : 0
  const barColor = pct > 90 ? "bg-red-500" : pct > 70 ? "bg-amber-500" : `bg-${color}-500`
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-400 w-24">{label}</span>
        <span className="text-gray-300">{quota.used} / {quota.total} <span className="text-gray-500">(剩余 {quota.remaining})</span></span>
      </div>
      <div className="h-1.5 bg-surface-950 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
