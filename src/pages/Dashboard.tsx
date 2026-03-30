import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Server, Users, Activity, CircleDot, Monitor, Clock, Cpu } from "lucide-react"

import { api, type DashboardData } from "../api"

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState("")
  const navigate = useNavigate()

  const load = () => {
    api.dashboard().then(setData).catch((e) => setError(e.message))
  }

  useEffect(() => {
    load()
    const timer = setInterval(load, 5000)
    return () => clearInterval(timer)
  }, [])

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
    </div>
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
