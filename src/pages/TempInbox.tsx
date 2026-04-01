import { useEffect, useState, useCallback, useRef } from "react"
import { useSearchParams } from "react-router-dom"
import { RefreshCw, Loader2, Mail, AlertCircle } from "lucide-react"

import { api, type TempInboxInfo, type TempEmailInfo } from "../api"

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return dateStr
  const now = Date.now()
  const diff = now - date.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "刚刚"
  if (mins < 60) return `${mins}分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}小时前`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}天前`
  return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" })
}

export default function TempInbox() {
  const [searchParams, setSearchParams] = useSearchParams()
  const inboxIdParam = searchParams.get("inboxId") || ""

  const [allInboxes, setAllInboxes] = useState<TempInboxInfo[]>([])
  const [selectedInboxId, setSelectedInboxId] = useState(inboxIdParam)
  const [currentInbox, setCurrentInbox] = useState<TempInboxInfo | null>(null)
  const [emails, setEmails] = useState<TempEmailInfo[]>([])
  const [selectedEmail, setSelectedEmail] = useState<TempEmailInfo | null>(null)

  const [loadingInboxes, setLoadingInboxes] = useState(true)
  const [loadingEmails, setLoadingEmails] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const loadInboxes = useCallback(() => {
    api.tempmail.listInboxes()
      .then((data) => { setAllInboxes(data); setLoadingInboxes(false) })
      .catch(() => setLoadingInboxes(false))
  }, [])

  useEffect(() => { loadInboxes() }, [loadInboxes])

  const loadEmails = useCallback((inboxId: string) => {
    if (!inboxId) {
      setEmails([])
      setCurrentInbox(null)
      return
    }
    setLoadingEmails(true)
    api.tempmail.listEmails(inboxId)
      .then((data) => {
        setCurrentInbox(data.inbox)
        setEmails(data.emails)
        setLoadingEmails(false)
      })
      .catch(() => {
        setEmails([])
        setCurrentInbox(null)
        setLoadingEmails(false)
      })
  }, [])

  useEffect(() => {
    loadEmails(selectedInboxId)
  }, [selectedInboxId, loadEmails])

  const selectedInboxIdRef = useRef(selectedInboxId)
  selectedInboxIdRef.current = selectedInboxId
  useEffect(() => {
    const timer = setInterval(() => {
      const id = selectedInboxIdRef.current
      if (!id) return
      api.tempmail.listEmails(id)
        .then((data) => {
          setCurrentInbox(data.inbox)
          setEmails(data.emails)
        })
        .catch(() => {})
    }, 10000)
    return () => clearInterval(timer)
  }, [])

  const handleSelectInbox = (inboxId: string) => {
    setSelectedInboxId(inboxId)
    setSelectedEmail(null)
    setSearchParams(inboxId ? { inboxId } : {})
  }

  const handleRefresh = async () => {
    if (!selectedInboxId) return
    setRefreshing(true)
    try {
      const result = await api.tempmail.refreshInbox(selectedInboxId)
      if (result.inbox) {
        setCurrentInbox(result.inbox)
      }
      setEmails(result.emails)
      loadInboxes()
    } catch {
    } finally {
      setRefreshing(false)
    }
  }

  const handleSelectEmail = (email: TempEmailInfo) => {
    setSelectedEmail(email)
  }

  const isExpired = currentInbox?.status === "expired"

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800 bg-surface-900 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold">临时收件箱</h1>
          {loadingInboxes ? (
            <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
          ) : (
            <select
              value={selectedInboxId}
              onChange={(e) => handleSelectInbox(e.target.value)}
              className="px-3 py-1.5 bg-surface-800 border border-gray-800 rounded-lg text-sm text-gray-300 focus:outline-none focus:border-emerald-500/50 transition-colors min-w-[240px]"
            >
              <option value="">选择邮箱...</option>
              {allInboxes.map((inbox) => (
                <option key={inbox.id} value={inbox.id}>
                  {inbox.address}{inbox.note ? ` (${inbox.note})` : ""}
                </option>
              ))}
            </select>
          )}
          {isExpired && (
            <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium bg-red-500/15 text-red-400">
              <AlertCircle className="w-3 h-3" />
              已过期
            </span>
          )}
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing || !selectedInboxId}
          className="flex items-center gap-2 px-3 py-1.5 bg-surface-800 hover:bg-surface-700 border border-gray-800 hover:border-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm text-gray-300 rounded-lg transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "刷新中..." : "刷新"}
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-80 flex-shrink-0 border-r border-gray-800 overflow-y-auto bg-surface-900">
          {!selectedInboxId ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-500 gap-3">
              <Mail className="w-10 h-10 text-gray-700" />
              <p className="text-sm">请选择一个临时邮箱</p>
            </div>
          ) : isExpired ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-500 gap-3">
              <AlertCircle className="w-10 h-10 text-red-500/50" />
              <p className="text-sm text-red-400">该邮箱已过期，无法接收新邮件</p>
            </div>
          ) : loadingEmails ? (
            <div className="flex items-center justify-center py-12 text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> 加载中...
            </div>
          ) : emails.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-500 gap-3">
              <Mail className="w-10 h-10 text-gray-700" />
              <p className="text-sm">暂无邮件</p>
              <p className="text-xs text-gray-600">新邮件将自动出现</p>
            </div>
          ) : (
            <div>
              {emails.map((email) => (
                <button
                  key={email.id}
                  onClick={() => handleSelectEmail(email)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-800/50 transition-colors hover:bg-surface-800 ${
                    selectedEmail?.id === email.id ? "bg-surface-800 border-l-2 border-l-emerald-500" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm text-gray-300 truncate font-medium">
                      {email.sender || "Unknown"}
                    </span>
                    <span className="text-xs text-gray-500 flex-shrink-0">
                      {formatRelativeTime(email.received_at)}
                    </span>
                  </div>
                  <div className="text-sm text-gray-400 truncate mt-0.5">
                    {email.subject || "(无主题)"}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto bg-surface-900">
          {selectedEmail ? (
            <div className="p-6 space-y-4">
              <h2 className="text-xl font-semibold text-gray-100">{selectedEmail.subject || "(无主题)"}</h2>
              <div className="space-y-1 text-sm text-gray-400">
                <div>
                  <span className="text-gray-500 w-12 inline-block">发件人:</span>
                  <span className="text-gray-300">{selectedEmail.sender}</span>
                </div>
                <div>
                  <span className="text-gray-500 w-12 inline-block">时间:</span>
                  <span className="text-gray-300">{new Date(selectedEmail.received_at).toLocaleString("zh-CN")}</span>
                </div>
              </div>
              <div className="border-t border-gray-800 pt-4">
                {selectedEmail.html_body ? (
                  <iframe
                    sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
                    srcDoc={`<base target="_blank"><style>body{margin:0;font-family:sans-serif}</style>${selectedEmail.html_body}`}
                    className="w-full"
                    style={{ height: "500px", border: "none" }}
                    title="邮件内容"
                  />
                ) : (
                  <pre className="whitespace-pre-wrap text-sm text-gray-300">{selectedEmail.text_body}</pre>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-3">
              <Mail className="w-12 h-12 text-gray-700" />
              <p>{selectedInboxId ? "选择一封邮件查看详情" : "请先选择一个临时邮箱"}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
