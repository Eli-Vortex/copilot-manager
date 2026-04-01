import { useEffect, useState, useCallback, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { Plus, Trash2, X, Loader2, RefreshCw, Copy, Eye, Pencil, Timer } from "lucide-react"

import { api, type TempInboxInfo } from "../api"

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

export default function TempMail() {
  const navigate = useNavigate()
  const [inboxes, setInboxes] = useState<TempInboxInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const [createModal, setCreateModal] = useState(false)
  const [createNote, setCreateNote] = useState("")
  const [creating, setCreating] = useState(false)

  const [editModal, setEditModal] = useState<TempInboxInfo | null>(null)
  const [editNote, setEditNote] = useState("")
  const [editSaving, setEditSaving] = useState(false)

  const [cleaning, setCleaning] = useState(false)
  const [refreshingId, setRefreshingId] = useState<string | null>(null)

  const [, setTick] = useState(0)

  const load = useCallback(() => {
    api.tempmail.listInboxes()
      .then((data) => { setInboxes(data); setLoading(false) })
      .catch((e: Error) => { setError(e.message); setLoading(false) })
  }, [])

  useEffect(() => { load() }, [load])

  const loadRef = useRef(load)
  loadRef.current = load
  useEffect(() => {
    const timer = setInterval(() => {
      loadRef.current()
      setTick((t) => t + 1)
    }, 15000)
    return () => clearInterval(timer)
  }, [])

  const handleCreate = async () => {
    setCreating(true)
    try {
      await api.tempmail.createInbox(createNote || undefined)
      setCreateModal(false)
      setCreateNote("")
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

  const handleDelete = async (inbox: TempInboxInfo) => {
    if (!confirm(`确认删除临时邮箱「${inbox.address}」？`)) return
    try {
      await api.tempmail.deleteInbox(inbox.id)
      load()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "删除失败")
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

  const handleViewEmails = (inboxId: string) => {
    navigate(`/temp-inbox?inboxId=${inboxId}`)
  }

  if (loading) return <div className="p-8 text-gray-500">加载中...</div>
  if (error) return <div className="p-8"><div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">{error}</div></div>

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">临时邮箱</h1>
          <p className="text-gray-500 text-sm mt-1">创建和管理一次性临时邮箱地址</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleCleanup}
            disabled={cleaning}
            className="flex items-center gap-2 px-4 py-2.5 bg-surface-800 hover:bg-surface-700 border border-gray-800 hover:border-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm text-gray-300 rounded-lg transition-colors"
          >
            {cleaning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            清理过期邮箱
          </button>
          <button
            onClick={() => { setCreateNote(""); setCreateModal(true) }}
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
              <th className="text-left px-5 py-3.5 text-gray-400 font-medium">创建时间</th>
              <th className="text-left px-5 py-3.5 text-gray-400 font-medium">过期时间</th>
              <th className="text-left px-5 py-3.5 text-gray-400 font-medium">剩余时间</th>
              <th className="text-right px-5 py-3.5 text-gray-400 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {inboxes.length === 0 ? (
              <tr><td colSpan={7} className="px-5 py-12 text-center text-gray-500">暂无临时邮箱，点击「创建临时邮箱」开始</td></tr>
            ) : (
              inboxes.map((inbox) => (
                <tr key={inbox.id} className="border-b border-gray-800/50 hover:bg-surface-700/30 transition-colors">
                  <td className="px-5 py-3.5">
                    <span className="font-mono text-xs text-gray-200">{inbox.address}</span>
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
                        {inbox.status === "expired" ? "已过期" : inbox.status}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-gray-400 text-xs">{formatTime(inbox.created_at)}</td>
                  <td className="px-5 py-3.5 text-gray-400 text-xs">{formatTime(inbox.expires_at)}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium ${remainingColor(inbox.expires_at)}`}>
                      <Timer className="w-3 h-3" />
                      {formatRemaining(inbox.expires_at)}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => handleCopy(inbox.address)} title="复制地址"
                        className="p-1.5 rounded-md text-gray-400 hover:text-gray-200 hover:bg-gray-500/15 transition-colors">
                        <Copy className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleRefresh(inbox.id)} title="刷新"
                        disabled={refreshingId === inbox.id}
                        className="p-1.5 rounded-md text-gray-400 hover:text-gray-200 hover:bg-gray-500/15 transition-colors disabled:opacity-50">
                        <RefreshCw className={`w-4 h-4 ${refreshingId === inbox.id ? "animate-spin" : ""}`} />
                      </button>
                      <button onClick={() => handleViewEmails(inbox.id)} title="查看邮件"
                        className="p-1.5 rounded-md text-gray-400 hover:text-emerald-400 hover:bg-emerald-500/15 transition-colors">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button onClick={() => openEditNote(inbox)} title="编辑备注"
                        className="p-1.5 rounded-md text-gray-400 hover:text-gray-200 hover:bg-gray-500/15 transition-colors">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(inbox)} title="删除"
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
                <label className="block text-sm font-medium text-gray-300 mb-1.5">备注（可选）</label>
                <input
                  value={createNote}
                  onChange={(e) => setCreateNote(e.target.value)}
                  placeholder="用途说明，例如：注册GitHub"
                  className="w-full px-3 py-2 bg-surface-700 border border-gray-700 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition-colors"
                  onKeyDown={(e) => { if (e.key === "Enter") handleCreate() }}
                />
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
                {creating ? "创建中..." : "创建"}
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
    </div>
  )
}
