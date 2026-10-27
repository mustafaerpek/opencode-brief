import type { Plugin } from "@opencode/plugin"
import type { GenerateInput, GenerateOutput, StatusOutput } from "../rpc"

interface CachedBrief {
  markdown: string
  generatedAt: number
  sessionUpdated: number
  locale: Locale
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

type Locale = "en" | "tr"

interface Messages {
  untitled: string
  session: string
  directory: string
  generated: string
  files: string
  commands: string
  tests: string
  request: string
  firstRequest: string
  latestRequest: string
  noRequest: string
  whatChanged: string
  noChanges: string
  commandSection: string
  verification: string
  noVerification: string
  toolActivity: string
  lastAssistant: string
  openQuestions: string
  noTodos: string
  incompleteVerification: string
  nextSteps: string
  runTests: string
  reviewDiff: string
  resolveTodos: string
  regenerate: string
  fileStatus: Record<FileChange["status"], string>
}

const messages = {
  en: {
    untitled: "Untitled session",
    session: "Session",
    directory: "Directory",
    generated: "Generated",
    files: "Files",
    commands: "Commands",
    tests: "tests",
    request: "Request",
    firstRequest: "First request:",
    latestRequest: "Latest request:",
    noRequest: "No user request was recorded.",
    whatChanged: "What changed",
    noChanges: "No working-tree changes were detected.",
    commandSection: "Commands",
    verification: "Verification",
    noVerification: "No test, typecheck, or lint command was run in this session.",
    toolActivity: "Tool activity",
    lastAssistant: "Last assistant message",
    openQuestions: "Open questions",
    noTodos: "No TODOs were found in the working diff.",
    incompleteVerification: "No test command was run, so verification is incomplete.",
    nextSteps: "Next steps",
    runTests: "Run the project's test command.",
    reviewDiff: "Review the diff before opening a pull request.",
    resolveTodos: "Resolve or track the TODOs above.",
    regenerate: "Regenerate this brief after more changes.",
    fileStatus: {
      added: "added",
      deleted: "deleted",
      modified: "modified",
    },
  },
  tr: {
    untitled: "Başlıksız oturum",
    session: "Oturum",
    directory: "Dizin",
    generated: "Oluşturulma",
    files: "Dosyalar",
    commands: "Komutlar",
    tests: "test",
    request: "İstek",
    firstRequest: "İlk istek:",
    latestRequest: "Son istek:",
    noRequest: "Kullanıcı isteği kaydedilmedi.",
    whatChanged: "Neler değişti",
    noChanges: "Çalışma ağacında değişiklik bulunamadı.",
    commandSection: "Komutlar",
    verification: "Doğrulama",
    noVerification: "Bu oturumda test, typecheck veya lint komutu çalıştırılmadı.",
    toolActivity: "Araç etkinliği",
    lastAssistant: "Son asistan mesajı",
    openQuestions: "Açık sorular",
    noTodos: "Çalışma diff'inde TODO bulunamadı.",
    incompleteVerification: "Test komutu çalıştırılmadı, bu yüzden doğrulama eksik.",
    nextSteps: "Sonraki adımlar",
    runTests: "Projenin test komutunu çalıştır.",
    reviewDiff: "Pull request açmadan önce diff'i incele.",
    resolveTodos: "Yukarıdaki TODO'ları çöz veya takip et.",
    regenerate: "Daha fazla değişiklikten sonra bu brief'i yeniden oluştur.",
    fileStatus: {
      added: "eklendi",
      deleted: "silindi",
      modified: "değişti",
    },
  },
} satisfies Record<Locale, Messages>

function normalizeLocale(value?: string): Locale {
  const base = value?.trim().split(/[-_]/)[0]?.toLowerCase()
  return base === "tr" ? "tr" : "en"
}

const cacheKey = (sessionID: string) => `brief/${sessionID}`

export async function generateBrief(ctx: Plugin.Context, input: GenerateInput): Promise<GenerateOutput> {
  const session = await ctx.session.get({ sessionID: input.sessionID })
  const locale = normalizeLocale(input.locale)
  const cached = await readCache(ctx, input.sessionID)

  if (!input.force && cached && cached.locale === locale && cached.sessionUpdated >= session.time.updated) {
    return { markdown: cached.markdown, stale: false, generatedAt: cached.generatedAt }
  }

  const evidence = await collect(ctx, session)
  const markdown = render(evidence, input, locale)
  const generatedAt = Date.now()

  await ctx.storage.set(cacheKey(input.sessionID), {
    markdown,
    generatedAt,
    sessionUpdated: session.time.updated,
    locale,
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

function render(evidence: Evidence, input: GenerateInput, locale: Locale): string {
  const t = messages[locale]
  const title = (evidence.session.title?.trim() || t.untitled).replace(/\s+/g, " ")
  const additions = evidence.files.reduce((total, file) => total + file.additions, 0)
  const deletions = evidence.files.reduce((total, file) => total + file.deletions, 0)
  const testCommands = evidence.commands.filter((command) => isTestCommand(command.command))
  const otherCommands = evidence.commands.filter((command) => !isTestCommand(command.command))
  const lines: string[] = []

  lines.push(`# Handoff: ${title}`)
  lines.push("")
  lines.push(`- ${t.session}: ${code(evidence.session.id)}`)
  lines.push(`- ${t.directory}: ${code(evidence.session.location.directory)}`)
  lines.push(`- ${t.generated}: ${new Date().toISOString()}`)
  lines.push(`- ${t.files}: ${evidence.files.length} (+${additions}/-${deletions})`)
  lines.push(`- ${t.commands}: ${evidence.commands.length}, ${t.tests}: ${testCommands.length}`)
  lines.push("")

  lines.push(`## ${t.request}`)
  lines.push("")
  if (evidence.firstRequest) {
    lines.push(t.firstRequest)
    lines.push("")
    lines.push(blockquote(clip(evidence.firstRequest, 1200)))
  } else {
    lines.push(t.noRequest)
  }
  if (evidence.lastRequest && evidence.lastRequest !== evidence.firstRequest) {
    lines.push("")
    lines.push(t.latestRequest)
    lines.push("")
    lines.push(blockquote(clip(evidence.lastRequest, 1200)))
  }
  lines.push("")

  lines.push(`## ${t.whatChanged}`)
  lines.push("")
  if (evidence.files.length === 0) {
    lines.push(t.noChanges)
  } else {
    for (const file of evidence.files) {
      lines.push(`- ${code(file.file)} (+${file.additions}/-${file.deletions}, ${t.fileStatus[file.status]})`)
    }
  }
  lines.push("")

  if (input.includeCommands !== false && otherCommands.length > 0) {
    lines.push(`## ${t.commandSection}`)
    lines.push("")
    for (const command of otherCommands) {
      lines.push(`- ${code(clip(command.command, 160))} (${formatCommand(command)})`)
    }
    lines.push("")
  }

  if (input.includeTests !== false) {
    lines.push(`## ${t.verification}`)
    lines.push("")
    if (testCommands.length === 0) {
      lines.push(t.noVerification)
    } else {
      for (const command of testCommands) {
        lines.push(`- ${code(clip(command.command, 160))} (${formatCommand(command)})`)
      }
    }
    lines.push("")
  }

  if (evidence.tools.size > 0) {
    lines.push(`## ${t.toolActivity}`)
    lines.push("")
    for (const [name, count] of evidence.tools) {
      lines.push(`- ${code(name)} x${count}`)
    }
    lines.push("")
  }

  if (evidence.lastAssistant) {
    lines.push(`## ${t.lastAssistant}`)
    lines.push("")
    lines.push(blockquote(clip(evidence.lastAssistant, 900)))
    lines.push("")
  }

  lines.push(`## ${t.openQuestions}`)
  lines.push("")
  if (evidence.todos.length === 0 && testCommands.length > 0) {
    lines.push(t.noTodos)
  } else {
    for (const todo of evidence.todos) {
      lines.push(`- ${code(todo.file)}: ${todo.text}`)
    }
    if (testCommands.length === 0) {
      lines.push(`- ${t.incompleteVerification}`)
    }
  }
  lines.push("")

  lines.push(`## ${t.nextSteps}`)
  lines.push("")
  if (testCommands.length === 0) lines.push(`- ${t.runTests}`)
  if (evidence.files.length > 0) lines.push(`- ${t.reviewDiff}`)
  if (evidence.todos.length > 0) lines.push(`- ${t.resolveTodos}`)
  lines.push(`- ${t.regenerate}`)
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
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n")
}

function code(text: string): string {
  const clean = text.replace(/\r?\n/g, " ")
  if (!clean.includes("`")) return `\`${clean}\``

  const fence = "`".repeat(Math.max(1, ...(clean.match(/`+/g) ?? []).map((run) => run.length + 1)))
  return `${fence} ${clean} ${fence}`
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
    typeof record.sessionUpdated !== "number" ||
    (record.locale !== "en" && record.locale !== "tr")
  ) {
    return undefined
  }

  return {
    markdown: record.markdown,
    generatedAt: record.generatedAt,
    sessionUpdated: record.sessionUpdated,
    locale: record.locale,
  }
}
