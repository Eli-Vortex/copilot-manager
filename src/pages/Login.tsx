import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Zap, Loader2 } from "lucide-react"
import { api } from "../api"

type Tab = "user" | "admin"

export default function Login() {
  const [tab, setTab] = useState<Tab>("user")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [registerMode, setRegisterMode] = useState(false)
  const navigate = useNavigate()

  const inputCls = "w-full px-3 py-2.5 bg-surface-700 border border-gray-700 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition-colors"

  const handleAdminLogin = async (e: React.FormEvent) => {
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
      const payload = JSON.parse(atob(data.token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))) as { role?: string }
      if (payload.role !== "admin") {
        setError("该账号不是管理员，请使用用户登录")
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

  const handleUserLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    try {
      if (registerMode) {
        const data = await api.auth.register(username, password)
        localStorage.setItem("token", data.token)
        navigate("/", { replace: true })
      } else {
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
        const payload = JSON.parse(atob(data.token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))) as { role?: string }
        if (payload.role === "admin") {
          setError("管理员账号请使用管理员登录")
          return
        }
        localStorage.setItem("token", data.token)
        navigate("/", { replace: true })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "网络错误")
    } finally {
      setLoading(false)
    }
  }

  const switchTab = (t: Tab) => {
    setTab(t)
    setError("")
    setUsername("")
    setPassword("")
    setRegisterMode(false)
  }

  return (
    <div className="min-h-screen bg-surface-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <Zap className="w-8 h-8 text-emerald-400" />
          <span className="text-2xl font-bold tracking-tight text-white">Copilot Manager</span>
        </div>

        <div className="bg-surface-800 border border-gray-800 rounded-xl overflow-hidden">
          <div className="flex border-b border-gray-800">
            <button
              onClick={() => switchTab("user")}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${tab === "user" ? "text-emerald-400 bg-emerald-500/10" : "text-gray-400 hover:text-gray-200"}`}
            >
              用户登录
            </button>
            <button
              onClick={() => switchTab("admin")}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${tab === "admin" ? "text-emerald-400 bg-emerald-500/10" : "text-gray-400 hover:text-gray-200"}`}
            >
              管理员登录
            </button>
          </div>

          <div className="p-6 space-y-5">
            {tab === "admin" ? (
              <form onSubmit={handleAdminLogin} className="space-y-5">
                <div className="text-center">
                  <p className="text-xs text-gray-500">请输入管理员凭证</p>
                </div>

                {error && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-red-400 text-sm">{error}</div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">用户名</label>
                  <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus placeholder="admin" className={inputCls} />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">密码</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="输入密码" className={inputCls} />
                </div>

                <button type="submit" disabled={loading || !username || !password}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {loading ? "登录中..." : "登录"}
                </button>
              </form>
            ) : (
              <form onSubmit={handleUserLogin} className="space-y-5">
                <div className="text-center">
                  <p className="text-xs text-gray-500">{registerMode ? "创建新账号" : "用户账号登录"}</p>
                </div>

                {error && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-red-400 text-sm">{error}</div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">用户名</label>
                  <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus placeholder="输入用户名" className={inputCls} />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">密码</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={registerMode ? "至少 6 位" : "输入密码"} className={inputCls} />
                </div>

                <button type="submit" disabled={loading || !username || !password}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {loading ? (registerMode ? "注册中..." : "登录中...") : (registerMode ? "注册" : "登录")}
                </button>

                <button type="button" onClick={() => { setRegisterMode(!registerMode); setError("") }}
                  className="w-full py-2 text-xs text-gray-500 hover:text-gray-300 transition-colors">
                  {registerMode ? "已有账号？去登录" : "没有账号？立即注册"}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
