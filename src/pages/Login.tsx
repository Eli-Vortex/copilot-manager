import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Zap, Loader2 } from "lucide-react"

export default function Login() {
  const [username, setUsername] = useState("admin")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json() as { token?: string; error?: string }
      if (!res.ok || !data.token) {
        setError(data.error || "登录失败")
        return
      }
      localStorage.setItem("token", data.token)
      navigate("/", { replace: true })
    } catch {
      setError("网络错误")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <Zap className="w-8 h-8 text-emerald-400" />
          <span className="text-2xl font-bold tracking-tight text-white">Copilot Manager</span>
        </div>

        <form onSubmit={handleSubmit} className="bg-surface-800 border border-gray-800 rounded-xl p-6 space-y-5">
          <div className="text-center">
            <h2 className="text-lg font-semibold text-white">管理员登录</h2>
            <p className="text-xs text-gray-500 mt-1">请输入管理员凭证</p>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-red-400 text-sm">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">用户名</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus
              className="w-full px-3 py-2.5 bg-surface-700 border border-gray-700 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition-colors" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">密码</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="输入密码"
              className="w-full px-3 py-2.5 bg-surface-700 border border-gray-700 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition-colors" />
          </div>

          <button type="submit" disabled={loading || !password}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {loading ? "登录中..." : "登录"}
          </button>
        </form>
      </div>
    </div>
  )
}
