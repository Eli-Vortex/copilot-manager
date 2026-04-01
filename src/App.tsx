import { useState, useEffect } from "react"
import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate } from "react-router-dom"
import { LayoutDashboard, FolderCog, Users, Zap, Settings, LogOut, Sun, Moon, MailOpen, Mail } from "lucide-react"

import Dashboard from "./pages/Dashboard"
import Groups from "./pages/Groups"
import Accounts from "./pages/Accounts"
import System from "./pages/System"
import Login from "./pages/Login"
import EmailAccounts from "./pages/EmailAccounts"
import Emails from "./pages/Emails"
import { getToken, clearToken, api } from "./api"

function getRoleFromToken(): string {
  const token = localStorage.getItem("token")
  if (!token) return "user"
  try {
    const parts = token.split(".")
    if (parts.length < 2) return "user"
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))) as { role?: string }
    return payload.role || "admin"
  } catch {
    return "admin"
  }
}

const allNavItems = [
  { to: "/", icon: LayoutDashboard, label: "仪表盘", badge: false, adminOnly: false },
  { to: "/groups", icon: FolderCog, label: "分组管理", badge: false, adminOnly: true },
  { to: "/accounts", icon: Users, label: "账号管理", badge: false, adminOnly: true },
  { to: "/email-accounts", icon: MailOpen, label: "邮箱管理", badge: false, adminOnly: true },
  { to: "/emails", icon: Mail, label: "收件箱", badge: true, adminOnly: true },
  { to: "/system", icon: Settings, label: "系统设置", badge: false, adminOnly: true },
]

function AuthGuard({ children }: { children: React.ReactNode }) {
  if (!getToken()) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AppLayout() {
  const navigate = useNavigate()
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "dark")
  const [unreadCount, setUnreadCount] = useState(0)
  const [role] = useState(() => getRoleFromToken())

  const navItems = allNavItems.filter((item) => !item.adminOnly || role === "admin")

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme)
    localStorage.setItem("theme", theme)
  }, [theme])

  useEffect(() => {
    if (role !== "admin") return
    const fetchUnread = () => {
      api.emails.unreadCount().then((r) => setUnreadCount(r.count)).catch(() => {})
    }
    fetchUnread()
    const timer = setInterval(fetchUnread, 10000)
    return () => clearInterval(timer)
  }, [role])

  const toggleTheme = () => setTheme((t) => t === "dark" ? "light" : "dark")

  const handleLogout = () => {
    clearToken()
    navigate("/login", { replace: true })
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-60 flex-shrink-0 bg-surface-950 border-r border-gray-800 flex flex-col">
        <div className="h-16 flex items-center gap-2.5 px-5 border-b border-gray-800">
          <Zap className="w-6 h-6 text-emerald-400" />
          <span className="text-lg font-bold tracking-tight">Copilot Manager</span>
        </div>
        <nav className="flex-1 py-4 px-3 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-emerald-500/10 text-emerald-400"
                    : "text-gray-400 hover:text-gray-200 hover:bg-surface-800"
                }`
              }
            >
              <item.icon className="w-[18px] h-[18px]" />
              <span className="flex-1">{item.label}</span>
              {item.badge && unreadCount > 0 && (
                <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none">
                  {unreadCount > 999 ? "999+" : unreadCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="px-3 pb-1 space-y-1">
          <button onClick={toggleTheme}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-amber-400 hover:bg-amber-500/10 transition-colors w-full">
            {theme === "dark" ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
            {theme === "dark" ? "浅色模式" : "深色模式"}
          </button>
          <button onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors w-full">
            <LogOut className="w-[18px] h-[18px]" />
            退出登录
          </button>
        </div>
        <div className="px-5 py-4 border-t border-gray-800 text-xs text-gray-600">
          v1.0.0
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-surface-900">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/groups" element={<Groups />} />
          <Route path="/accounts" element={<Accounts />} />
          <Route path="/email-accounts" element={<EmailAccounts />} />
          <Route path="/emails" element={<Emails />} />
          <Route path="/system" element={<System />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/*" element={<AuthGuard><AppLayout /></AuthGuard>} />
      </Routes>
    </BrowserRouter>
  )
}
