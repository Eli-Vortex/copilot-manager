import { Subprocess } from "bun"
import fs from "node:fs"
import path from "node:path"

import { groups as groupsDb, type AccountRow, DATA_DIR } from "./db"

const COPILOT_API_DIR = path.resolve(import.meta.dir, "..", "core")
const COPILOT_API_ENTRY = path.join(COPILOT_API_DIR, "src", "main.ts")

interface InstanceState {
  groupId: string
  port: number
  process: Subprocess | null
  status: "stopped" | "starting" | "running" | "error"
  startedAt: string | null
  errorMessage: string | null
  logs: string[]
}

const instances = new Map<string, InstanceState>()
const MAX_LOG_LINES = 500

function getGroupDataDir(groupId: string): string {
  const dir = path.join(DATA_DIR, "groups", groupId)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function writeGroupConfig(groupId: string, groupAccounts: AccountRow[]): string {
  const dir = getGroupDataDir(groupId)
  const config = {
    accounts: groupAccounts
      .filter((a) => a.active)
      .map((a) => ({
        name: a.name,
        githubToken: a.github_token,
        accountType: a.account_type,
        tier: a.tier,
        active: true,
      })),
  }
  const configPath = path.join(dir, "config.json")
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2))

  const tokenPath = path.join(dir, "github_token")
  if (!fs.existsSync(tokenPath)) {
    fs.writeFileSync(tokenPath, "")
  }

  return dir
}

function appendLog(state: InstanceState, line: string) {
  state.logs.push(line)
  if (state.logs.length > MAX_LOG_LINES) {
    state.logs.splice(0, state.logs.length - MAX_LOG_LINES)
  }
}

async function readStream(stream: ReadableStream<Uint8Array> | null, state: InstanceState) {
  if (!stream) return
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() || ""
      for (const line of lines) {
        if (line.trim()) appendLog(state, line)
      }
    }
    if (buffer.trim()) appendLog(state, buffer)
  } catch {
    // stream closed
  }
}

export function startInstance(groupId: string): { ok: boolean; error?: string } {
  const existing = instances.get(groupId)
  if (existing?.status === "running" || existing?.status === "starting") {
    return { ok: false, error: "Instance already running" }
  }

  const group = groupsDb.get(groupId)
  if (!group) return { ok: false, error: "Group not found" }

  const groupAccounts = groupsDb.getAccounts(groupId)
  if (groupAccounts.length === 0) {
    return { ok: false, error: "No accounts assigned to this group" }
  }

  const activeAccounts = groupAccounts.filter((a) => a.active)
  if (activeAccounts.length === 0) {
    return { ok: false, error: "No active accounts in this group" }
  }

  if (!fs.existsSync(COPILOT_API_ENTRY)) {
    return { ok: false, error: `copilot-api not found at ${COPILOT_API_DIR}` }
  }

  const apiHome = writeGroupConfig(groupId, groupAccounts)

  const state: InstanceState = {
    groupId,
    port: group.port,
    process: null,
    status: "starting",
    startedAt: new Date().toISOString(),
    errorMessage: null,
    logs: [],
  }
  instances.set(groupId, state)

  try {
    const proc = Bun.spawn([process.execPath, "run", COPILOT_API_ENTRY, "start", "--port", String(group.port)], {
      cwd: COPILOT_API_DIR,
      env: {
        ...process.env,
        COPILOT_API_HOME: apiHome,
        NODE_ENV: "production",
      },
      stdout: "pipe",
      stderr: "pipe",
    })

    state.process = proc

    readStream(proc.stdout, state)
    readStream(proc.stderr, state)

    setTimeout(async () => {
      const current = instances.get(groupId)
      if (!current || current.process !== proc) return

      if (proc.exitCode !== null) {
        current.status = "error"
        current.errorMessage = `Process exited with code ${proc.exitCode}`
        return
      }

      try {
        const resp = await fetch(`http://127.0.0.1:${group.port}/`)
        if (resp.ok) {
          current.status = "running"
        }
      } catch {
        // might still be starting, give it more time
      }

      if (current.status === "starting") {
        setTimeout(async () => {
          const c = instances.get(groupId)
          if (!c || c.process !== proc || c.status !== "starting") return
          try {
            const resp = await fetch(`http://127.0.0.1:${group.port}/`)
            c.status = resp.ok ? "running" : "error"
            if (!resp.ok) c.errorMessage = "Health check failed after startup"
          } catch {
            c.status = "error"
            c.errorMessage = "Health check failed after startup"
          }
        }, 8000)
      }
    }, 3000)

    proc.exited.then((code) => {
      const current = instances.get(groupId)
      if (current?.process === proc) {
        current.status = "stopped"
        current.process = null
        if (code !== 0 && code !== null) {
          current.status = "error"
          current.errorMessage = `Process exited with code ${code}`
        }
      }
    })

    return { ok: true }
  } catch (err) {
    state.status = "error"
    state.errorMessage = err instanceof Error ? err.message : String(err)
    return { ok: false, error: state.errorMessage }
  }
}

export function stopInstance(groupId: string): { ok: boolean; error?: string } {
  const state = instances.get(groupId)
  if (!state?.process) {
    if (state) state.status = "stopped"
    return { ok: true }
  }

  try {
    state.process.kill()
    state.process = null
    state.status = "stopped"
    state.errorMessage = null
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export function restartInstance(groupId: string): { ok: boolean; error?: string } {
  stopInstance(groupId)
  return startInstance(groupId)
}

export function getInstanceStatus(groupId: string) {
  const state = instances.get(groupId)
  if (!state) {
    return { status: "stopped" as const, port: 0, startedAt: null, errorMessage: null }
  }

  if (state.process && state.process.exitCode !== null && state.status === "running") {
    state.status = "stopped"
    state.process = null
  }

  return {
    status: state.status,
    port: state.port,
    startedAt: state.startedAt,
    errorMessage: state.errorMessage,
  }
}

export function getInstanceLogs(groupId: string, lines = 100): string[] {
  const state = instances.get(groupId)
  if (!state) return []
  return state.logs.slice(-lines)
}

export function getAllInstanceStatuses() {
  const result: Record<string, ReturnType<typeof getInstanceStatus>> = {}
  for (const [groupId] of instances) {
    result[groupId] = getInstanceStatus(groupId)
  }
  return result
}

export function shutdownAll() {
  for (const [groupId] of instances) {
    stopInstance(groupId)
  }
}
