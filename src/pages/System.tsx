import { useEffect, useState } from "react"
import { RefreshCw, Loader2, GitBranch, ExternalLink, CheckCircle, ArrowUpCircle, Zap, Lock } from "lucide-react"

import { api } from "../api"

type CheckState = "idle" | "checking" | "up-to-date" | "has-update" | "updating" | "done" | "error"

export default function System() {
  const [info, setInfo] = useState<{ version: string; gitBranch: string; gitHash: string; gitMessage: string; gitTime: string; gitRemote: string; updateRunning: boolean } | null>(null)
  const [checkState, setCheckState] = useState<CheckState>("idle")
  const [behind, setBehind] = useState(0)
  const [commits, setCommits] = useState<string[]>([])
  const [log, setLog] = useState<string[]>([])
  const [errorMsg, setErrorMsg] = useState("")
  const [pw, setPw] = useState({ old: "", new: "", confirm: "" })
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pwSaving, setPwSaving] = useState(false)
  const [opsStats, setOpsStats] = useState<{ operationLogCount: number; imapEmailCount: number; tempEmailCount: number; dbSizeBytes: number } | null>(null)
  const [opLogs, setOpLogs] = useState<Array<{ id: string; actor_username: string; actor_role: string; action: string; target_type: string; target_id: string; details_json: string; created_at: string }>>([])

  const loadInfo = () => {
    api.system.info().then(setInfo).catch(() => {})
    api.system.opsStats().then(setOpsStats).catch(() => {})
    api.system.operationLogs(50).then(setOpLogs).catch(() => {})
  }

  useEffect(() => { loadInfo() }, [])

  const doCheck = async () => {
    setCheckState("checking")
    setErrorMsg("")
    try {
      const res = await api.system.checkUpdate()
      setBehind(res.behind)
      setCommits(res.commits)
      setCheckState(res.behind > 0 ? "has-update" : "up-to-date")
    } catch {
      setCheckState("error")
      setErrorMsg("检查失败")
    }
  }

  const doUpdate = async () => {
    setCheckState("updating")
    setLog([])
    setErrorMsg("")
    try {
      const res = await api.system.update()
      setLog(res.log || [])
      if (res.ok) {
        setCheckState("done")
        setTimeout(() => window.location.reload(), 5000)
      } else {
        setCheckState("error")
        setErrorMsg(res.error || "更新失败")
      }
    } catch (e: unknown) {
      setCheckState("error")
      setErrorMsg(e instanceof Error ? e.message : "更新失败")
    }
  }

  const doChangePassword = async () => {
    if (pw.new !== pw.confirm) { setPwMsg({ ok: false, text: "两次密码不一致" }); return }
    setPwSaving(true)
    setPwMsg(null)
    try {
      await api.system.changePassword(pw.old, pw.new)
      setPwMsg({ ok: true, text: "密码修改成功" })
      setPw({ old: "", new: "", confirm: "" })
    } catch (e: unknown) {
      setPwMsg({ ok: false, text: e instanceof Error ? e.message : "修改失败" })
    } finally {
      setPwSaving(false)
    }
  }

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">系统设置</h1>
        <p className="text-gray-500 text-sm mt-1">版本信息与在线更新</p>
      </div>

      <div className="bg-surface-800 border border-gray-800 rounded-xl p-6">
        <div className="flex items-start justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <Zap className="w-7 h-7 text-emerald-400" />
            </div>
            <div>
              <div className="text-lg font-bold">Copilot Manager</div>
              <div className="flex items-center gap-2 mt-1">
                <code className="text-sm text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded font-semibold">v{info?.version || "..."}</code>
                <span className="text-xs text-gray-500">{info?.gitBranch || ""}</span>
              </div>
              {info?.gitMessage && (
                <div className="text-xs text-gray-400 mt-1">{info.gitMessage} · {info.gitTime}</div>
              )}
            </div>
          </div>

          <button onClick={doCheck} disabled={checkState === "checking" || checkState === "updating"}
            className="p-2 text-gray-400 hover:text-gray-200 transition-colors disabled:opacity-40" title="检查更新">
            <RefreshCw className={`w-5 h-5 ${checkState === "checking" ? "animate-spin" : ""}`} />
          </button>
        </div>

        {checkState === "up-to-date" && (
          <div className="mt-5 flex items-center gap-2 text-emerald-400 text-sm">
            <CheckCircle className="w-4 h-4" /> 已是最新版本
          </div>
        )}

        {checkState === "has-update" && (
          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-blue-400 text-sm">
                <ArrowUpCircle className="w-4 h-4" /> 发现 {behind} 个新提交
              </div>
              <button onClick={doUpdate}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors">
                <ArrowUpCircle className="w-4 h-4" /> 立即更新
              </button>
            </div>
            {commits.length > 0 && (
              <div className="bg-surface-950 rounded-lg p-3 text-xs font-mono text-gray-400 space-y-1 max-h-[120px] overflow-y-auto">
                {commits.map((c, i) => <div key={i}>{c}</div>)}
              </div>
            )}
          </div>
        )}

        {checkState === "updating" && (
          <div className="mt-5 space-y-3">
            <div className="flex items-center gap-2 text-amber-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> 更新中，请稍候...
            </div>
            {log.length > 0 && (
              <div className="bg-surface-950 rounded-lg p-3 max-h-[200px] overflow-y-auto font-mono text-xs leading-5">
                {log.map((line, i) => (
                  <div key={i} className={`whitespace-pre-wrap break-all ${
                    line.startsWith("===") ? "text-blue-400 font-semibold mt-1" :
                    line.startsWith("[stderr]") || line.startsWith("[error]") ? "text-red-400" :
                    "text-gray-500"
                  }`}>{line}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {checkState === "done" && (
          <div className="mt-5 flex items-center gap-2 text-emerald-400 text-sm">
            <CheckCircle className="w-4 h-4" /> 更新成功！5 秒后自动刷新...
          </div>
        )}

        {checkState === "error" && (
          <div className="mt-5 text-red-400 text-sm">{errorMsg}</div>
        )}

        {info?.gitRemote && (
          <div className="mt-5 pt-4 border-t border-gray-800">
            <a href={info.gitRemote.replace(/\.git$/, "")} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors">
              <ExternalLink className="w-3.5 h-3.5" />
              <GitBranch className="w-3.5 h-3.5" />
              查看仓库
            </a>
          </div>
        )}
      </div>

      <div className="bg-surface-800 border border-gray-800 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Lock className="w-5 h-5 text-gray-400" />
          <h2 className="text-lg font-semibold">修改密码</h2>
        </div>
        {pwMsg && (
          <div className={`rounded-lg px-3 py-2 text-sm border ${pwMsg.ok ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-red-500/10 border-red-500/30 text-red-400"}`}>
            {pwMsg.text}
          </div>
        )}
        <div className="space-y-3 max-w-sm">
          <div>
            <label className="block text-xs text-gray-400 mb-1">旧密码</label>
            <input type="password" value={pw.old} onChange={(e) => setPw({ ...pw, old: e.target.value })}
              className="w-full px-3 py-2 bg-surface-700 border border-gray-700 rounded-lg text-sm text-gray-100 focus:outline-none focus:border-emerald-500/50 transition-colors" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">新密码</label>
            <input type="password" value={pw.new} onChange={(e) => setPw({ ...pw, new: e.target.value })}
              className="w-full px-3 py-2 bg-surface-700 border border-gray-700 rounded-lg text-sm text-gray-100 focus:outline-none focus:border-emerald-500/50 transition-colors" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">确认新密码</label>
            <input type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
              className="w-full px-3 py-2 bg-surface-700 border border-gray-700 rounded-lg text-sm text-gray-100 focus:outline-none focus:border-emerald-500/50 transition-colors" />
          </div>
        </div>
        <button onClick={doChangePassword} disabled={pwSaving || !pw.old || !pw.new || !pw.confirm}
          className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors">
          {pwSaving ? "保存中..." : "修改密码"}
        </button>
      </div>

      <div className="bg-surface-800 border border-gray-800 rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold">运维信息</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-surface-700 rounded-lg px-4 py-3">
            <div className="text-xs text-gray-500">操作日志数</div>
            <div className="text-lg font-semibold mt-1">{opsStats?.operationLogCount ?? "-"}</div>
          </div>
          <div className="bg-surface-700 rounded-lg px-4 py-3">
            <div className="text-xs text-gray-500">邮件缓存</div>
            <div className="text-sm text-gray-300 mt-1">IMAP {opsStats?.imapEmailCount ?? "-"} / Temp {opsStats?.tempEmailCount ?? "-"}</div>
          </div>
          <div className="bg-surface-700 rounded-lg px-4 py-3">
            <div className="text-xs text-gray-500">数据库大小</div>
            <div className="text-sm text-gray-300 mt-1">{opsStats ? `${(opsStats.dbSizeBytes / 1024 / 1024).toFixed(2)} MB` : "-"}</div>
          </div>
        </div>
        <div className="bg-surface-950 rounded-xl p-4 max-h-[320px] overflow-y-auto border border-gray-800">
          <div className="text-sm font-medium mb-3 text-gray-200">最近操作日志</div>
          {opLogs.length === 0 ? (
            <div className="text-sm text-gray-500">暂无操作日志</div>
          ) : opLogs.map((log) => (
            <div key={log.id} className="border-b border-gray-800/60 py-2 last:border-0">
              <div className="text-xs text-gray-500">{new Date(log.created_at).toLocaleString("zh-CN")}</div>
              <div className="text-sm text-gray-300 mt-0.5">{log.actor_username || "system"} · {log.action}</div>
              <div className="text-xs text-gray-600 mt-0.5">{log.target_type}{log.target_id ? ` / ${log.target_id}` : ""}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
