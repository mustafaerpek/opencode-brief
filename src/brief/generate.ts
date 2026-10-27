import type { Plugin } from "@opencode/plugin"
import type { GenerateInput, GenerateOutput, StatusOutput } from "../rpc"

interface CachedBrief {
  markdown: string
  generatedAt: number
  sessionUpdated: number
}

interface FileChange {
  file: string
  additions: number
  deletions: number
  status: "added" | "deleted" | "modified"
}

interface ShellCommand {
  command: string
  status: string
  exit?: number | string
}

interface Todo {
  file: string
  text: string
}

interface Evidence {
  session: Awaited<ReturnType<Plugin.Context["session"]["get"]>>
  files: FileChange[]
  commands: ShellCommand[]
  todos: Todo[]
  firstRequest?: string
  lastRequest?: string
  lastAssistant?: string
  tools: Map<string, number>
}

const cacheKey = (sessionID: string) => `brief/${sessionID}`

export async function generateBrief(ctx: Plugin.Context, input: GenerateInput): Promise<GenerateOutput> {
  const session = await ctx.session.get({ sessionID: input.sessionID })
  const cached = await readCache(ctx, input.sessionID)

  if (!input.force && cached && cached.sessionUpdated >= session.time.updated) {
    return { markdown: cached.markdown, stale: false, generatedAt: cached.generatedAt }
  }

  const evidence = await collect(ctx, session)
  const markdown = render(evidence, input)
  const generatedAt = Date.now()

  await ctx.storage.set(cacheKey(input.sessionID), {
    markdown,
    generatedAt,
    sessionUpdated: session.time.updated,
  })

  return { markdown, stale: false, generatedAt }
}

export async function briefStatus(ctx: Plugin.Context, sessionID: string): Promise<StatusOutput> {
  const [session, cached] = await Promise.all([ctx.session.get({ sessionID }), readCache(ctx, sessionID)])

  if (!cached) return { exists: false, stale: true }

  return {
    exists: true,
    stale: session.time.updated > cached.sessionUpdated,
    generatedAt: cached.generatedAt,
  }
}

async function collect(
  ctx: Plugin.Context,
  session: Awaited<ReturnType<Plugin.Context["session"]["get"]>>,
): Promise<Evidence> {
  const messages = await ctx.session.context({ sessionID: session.id })
  const directory = session.location.directory

  const status = await safe(() => ctx.vcs.status({ location: { directory } }), undefined)
  const diff = await safe(
    () => ctx.vcs.diff({ location: { directory }, mode: "working", context: 3 }),
    undefined,
  )

  const userTexts: string[] = []
  const assistantTexts: string[] = []
  const commands: ShellCommand[] = []
  const tools = new Map<string, number>()

  for (const message of messages) {
    if (message.type === "user") {
      userTexts.push(message.text)
      continue
    }

    if (message.type === "shell") {
      commands.push({
        command: message.command,
        status: message.status,
        exit: typeof message.exit === "number" ? message.exit : message.exit,
      })
      continue
    }

    if (message.type !== "assistant") continue

    for (const part of message.content) {
      if (part.type === "text") assistantTexts.push(part.text)
      if (part.type === "tool") tools.set(part.name, (tools.get(part.name) ?? 0) + 1)
    }
  }

  const files: FileChange[] = (status?.data ?? []).map((file) => ({
    file: file.file,
    additions: file.additions,
    deletions: file.deletions,
    status: file.status,
  }))

  if (files.length === 0) {
    for (const file of diff?.data ?? []) {
      files.push({
        file: file.file,
        additions: file.additions,
        deletions: file.deletions,
        status: file.status,
      })
    }
  }

  const todos: Todo[] = []
  for (const file of diff?.data ?? []) {
    for (const line of file.patch.split("\n")) {
      if (!line.startsWith("+") || line.startsWith("+++")) continue
      const match = line.match(/\b(TODO|FIXME|XXX)\b[:\s-]*(.*)/)
      if (!match) continue
      todos.push({ file: file.file, text: `${match[1]}: ${match[2]}`.trim() })
      if (todos.length >= 8) break
    }
    if (todos.length >= 8) break
  }

  return {
    session,
    files,
    commands,
    todos,
    firstRequest: userTexts[0],
    lastRequest: userTexts.at(-1),
    lastAssistant: assistantTexts.at(-1),
    tools,
  }
}

function render(evidence: Evidence, input: GenerateInput): string {
  const title = evidence.session.title?.trim() || "Untitled session"
  const additions = evidence.files.reduce((total, file) => total + file.additions, 0)
  const deletions = evidence.files.reduce((total, file) => total + file.deletions, 0)
  const testCommands = evidence.commands.filter((command) => isTestCommand(command.command))
  const otherCommands = evidence.commands.filter((command) => !isTestCommand(command.command))
  const lines: string[] = []

  lines.push(`# Handoff: ${title}`)
  lines.push("")
  lines.push(`- Session: \`${evidence.session.id}\``)
  lines.push(`- Directory: \`${evidence.session.location.directory}\``)
  lines.push(`- Generated: ${new Date().toISOString()}`)
  lines.push(`- Files: ${evidence.files.length} (+${additions}/-${deletions})`)
  lines.push(`- Commands: ${evidence.commands.length}, tests: ${testCommands.length}`)
  lines.push("")

  lines.push("## Request")
  lines.push("")
  if (evidence.firstRequest) {
    lines.push("First request:")
    lines.push("")
    lines.push(blockquote(clip(evidence.firstRequest, 1200)))
  } else {
    lines.push("No user request was recorded.")
  }
  if (evidence.lastRequest && evidence.lastRequest !== evidence.firstRequest) {
    lines.push("")
    lines.push("Latest request:")
    lines.push("")
    lines.push(blockquote(clip(evidence.lastRequest, 1200)))
  }
  lines.push("")

  lines.push("## What changed")
  lines.push("")
  if (evidence.files.length === 0) {
    lines.push("No working-tree changes were detected.")
  } else {
    for (const file of evidence.files) {
      lines.push(`- \`${file.file}\` (+${file.additions}/-${file.deletions}, ${file.status})`)
    }
  }
  lines.push("")

  if (input.includeCommands !== false && otherCommands.length > 0) {
    lines.push("## Commands")
    lines.push("")
    for (const command of otherCommands) {
      lines.push(`- \`${clip(command.command, 160)}\` (${formatCommand(command)})`)
    }
    lines.push("")
  }

  if (input.includeTests !== false) {
    lines.push("## Verification")
    lines.push("")
    if (testCommands.length === 0) {
      lines.push("No test, typecheck, or lint command was run in this session.")
    } else {
      for (const command of testCommands) {
        lines.push(`- \`${clip(command.command, 160)}\` (${formatCommand(command)})`)
      }
    }
    lines.push("")
  }

  if (evidence.tools.size > 0) {
    lines.push("## Tool activity")
    lines.push("")
    for (const [name, count] of evidence.tools) {
      lines.push(`- \`${name}\` x${count}`)
    }
    lines.push("")
  }

  if (evidence.lastAssistant) {
    lines.push("## Last assistant message")
    lines.push("")
    lines.push(blockquote(clip(evidence.lastAssistant, 900)))
    lines.push("")
  }

  lines.push("## Open questions")
  lines.push("")
  if (evidence.todos.length === 0 && testCommands.length > 0) {
    lines.push("No TODOs were found in the working diff.")
  } else {
    for (const todo of evidence.todos) {
      lines.push(`- \`${todo.file}\`: ${todo.text}`)
    }
    if (testCommands.length === 0) {
      lines.push("- No test command was run, so verification is incomplete.")
    }
  }
  lines.push("")

  lines.push("## Next steps")
  lines.push("")
  if (testCommands.length === 0) lines.push("- Run the project's test command.")
  if (evidence.files.length > 0) lines.push("- Review the diff before opening a pull request.")
  if (evidence.todos.length > 0) lines.push("- Resolve or track the TODOs above.")
  lines.push("- Regenerate this brief after more changes.")
  lines.push("")

  return lines.join("\n")
}

function isTestCommand(command: string): boolean {
  return /\b(test|tests|vitest|jest|pytest|playwright|cypress|typecheck|tsc|lint|eslint|biome)\b/i.test(command)
}

function formatCommand(command: ShellCommand): string {
  if (command.status === "exited" && command.exit !== undefined) return `exit ${command.exit}`
  return command.status
}

function blockquote(text: string): string {
  return text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n")
}

function clip(text: string, max: number): string {
  const clean = text.trim()
  return clean.length <= max ? clean : `${clean.slice(0, max - 3)}...`
}

async function safe<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run()
  } catch {
    return fallback
  }
}

async function readCache(ctx: Plugin.Context, sessionID: string): Promise<CachedBrief | undefined> {
  const value = await ctx.storage.get(cacheKey(sessionID))
  if (!value || typeof value !== "object") return undefined

  const record = value as Record<string, unknown>
  if (
    typeof record.markdown !== "string" ||
    typeof record.generatedAt !== "number" ||
    typeof record.sessionUpdated !== "number"
  ) {
    return undefined
  }

  return {
    markdown: record.markdown,
    generatedAt: record.generatedAt,
    sessionUpdated: record.sessionUpdated,
  }
}
