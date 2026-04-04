import { useEffect, useState, useCallback, useRef } from "react"
import { Plus, Trash2, X, Loader2, RefreshCw, Copy, Eye, Pencil, Timer, AlertTriangle, Mail, AlertCircle } from "lucide-react"

import { api, type TempInboxInfo, type TempEmailInfo } from "../api"

function formatTime(dateStr: string): string {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
}

function getRemainingMs(expiresAt: string): number {
  return new Date(expiresAt).getTime() - Date.now()
}

function formatRemaining(expiresAt: string): string {
  const ms = getRemainingMs(expiresAt)
  if (ms <= 0) return "已过期"
  const mins = Math.floor(ms / 60000)
  if (mins < 60) return `${mins}分钟`
  const hours = Math.floor(mins / 60)
  const remainMins = mins % 60
  return remainMins > 0 ? `${hours}小时${remainMins}分` : `${hours}小时`
}

function remainingColor(expiresAt: string): string {
  const ms = getRemainingMs(expiresAt)
  if (ms <= 0) return "bg-red-500/15 text-red-400"
  if (ms <= 30 * 60 * 1000) return "bg-amber-500/15 text-amber-400"
  return "bg-emerald-500/15 text-emerald-400"
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return dateStr
  const diff = Date.now() - date.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "刚刚"
  if (mins < 60) return `${mins}分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}小时前`
  return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" })
}

export default function TempMail() {
  const [inboxes, setInboxes] = useState<TempInboxInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const [createModal, setCreateModal] = useState(false)
  const [createNote, setCreateNote] = useState("")
  const [createCount, setCreateCount] = useState(1)
  const [creating, setCreating] = useState(false)

  const [editModal, setEditModal] = useState<TempInboxInfo | null>(null)
  const [editNote, setEditNote] = useState("")
  const [editSaving, setEditSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<TempInboxInfo | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [emailModal, setEmailModal] = useState<{ inbox: TempInboxInfo; emails: TempEmailInfo[]; selected: TempEmailInfo | null; loading: boolean; refreshing: boolean } | null>(null)

  const [cleaning, setCleaning] = useState(false)
  const [refreshingId, setRefreshingId] = useState<string | null>(null)
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null)

  const [, setTick] = useState(0)

  const load = useCallback(() => {
    api.tempmail.listInboxes()
      .then((data) => { setInboxes(data); setLoading(false) })
      .catch((e: Error) => { setError(e.message); setLoading(false) })
  }, [])

  useEffect(() => { load() }, [load])

  const loadRef = useRef(load)
  loadRef.current = load
  const emailModalRef = useRef(emailModal)
  emailModalRef.current = emailModal
  useEffect(() => {
    const timer = setInterval(() => {
      loadRef.current()
      const activeModal = emailModalRef.current
      if (activeModal) {
        api.tempmail.listEmails(activeModal.inbox.id)
          .then((data) => {
            setEmailModal((prev) => prev && prev.inbox.id === activeModal.inbox.id
              ? { ...prev, emails: data.emails, selected: prev.selected ? data.emails.find((e) => e.id === prev.selected?.id) ?? prev.selected : prev.selected }
              : prev)
          })
          .catch(() => undefined)
      }
      setTick((t) => t + 1)
    }, 5000)
    return () => clearInterval(timer)
  }, [])

  const handleCreate = async () => {
    setCreating(true)
    try {
      await api.tempmail.createInbox(createNote || undefined, createCount)
      setCreateModal(false)
      setCreateNote("")
      setCreateCount(1)
      load()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "创建失败")
    } finally {
      setCreating(false)
    }
  }

  const handleCleanup = async () => {
    setCleaning(true)
    try {
      const result = await api.tempmail.cleanup()
      load()
      if (result.deleted > 0) {
        alert(`已清理 ${result.deleted} 个过期邮箱`)
      } else {
        alert("没有需要清理的过期邮箱")
      }
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "清理失败")
    } finally {
      setCleaning(false)
    }
  }

  const handleCopy = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address)
    } catch {
      const ta = document.createElement("textarea")
      ta.value = address
      document.body.appendChild(ta)
      ta.select()
      document.execCommand("copy")
      document.body.removeChild(ta)
    }
    setCopyFeedback(address)
    setTimeout(() => setCopyFeedback(null), 1500)
  }

  const handleRefresh = async (id: string) => {
    setRefreshingId(id)
    try {
      await api.tempmail.refreshInbox(id)
      load()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "刷新失败")
    } finally {
      setRefreshingId(null)
    }
  }

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.tempmail.deleteInbox(deleteTarget.id)
      setDeleteTarget(null)
      load()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "删除失败")
    } finally {
      setDeleting(false)
    }
  }

  const openEditNote = (inbox: TempInboxInfo) => {
    setEditModal(inbox)
    setEditNote(inbox.note || "")
  }

  const handleEditNote = async () => {
    if (!editModal) return
    setEditSaving(true)
    try {
      await api.tempmail.updateNote(editModal.id, editNote)
      setEditModal(null)
      load()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "保存失败")
    } finally {
      setEditSaving(false)
    }
  }

  const openEmailViewer = async (inbox: TempInboxInfo) => {
    setEmailModal({ inbox, emails: [], selected: null, loading: true, refreshing: false })
    try {
      const data = await api.tempmail.listEmails(inbox.id)
      setEmailModal((prev) => prev ? { ...prev, emails: data.emails, loading: false } : null)
    } catch {
      setEmailModal((prev) => prev ? { ...prev, loading: false } : null)
    }
  }

  const handleEmailRefresh = async () => {
    if (!emailModal) return
    setEmailModal((prev) => prev ? { ...prev, refreshing: true } : null)
    try {
      const result = await api.tempmail.refreshInbox(emailModal.inbox.id)
      setEmailModal((prev) => prev ? { ...prev, emails: result.emails, refreshing: false } : null)
      load()
    } catch {
      setEmailModal((prev) => prev ? { ...prev, refreshing: false } : null)
    }
  }

  if (loading) return <div className="p-8 text-gray-500">加载中...</div>
  if (error) return <div className="p-8"><div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">{error}</div></div>

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">临时邮箱</h1>
          <p className="text-gray-500 text-sm mt-1">由 7q5g2.us.ci 管理源创建的临时邮箱，无需密码，默认在面板内保留 30 天</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleCleanup}
            disabled={cleaning}
            className="flex items-center gap-2 px-4 py-2.5 bg-surface-800 hover:bg-surface-700 border border-gray-800 hover:border-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm text-gray-300 rounded-lg transition-colors"
          >
            {cleaning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            清理过期
          </button>
          <button
            onClick={() => { setCreateNote(""); setCreateCount(1); setCreateModal(true) }}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" /> 创建临时邮箱
          </button>
        </div>
      </div>

      <div className="bg-surface-800 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left px-5 py-3.5 text-gray-400 font-medium">地址</th>
              <th className="text-left px-5 py-3.5 text-gray-400 font-medium">备注</th>
              <th className="text-left px-5 py-3.5 text-gray-400 font-medium">状态</th>
              <th className="text-left px-5 py-3.5 text-gray-400 font-medium">剩余时间</th>
              <th className="text-right px-5 py-3.5 text-gray-400 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {inboxes.length === 0 ? (
              <tr><td colSpan={5} className="px-5 py-12 text-center text-gray-500">暂无临时邮箱，点击「创建临时邮箱」开始</td></tr>
            ) : (
              inboxes.map((inbox) => (
                <tr key={inbox.id} className="border-b border-gray-800/50 hover:bg-surface-700/30 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-gray-200">{inbox.address}</span>
                      {copyFeedback === inbox.address ? (
                        <span className="text-xs text-emerald-400">已复制</span>
                      ) : (
                        <button onClick={() => handleCopy(inbox.address)} title="复制地址"
                          className="p-1 rounded text-gray-500 hover:text-gray-300 transition-colors">
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-gray-400">
                    {inbox.note ? (
                      <span className="max-w-[180px] truncate block">{inbox.note}</span>
                    ) : (
                      <span className="text-gray-600">-</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    {inbox.status === "active" ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        活跃
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs text-red-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                        已过期
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium ${remainingColor(inbox.expires_at)}`}>
                      <Timer className="w-3 h-3" />
                      {formatRemaining(inbox.expires_at)}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => handleRefresh(inbox.id)} title="刷新邮件"
                        disabled={refreshingId === inbox.id}
                        className="p-1.5 rounded-md text-gray-400 hover:text-gray-200 hover:bg-gray-500/15 transition-colors disabled:opacity-50">
                        <RefreshCw className={`w-4 h-4 ${refreshingId === inbox.id ? "animate-spin" : ""}`} />
                      </button>
                      <button onClick={() => openEmailViewer(inbox)} title="查看邮件"
                        className="p-1.5 rounded-md text-gray-400 hover:text-emerald-400 hover:bg-emerald-500/15 transition-colors">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button onClick={() => openEditNote(inbox)} title="编辑备注"
                        className="p-1.5 rounded-md text-gray-400 hover:text-gray-200 hover:bg-gray-500/15 transition-colors">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => setDeleteTarget(inbox)} title="删除"
                        className="p-1.5 rounded-md text-red-400 hover:bg-red-500/15 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {createModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setCreateModal(false)}>
          <div className="bg-surface-800 border border-gray-700 rounded-xl shadow-2xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold">创建临时邮箱</h3>
              <button onClick={() => setCreateModal(false)} className="p-1 text-gray-500 hover:text-gray-300 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">数量</label>
                <div className="flex items-center gap-3">
                  {[1, 3, 5, 10].map((n) => (
                    <button key={n} onClick={() => setCreateCount(n)}
                      className={`px-3.5 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                        createCount === n
                          ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
                          : "bg-surface-700 border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={createCount}
                    onChange={(e) => setCreateCount(Math.min(20, Math.max(1, Number(e.target.value) || 1)))}
                    className="w-16 px-2 py-1.5 bg-surface-700 border border-gray-700 rounded-lg text-sm text-center text-gray-100 focus:outline-none focus:border-emerald-500/50 transition-colors"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">备注（可选）</label>
                <input
                  value={createNote}
                  onChange={(e) => setCreateNote(e.target.value)}
                  placeholder="用途说明，例如：注册GitHub"
                  className="w-full px-3 py-2 bg-surface-700 border border-gray-700 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition-colors"
                  onKeyDown={(e) => { if (e.key === "Enter") handleCreate() }}
                />
              </div>
              <div className="bg-surface-700/50 border border-gray-700/50 rounded-lg px-3 py-2 text-xs text-gray-500">
                邮箱由外部管理源创建并同步到本面板。无需密码，创建后即可使用地址接收邮件，默认保留 30 天。
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setCreateModal(false)} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors">
                取消
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
              >
                {creating ? "创建中..." : createCount > 1 ? `创建 ${createCount} 个` : "创建"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setDeleteTarget(null)}>
          <div className="bg-surface-800 border border-gray-700 rounded-xl shadow-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-base font-semibold">确认删除</h3>
                <p className="text-sm text-gray-400 mt-0.5">此操作不可撤销</p>
              </div>
            </div>
            <div className="bg-surface-700/50 rounded-lg px-3 py-2 mb-5">
              <p className="text-sm text-gray-300 font-mono break-all">{deleteTarget.address}</p>
              {deleteTarget.note && <p className="text-xs text-gray-500 mt-1">{deleteTarget.note}</p>}
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors">
                取消
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
              >
                {deleting ? "删除中..." : "确认删除"}
              </button>
            </div>
          </div>
        </div>
      )}

      {editModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setEditModal(null)}>
          <div className="bg-surface-800 border border-gray-700 rounded-xl shadow-2xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold">编辑备注</h3>
              <button onClick={() => setEditModal(null)} className="p-1 text-gray-500 hover:text-gray-300 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  备注 — <span className="text-gray-500 font-normal font-mono text-xs">{editModal.address}</span>
                </label>
                <textarea
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  rows={3}
                  placeholder="输入备注内容"
                  className="w-full px-3 py-2 bg-surface-700 border border-gray-700 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition-colors"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setEditModal(null)} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors">
                取消
              </button>
              <button
                onClick={handleEditNote}
                disabled={editSaving}
                className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
              >
                {editSaving ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}

      {emailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setEmailModal(null)}>
          <div className="bg-surface-800 border border-gray-700 rounded-xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 flex-shrink-0">
              <div className="flex items-center gap-3">
                <Mail className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="text-base font-semibold">{emailModal.inbox.address}</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full font-medium ${remainingColor(emailModal.inbox.expires_at)}`}>
                      <Timer className="w-3 h-3" />
                      {formatRemaining(emailModal.inbox.expires_at)}
                    </span>
                    {emailModal.inbox.status === "expired" && (
                      <span className="inline-flex items-center gap-1 text-xs text-red-400">
                        <AlertCircle className="w-3 h-3" /> 已过期
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleEmailRefresh} disabled={emailModal.refreshing}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-700 hover:bg-surface-600 border border-gray-700 rounded-lg text-sm text-gray-300 transition-colors disabled:opacity-50">
                  <RefreshCw className={`w-3.5 h-3.5 ${emailModal.refreshing ? "animate-spin" : ""}`} />
                  刷新
                </button>
                <button onClick={() => setEmailModal(null)} className="p-1.5 text-gray-500 hover:text-gray-300 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex flex-1 overflow-hidden min-h-0">
              <div className="w-72 flex-shrink-0 border-r border-gray-700 overflow-y-auto">
                {emailModal.loading ? (
                  <div className="flex items-center justify-center py-12 text-gray-500">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" /> 加载中...
                  </div>
                ) : emailModal.emails.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-gray-500 gap-2">
                    <Mail className="w-8 h-8 text-gray-700" />
                    <p className="text-sm">暂无邮件</p>
                    <p className="text-xs text-gray-600">点击刷新检查新邮件</p>
                  </div>
                ) : (
                  emailModal.emails.map((email) => (
                    <button
                      key={email.id}
                      onClick={() => setEmailModal((prev) => prev ? { ...prev, selected: email } : null)}
                      className={`w-full text-left px-4 py-3 border-b border-gray-700/50 transition-colors hover:bg-surface-700 ${
                        emailModal.selected?.id === email.id ? "bg-surface-700 border-l-2 border-l-emerald-500" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm text-gray-300 truncate font-medium">{email.sender || "Unknown"}</span>
                        <span className="text-xs text-gray-500 flex-shrink-0">{formatRelativeTime(email.received_at)}</span>
                      </div>
                      <div className="text-sm text-gray-400 truncate mt-0.5">{email.subject || "(无主题)"}</div>
                    </button>
                  ))
                )}
              </div>
              <div className="flex-1 overflow-y-auto">
                {emailModal.selected ? (
                  <div className="p-5 space-y-3">
                    <h2 className="text-lg font-semibold text-gray-100">{emailModal.selected.subject || "(无主题)"}</h2>
                    <div className="space-y-1 text-sm text-gray-400">
                      <div><span className="text-gray-500">发件人: </span><span className="text-gray-300">{emailModal.selected.sender}</span></div>
                      <div><span className="text-gray-500">时间: </span><span className="text-gray-300">{new Date(emailModal.selected.received_at).toLocaleString("zh-CN")}</span></div>
                    </div>
                    <div className="border-t border-gray-700 pt-3">
                      {emailModal.selected.html_body ? (
                        <iframe
                          sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
                          srcDoc={`<base target="_blank"><style>body{margin:0;font-family:sans-serif;color:#d1d5db;background:transparent}</style>${emailModal.selected.html_body}`}
                          className="w-full"
                          style={{ height: "400px", border: "none" }}
                          title="邮件内容"
                        />
                      ) : (
                        <pre className="whitespace-pre-wrap text-sm text-gray-300">{emailModal.selected.text_body}</pre>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-2">
                    <Mail className="w-10 h-10 text-gray-700" />
                    <p className="text-sm">选择一封邮件查看详情</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
