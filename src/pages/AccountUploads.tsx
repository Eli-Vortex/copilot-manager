import { useEffect, useState } from "react"
import { Plus, Send, ShieldCheck, ShieldX, Hourglass, RotateCcw, X } from "lucide-react"

import { api, type AccountSubmissionInfo } from "../api"

export default function AccountUploads() {
  const [submitName, setSubmitName] = useState("")
  const [submitToken, setSubmitToken] = useState("")
  const [submitNote, setSubmitNote] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [validating, setValidating] = useState(false)
  const [validation, setValidation] = useState<{ ok: boolean; login?: string; error?: string } | null>(null)
  const [submissions, setSubmissions] = useState<AccountSubmissionInfo[]>([])
  const [cancellingId, setCancellingId] = useState("")
  const [modalOpen, setModalOpen] = useState(false)

  const load = () => {
    api.submissions.mine().then(setSubmissions).catch(() => undefined)
  }

  useEffect(() => {
    load()
    const timer = setInterval(load, 5000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!validation) return
    const timer = setTimeout(() => setValidation(null), 5000)
    return () => clearTimeout(timer)
  }, [validation])

  const closeModal = () => {
    setModalOpen(false)
    setSubmitName("")
    setSubmitToken("")
    setSubmitNote("")
    setValidation(null)
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

  const handleSubmitAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!submitName.trim() || !submitToken.trim()) return
    setSubmitting(true)
    try {
      const valid = await api.submissions.validate(submitToken.trim())
      setValidation(valid)
      if (!valid.ok) return
      await api.submissions.create({ name: submitName.trim(), github_token: submitToken.trim(), user_note: submitNote.trim() })
      closeModal()
      load()
      setValidation({ ok: true, login: valid.login })
    } catch (err: unknown) {
      setValidation({ ok: false, error: err instanceof Error ? err.message : "提交失败" })
    } finally {
      setSubmitting(false)
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

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">账号上传</h1>
          <p className="text-gray-500 text-sm mt-1">提交 GitHub Copilot 账号并等待管理员审核</p>
        </div>
        <button onClick={() => setModalOpen(true)} className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium transition-colors">
          <Plus className="w-4 h-4" /> 新建提交
        </button>
      </div>

      {validation && !modalOpen && (
        <div className={`px-4 py-3 rounded-lg text-sm ${validation.ok ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400" : "bg-red-500/10 border border-red-500/30 text-red-400"}`}>
          {validation.ok ? `提交成功${validation.login ? `：${validation.login}` : ""}` : validation.error}
        </div>
      )}

      <div className="bg-surface-800 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left px-5 py-3 text-gray-400 font-medium">名称</th>
              <th className="text-left px-5 py-3 text-gray-400 font-medium">检测账号</th>
              <th className="text-left px-5 py-3 text-gray-400 font-medium">备注</th>
              <th className="text-left px-5 py-3 text-gray-400 font-medium">状态</th>
              <th className="text-left px-5 py-3 text-gray-400 font-medium">时间</th>
              <th className="text-right px-5 py-3 text-gray-400 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {submissions.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-500">暂无提交记录</td></tr>
            ) : submissions.map((item) => (
              <tr key={item.id} className="border-b border-gray-800/50">
                <td className="px-5 py-3 text-gray-200">{item.name}</td>
                <td className="px-5 py-3 text-gray-400">{item.detected_login || "-"}</td>
                <td className="px-5 py-3 text-gray-400 max-w-[240px] truncate">{item.user_note || "-"}</td>
                <td className="px-5 py-3"><SubmissionBadge status={item.status} note={item.review_note} /></td>
                <td className="px-5 py-3 text-gray-500">{new Date(item.created_at).toLocaleString("zh-CN")}</td>
                <td className="px-5 py-3 text-right">
                  {item.status === "pending" && (
                    <button onClick={() => handleCancelSubmission(item.id)} disabled={cancellingId === item.id} className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-xs disabled:opacity-50">
                      {cancellingId === item.id ? "撤销中..." : "撤销提交"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={closeModal}>
          <div className="bg-surface-800 border border-gray-700 rounded-xl shadow-2xl p-6 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold">新建提交</h3>
              <button onClick={closeModal} className="p-1 text-gray-500 hover:text-gray-300 transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmitAccount} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">名称</label>
                <input type="text" value={submitName} onChange={(e) => setSubmitName(e.target.value)} placeholder="账号名称" className="w-full px-3 py-2 bg-surface-700 border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-emerald-500/50 transition-colors" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">GitHub Token</label>
                <input type="password" value={submitToken} onChange={(e) => setSubmitToken(e.target.value)} placeholder="ghu_xxxxxxxxxxxxxxxxxxxx" className="w-full px-3 py-2 bg-surface-700 border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-emerald-500/50 transition-colors font-mono" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">备注</label>
                <textarea value={submitNote} onChange={(e) => setSubmitNote(e.target.value)} rows={3} placeholder="可填写用途、来源或需要说明的情况" className="w-full px-3 py-2 bg-surface-700 border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-emerald-500/50 transition-colors" />
              </div>
              {validation && (
                <div className={`px-3 py-2 rounded-lg text-sm ${validation.ok ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400" : "bg-red-500/10 border border-red-500/30 text-red-400"}`}>
                  {validation.ok ? `账号校验成功${validation.login ? `：${validation.login}` : ""}` : validation.error}
                </div>
              )}
              <div className="flex items-center gap-3">
                <button type="button" onClick={handleValidateToken} disabled={validating || !submitToken.trim()} className="px-4 py-2 bg-surface-700 hover:bg-surface-600 disabled:opacity-50 disabled:cursor-not-allowed text-gray-200 text-sm font-medium rounded-lg transition-colors">
                  {validating ? "检测中..." : "检测账号"}
                </button>
                <button type="submit" disabled={submitting || !submitName.trim() || !submitToken.trim()} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors">
                  <Send className="w-4 h-4" />
                  {submitting ? "提交中..." : "提交账号"}
                </button>
              </div>
            </form>
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
