import { useEffect, useState, useCallback, useRef } from "react"
import { RefreshCw, Loader2, Mail, CheckCheck } from "lucide-react"

import { api, type EmailAccountInfo, type EmailInfo } from "../api"

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

export default function Emails() {
  const [emails, setEmails] = useState<EmailInfo[]>([])
  const [accounts, setAccounts] = useState<EmailAccountInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [markingAllRead, setMarkingAllRead] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedEmail, setSelectedEmail] = useState<EmailInfo | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [filterAccountId, setFilterAccountId] = useState("")
  const [viewFilter, setViewFilter] = useState<"all" | "unread" | "has_body">("all")
  const [sourceFilter, setSourceFilter] = useState("")

  const loadEmails = useCallback((accountId?: string) => {
    return api.emails.list({
      account_id: accountId || undefined,
      limit: 100,
      filter: viewFilter,
      source: sourceFilter || undefined,
    })
  }, [viewFilter, sourceFilter])

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      loadEmails(filterAccountId),
      api.emailAccounts.list(),
    ])
      .then(([emailList, accountList]) => {
        setEmails(emailList)
        setAccounts(accountList)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [loadEmails, filterAccountId])

  useEffect(() => { load() }, [load])

  const hasFetchedOnce = useRef(false)
  useEffect(() => {
    if (hasFetchedOnce.current) return
    hasFetchedOnce.current = true
    api.emails.fetchAll().catch(() => undefined)
  }, [])

  const filterRef = useRef(filterAccountId)
  filterRef.current = filterAccountId
  useEffect(() => {
    const timer = setInterval(() => {
      api.emails.fetchAll()
        .catch(() => undefined)
        .then(() => Promise.all([
          loadEmails(filterRef.current),
          api.emailAccounts.list(),
        ]))
        .then(([emailList, accountList]) => {
          setEmails(emailList)
          setAccounts(accountList)
        })
        .catch(() => {})
    }, 5000)
    return () => clearInterval(timer)
  }, [loadEmails])

  const handleSelectEmail = async (email: EmailInfo) => {
    setSelectedId(email.id)
    setLoadingDetail(true)
    try {
      const detail = await api.emails.get(email.id)
      setSelectedEmail(detail)
      setEmails((prev) => prev.map((e) => e.id === email.id ? { ...e, is_read: 1 } : e))
    } catch {
      setSelectedEmail(email)
    } finally {
      setLoadingDetail(false)
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await api.emails.fetchAll()
      load()
    } catch {
    } finally {
      setRefreshing(false)
    }
  }

  const handleMarkAllRead = async () => {
    setMarkingAllRead(true)
    try {
      await api.emails.markAllRead()
      setEmails((prev) => prev.map((e) => ({ ...e, is_read: 1 })))
    } catch {
    } finally {
      setMarkingAllRead(false)
    }
  }

  const handleFilterChange = (accountId: string) => {
    setFilterAccountId(accountId)
    setSelectedId(null)
    setSelectedEmail(null)
  }

  const handleViewFilterChange = (f: string) => {
    setViewFilter(f as "all" | "unread" | "has_body")
    setSelectedId(null)
    setSelectedEmail(null)
  }

  const handleSourceFilterChange = (s: string) => {
    setSourceFilter(s)
    setSelectedId(null)
    setSelectedEmail(null)
  }

  const displayEmails = filterAccountId
    ? emails.filter((e) => e.account_id === filterAccountId)
    : emails

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800 bg-surface-900 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold">收件箱</h1>
          <select
            value={filterAccountId}
            onChange={(e) => handleFilterChange(e.target.value)}
            className="px-3 py-1.5 bg-surface-800 border border-gray-800 rounded-lg text-sm text-gray-300 focus:outline-none focus:border-emerald-500/50 transition-colors"
          >
            <option value="">全部账号</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name} ({a.email})</option>
            ))}
          </select>
          <select
            value={viewFilter}
            onChange={(e) => handleViewFilterChange(e.target.value)}
            className="px-3 py-1.5 bg-surface-800 border border-gray-800 rounded-lg text-sm text-gray-300 focus:outline-none focus:border-emerald-500/50 transition-colors"
          >
            <option value="all">全部</option>
            <option value="unread">仅未读</option>
            <option value="has_body">仅有正文</option>
          </select>
          <select
            value={sourceFilter}
            onChange={(e) => handleSourceFilterChange(e.target.value)}
            className="px-3 py-1.5 bg-surface-800 border border-gray-800 rounded-lg text-sm text-gray-300 focus:outline-none focus:border-emerald-500/50 transition-colors"
          >
            <option value="">全部来源</option>
            <option value="imap">IMAP</option>
            <option value="mail.7q5g2.us.ci">临时邮箱</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleMarkAllRead}
            disabled={markingAllRead}
            className="flex items-center gap-2 px-3 py-1.5 bg-surface-800 hover:bg-surface-700 border border-gray-800 hover:border-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm text-gray-300 rounded-lg transition-colors"
          >
            <CheckCheck className={`w-4 h-4 ${markingAllRead ? "animate-pulse" : ""}`} />
            {markingAllRead ? "处理中..." : "全部已读"}
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-1.5 bg-surface-800 hover:bg-surface-700 border border-gray-800 hover:border-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm text-gray-300 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "拉取中..." : "刷新邮件"}
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-80 flex-shrink-0 border-r border-gray-800 overflow-y-auto bg-surface-900">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> 加载中...
            </div>
          ) : displayEmails.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-500 gap-3">
              <Mail className="w-10 h-10 text-gray-700" />
              <p className="text-sm">暂无邮件</p>
            </div>
          ) : (
            <div>
              {displayEmails.map((email) => (
                <button
                  key={email.id}
                  onClick={() => handleSelectEmail(email)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-800/50 transition-colors hover:bg-surface-800 ${
                    selectedId === email.id ? "bg-surface-800 border-l-2 border-l-emerald-500" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {email.is_read === 0 && (
                        <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0 mt-0.5" />
                      )}
                      <span className="text-sm text-gray-300 truncate font-medium">
                        {email.from_name || email.from_address}
                      </span>
                    </div>
                    <span className="text-xs text-gray-500 flex-shrink-0">{formatRelativeTime(email.date)}</span>
                  </div>
                  <div className={`text-sm truncate mt-0.5 ${email.is_read === 0 ? "font-semibold text-gray-100" : "text-gray-400"}`}>
                    {email.subject || "(无主题)"}
                  </div>
                  {(email.account_name || email.account_email) && (
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-xs bg-surface-700 text-gray-500 px-1.5 py-0.5 rounded">
                        {email.account_name || email.account_email}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${email.source === "mail.7q5g2.us.ci" ? "border-purple-500/30 text-purple-400 bg-purple-500/10" : "border-blue-500/30 text-blue-400 bg-blue-500/10"}`}>
                        {email.source === "mail.7q5g2.us.ci" ? "Temp" : "IMAP"}
                      </span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto bg-surface-900">
          {loadingDetail ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> 加载中...
            </div>
          ) : selectedEmail ? (
            <div className="p-6 space-y-4">
              <h2 className="text-xl font-semibold text-gray-100">{selectedEmail.subject || "(无主题)"}</h2>
              <div className="space-y-1 text-sm text-gray-400">
                <div>
                  <span className="text-gray-500 w-12 inline-block">发件人:</span>
                  <span className="text-gray-300">
                    {selectedEmail.from_name
                      ? `${selectedEmail.from_name} <${selectedEmail.from_address}>`
                      : selectedEmail.from_address}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 w-12 inline-block">收件人:</span>
                  <span className="text-gray-300">{selectedEmail.to_address}</span>
                </div>
                <div>
                  <span className="text-gray-500 w-12 inline-block">时间:</span>
                  <span className="text-gray-300">{new Date(selectedEmail.date).toLocaleString("zh-CN")}</span>
                </div>
              </div>
              <div className="border-t border-gray-800 pt-4">
                {selectedEmail.body_html ? (
                  <iframe
                    sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
                   srcDoc={`<base target="_blank"><style>body{margin:0;font-family:sans-serif}</style>${selectedEmail.body_html}`}
                    className="w-full"
                    style={{ height: "500px", border: "none" }}
                    title="邮件内容"
                  />
                ) : (
                  <pre className="whitespace-pre-wrap text-sm text-gray-300">{selectedEmail.body_text}</pre>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-3">
              <Mail className="w-12 h-12 text-gray-700" />
              <p>选择一封邮件查看详情</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
