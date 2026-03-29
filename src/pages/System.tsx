import { useEffect, useState } from "react"
import { RefreshCw, Loader2, GitBranch, GitCommit, ExternalLink } from "lucide-react"

import { api } from "../api"

export default function System() {
  const [info, setInfo] = useState<{ gitBranch: string; gitHash: string; gitMessage: string; gitTime: string; gitRemote: string; updateRunning: boolean } | null>(null)
  const [updating, setUpdating] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [result, setResult] = useState<{ ok: boolean; error?: string } | null>(null)

  useEffect(() => {
    api.system.info().then(setInfo).catch(() => {})
  }, [])

  const doUpdate = async () => {
    if (updating) return
    setUpdating(true)
    setResult(null)
    setLog(["开始更新..."])

    try {
      const res = await api.system.update()
      setLog(res.log || [])
      setResult({ ok: res.ok, error: res.error })
      if (res.ok) {
        setLog((prev) => [...prev, "", "服务即将重启，页面将在 5 秒后自动刷新..."])
        setTimeout(() => window.location.reload(), 5000)
      }
    } catch (e: unknown) {
      setResult({ ok: false, error: e instanceof Error ? e.message : "更新失败" })
    } finally {
      setUpdating(false)
    }
  }

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">系统设置</h1>
        <p className="text-gray-500 text-sm mt-1">版本信息与在线更新</p>
      </div>

      <div className="bg-surface-800 border border-gray-800 rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold">版本信息</h2>
        {info ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <GitBranch className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-300">分支:</span>
              <code className="text-sm text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">{info.gitBranch || "N/A"}</code>
            </div>
            <div className="flex items-start gap-3">
              <GitCommit className="w-4 h-4 text-gray-400 mt-0.5" />
              <span className="text-sm text-gray-300 shrink-0">最新提交:</span>
              <div className="flex items-center gap-2 flex-wrap">
                <code className="text-xs text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded font-mono">{info.gitHash || "N/A"}</code>
                <span className="text-sm text-gray-100">{info.gitMessage || ""}</span>
                {info.gitTime && <span className="text-xs text-gray-500">{info.gitTime}</span>}
              </div>
            </div>
            {info.gitRemote && (
              <div className="flex items-center gap-3">
                <ExternalLink className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-300">远程仓库:</span>
                <span className="text-sm text-blue-400">{info.gitRemote}</span>
              </div>
            )}
          </div>
        ) : (
          <span className="text-sm text-gray-500">加载中...</span>
        )}
      </div>

      <div className="bg-surface-800 border border-gray-800 rounded-xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">在线更新</h2>
            <p className="text-xs text-gray-500 mt-1">执行 git pull → bun install → bun run build → 自动重启</p>
          </div>
          <button onClick={doUpdate} disabled={updating}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors">
            {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {updating ? "更新中..." : "检查更新并部署"}
          </button>
        </div>

        {result && (
          <div className={`rounded-lg p-3 text-sm border ${
            result.ok
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
              : "bg-red-500/10 border-red-500/30 text-red-400"
          }`}>
            {result.ok ? "更新成功！服务即将自动重启..." : `更新失败: ${result.error}`}
          </div>
        )}

        {log.length > 0 && (
          <div className="bg-surface-950 rounded-xl p-4 max-h-[400px] overflow-y-auto font-mono text-xs leading-5 border border-gray-800">
            {log.map((line, i) => (
              <div key={i} className={`whitespace-pre-wrap break-all ${
                line.startsWith("===") ? "text-blue-400 font-semibold mt-2" :
                line.startsWith("[error]") || line.startsWith("[stderr]") ? "text-red-400" :
                "text-gray-400"
              }`}>{line}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
