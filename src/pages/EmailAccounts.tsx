import { useEffect, useState, useCallback } from "react"
import { Plus, Pencil, Trash2, X, Loader2, CheckCircle, AlertCircle } from "lucide-react"

import { api, type EmailAccountInfo } from "../api"

const PRESETS = [
  { label: "QQ邮箱", host: "imap.qq.com", port: 993 },
  { label: "Gmail", host: "imap.gmail.com", port: 993 },
  { label: "Outlook", host: "outlook.office365.com", port: 993 },
  { label: "163邮箱", host: "imap.163.com", port: 993 },
  { label: "126邮箱", host: "imap.126.com", port: 993 },
  { label: "自定义", host: "", port: 993 },
]

interface FormData {
  name: string
  email: string
  password: string
  note: string
  imap_host: string
  imap_port: number
  use_tls: boolean
  preset: string
}

const emptyForm: FormData = {
  name: "",
  email: "",
  password: "",
  note: "",
  imap_host: "imap.qq.com",
  imap_port: 993,
  use_tls: true,
  preset: "QQ邮箱",
}

export default function EmailAccounts() {
  const [accounts, setAccounts] = useState<EmailAccountInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [modal, setModal] = useState<"create" | "edit" | null>(null)
  const [editId, setEditId] = useState("")
  const [form, setForm] = useState<FormData>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null)
  const [notePreview, setNotePreview] = useState<string | null>(null)

  const load = useCallback(() => {
    api.emailAccounts.list()
      .then((data) => { setAccounts(data); setLoading(false) })
      .catch((e) => { setError(e.message); setLoading(false) })
  }, [])

  useEffect(() => { load() }, [load])

  const closeModal = () => {
    setModal(null)
    setForm(emptyForm)
    setTestResult(null)
  }

  const openCreate = () => {
    setForm(emptyForm)
    setTestResult(null)
    setModal("create")
  }

  const openEdit = (a: EmailAccountInfo) => {
    setEditId(a.id)
    const matchedPreset = PRESETS.find((p) => p.host === a.imap_host && p.label !== "自定义")
    setForm({
      name: a.name,
      email: a.email,
      password: "",
      note: a.note || "",
      imap_host: a.imap_host,
      imap_port: a.imap_port,
      use_tls: Boolean(a.use_tls),
      preset: matchedPreset?.label || "自定义",
    })
    setTestResult(null)
    setModal("edit")
  }

  const handlePresetChange = (label: string) => {
    const preset = PRESETS.find((p) => p.label === label)
    if (!preset) return
    setForm((prev) => ({
      ...prev,
      preset: label,
      imap_host: preset.host,
      imap_port: preset.port,
    }))
    setTestResult(null)
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await api.emailAccounts.test({
        email: form.email,
        password: form.password,
        note: form.note,
        imap_host: form.imap_host,
        imap_port: form.imap_port,
        use_tls: form.use_tls,
      })
      setTestResult(result)
    } catch (e: unknown) {
      setTestResult({ ok: false, error: e instanceof Error ? e.message : "测试失败" })
    } finally {
      setTesting(false)
    }
  }

  const submit = async () => {
    setSaving(true)
    try {
      const payload = {
        name: form.name,
        email: form.email,
        password: form.password,
        note: form.note,
        imap_host: form.imap_host,
        imap_port: form.imap_port,
        use_tls: form.use_tls,
      }
      if (modal === "create") {
        await api.emailAccounts.create(payload)
      } else {
        await api.emailAccounts.update(editId, payload)
      }
      closeModal()
      load()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "操作失败")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`确认删除邮箱账号「${name}」？`)) return
    try {
      await api.emailAccounts.delete(id)
      load()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "删除失败")
    }
  }

  if (loading) return <div className="p-8 text-gray-500">加载中...</div>
  if (error) return <div className="p-8"><div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">{error}</div></div>

  const isCustom = form.preset === "自定义"
  const canSubmit = form.name.trim() && form.email.trim() && (modal === "edit" || form.password.trim()) && form.imap_host.trim()

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">邮箱管理</h1>
          <p className="text-gray-500 text-sm mt-1">管理 IMAP 邮箱账号，用于收取邮件</p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium transition-colors">
          <Plus className="w-4 h-4" /> 添加邮箱
        </button>
      </div>

      <div className="bg-surface-800 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left px-5 py-3.5 text-gray-400 font-medium">名称</th>
              <th className="text-left px-5 py-3.5 text-gray-400 font-medium">邮箱</th>
              <th className="text-left px-5 py-3.5 text-gray-400 font-medium">备注</th>
              <th className="text-left px-5 py-3.5 text-gray-400 font-medium">IMAP服务器:端口</th>
              <th className="text-left px-5 py-3.5 text-gray-400 font-medium">状态</th>
              <th className="text-right px-5 py-3.5 text-gray-400 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {accounts.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-500">暂无邮箱账号，点击「添加邮箱」开始配置</td></tr>
            ) : (
              accounts.map((a) => (
                <tr key={a.id} className="border-b border-gray-800/50 hover:bg-surface-700/30 transition-colors">
                  <td className="px-5 py-3.5 font-medium">{a.name}</td>
                  <td className="px-5 py-3.5 text-gray-300">{a.email}</td>
                  <td className="px-5 py-3.5 text-gray-400">
                    {a.note ? (
                      <button onClick={() => setNotePreview(a.note)} className="max-w-[220px] truncate text-left hover:text-emerald-400 transition-colors">
                        {a.note}
                      </button>
                    ) : <span className="text-gray-600">-</span>}
                  </td>
                  <td className="px-5 py-3.5 text-gray-400 font-mono text-xs">{a.imap_host}:{a.imap_port}</td>
                  <td className="px-5 py-3.5">
                    {a.last_error ? (
                      <span className="text-red-400 text-xs flex items-center gap-1.5" title={a.last_error}>
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="truncate max-w-[200px]">{a.last_error}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        正常
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(a)} title="编辑"
                        className="p-1.5 rounded-md text-gray-400 hover:text-gray-200 hover:bg-gray-500/15 transition-colors">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(a.id, a.name)} title="删除"
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

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={closeModal}>
          <div className="bg-surface-800 border border-gray-700 rounded-xl shadow-2xl p-6 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold">{modal === "create" ? "添加邮箱账号" : "编辑邮箱账号"}</h3>
              <button onClick={closeModal} className="p-1 text-gray-500 hover:text-gray-300 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">名称</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="例如: 我的QQ邮箱"
                  className="w-full px-3 py-2 bg-surface-700 border border-gray-700 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">邮箱地址</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="example@qq.com"
                  className="w-full px-3 py-2 bg-surface-700 border border-gray-700 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">备注</label>
                <textarea
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  placeholder="可填写用途、来源或说明"
                  rows={3}
                  className="w-full px-3 py-2 bg-surface-700 border border-gray-700 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">密码</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder={modal === "edit" ? "留空不修改密码" : "请输入密码或授权码"}
                  className="w-full px-3 py-2 bg-surface-700 border border-gray-700 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition-colors"
                />
                <p className="text-xs text-gray-500 mt-1">QQ/163/126邮箱请使用授权码，Gmail请使用应用专用密码</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">IMAP 预设</label>
                <select
                  value={form.preset}
                  onChange={(e) => handlePresetChange(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-700 border border-gray-700 rounded-lg text-sm text-gray-100 focus:outline-none focus:border-emerald-500/50 transition-colors"
                >
                  {PRESETS.map((p) => (
                    <option key={p.label} value={p.label}>{p.label}</option>
                  ))}
                </select>
              </div>

              {isCustom && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">IMAP 服务器</label>
                  <input
                    value={form.imap_host}
                    onChange={(e) => setForm({ ...form, imap_host: e.target.value })}
                    placeholder="imap.example.com"
                    className="w-full px-3 py-2 bg-surface-700 border border-gray-700 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition-colors"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">端口</label>
                  <input
                    type="number"
                    value={form.imap_port}
                    onChange={(e) => setForm({ ...form, imap_port: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-surface-700 border border-gray-700 rounded-lg text-sm text-gray-100 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition-colors"
                  />
                </div>
                <div className="flex flex-col justify-center">
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">TLS/SSL</label>
                  <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.use_tls}
                      onChange={(e) => setForm({ ...form, use_tls: e.target.checked })}
                      className="rounded border-gray-600 bg-surface-700 text-emerald-500 focus:ring-emerald-500/30"
                    />
                    启用 TLS
                  </label>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleTest}
                  disabled={testing || !form.email.trim() || !form.imap_host.trim() || (modal === "create" && !form.password.trim())}
                  className="px-4 py-2 bg-surface-700 hover:bg-surface-600 border border-gray-700 hover:border-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-sm text-gray-300 rounded-lg transition-colors flex items-center gap-2"
                >
                  {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  测试连接
                </button>
                {testResult && (
                  <span className={`flex items-center gap-1.5 text-sm ${testResult.ok ? "text-emerald-400" : "text-red-400"}`}>
                    {testResult.ok
                      ? <><CheckCircle className="w-4 h-4" /> 连接成功</>
                      : <><AlertCircle className="w-4 h-4" /> {testResult.error || "连接失败"}</>
                    }
                  </span>
                )}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button onClick={closeModal} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors">
                取消
              </button>
              <button
                onClick={submit}
                disabled={saving || !canSubmit}
                className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
              >
                {saving ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}

      {notePreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setNotePreview(null)}>
          <div className="bg-surface-800 border border-gray-700 rounded-xl shadow-2xl p-6 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold">完整备注</h3>
              <button onClick={() => setNotePreview(null)} className="p-1 text-gray-500 hover:text-gray-300 transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="whitespace-pre-wrap text-sm text-gray-300 leading-6">{notePreview}</div>
          </div>
        </div>
      )}
    </div>
  )
}
