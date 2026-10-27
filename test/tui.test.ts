import { describe, expect, test } from "bun:test"
import tui, { generateBriefFor, saveBrief, wrapBrief } from "../src/tui"

type TuiContext = Parameters<typeof tui.setup>[0]
type Layer = ReturnType<Parameters<TuiContext["keymap"]["layer"]>[0]>
type Command = NonNullable<Layer["commands"]>[number]

interface SessionOption {
  id: string
  title?: string
  updated?: number
  directory?: string
  parentID?: string
}

function makeContext(
  options: {
    route?: { type: "session"; sessionID: string } | { type: "home" }
    answers?: string[]
    directory?: string
    sessions?: SessionOption[]
    markdown?: string
    panelOpen?: boolean
  } = {},
) {
  const generated: unknown[] = []
  const alerts: string[] = []
  const toasts: Array<{ message: string; variant?: string }> = []
  const writes: Array<{ location?: { directory?: string }; path: string; payload: Uint8Array }> = []
  const opened: string[] = []
  const navigated: unknown[] = []
  const layers: Array<() => Layer> = []
  const answers = [...(options.answers ?? [])]
  const sessionID = "ses_tui"
  const sessions = options.sessions ?? []
  const route = options.route ?? { type: "session", sessionID }
  const directory = options.directory ?? "/tmp/repo"
  const markdown = options.markdown ?? "# Handoff: TUI\n\n- test"

  const context = {
    location: { directory },
    options: { locale: "en" },
    data: {
      session: {
        list: () =>
          sessions.map((session) => ({
            id: session.id,
            title: session.title,
            parentID: session.parentID,
            time: { created: 1, updated: session.updated ?? 1 },
            location: { directory: session.directory ?? "/tmp/repo" },
          })),
        get: (id: string) => {
          const found = sessions.find((session) => session.id === id)
          if (found) return { location: { directory: found.directory ?? "/tmp/repo" } }
          if (id === sessionID) return { location: { directory } }
          return undefined
        },
      },
    },
    client: {
      rpc: () => ({
        generate: async (input: { sessionID: string; force?: boolean }) => {
          generated.push(input)
          return { markdown, stale: false, generatedAt: 1 }
        },
      }),
      file: {
        write: async (input: { location?: { directory?: string }; path: string; payload: Uint8Array }) => {
          writes.push(input)
          return { data: { path: input.path } }
        },
      },
    },
    ui: {
      router: {
        current: () => route,
        navigate: (destination: unknown) => {
          navigated.push(destination)
        },
      },
      dialog: {
        select: async () => answers.shift(),
        alert: async (input: { message: string }) => {
          alerts.push(input.message)
        },
      },
      toast: {
        show: (input: { message: string; variant?: string }) => {
          toasts.push(input)
        },
      },
      format: { path: (value: string) => value },
      panel: {
        open: (name: string) => {
          opened.push(name)
          return options.panelOpen ?? true
        },
        close: () => {},
        current: () => undefined,
      },
      slot: () => () => {},
    },
    keymap: {
      layer: (factory: () => Layer) => {
        layers.push(factory)
      },
    },
  }

  return { context: context as unknown as TuiContext, layers, generated, alerts, toasts, writes, opened, navigated, sessionID }
}

function command(context: ReturnType<typeof makeContext>): Command {
  const layer = context.layers[0]?.()
  const found = layer?.commands?.find((item) => item.id === "handoff.brief")
  if (!found) throw new Error("handoff.brief command was not registered")
  return found
}

describe("handoff tui", () => {
  test("wraps long lines to the panel width", () => {
    const path = "- Directory: `/Users/mustafaerpek/Documents/Projects/Libraries/opencode-handoff`"
    const wrapped = wrapBrief(`# Handoff\n\n${path}`, 40)

    expect(wrapped.split("\n").every((line) => line.length <= 40)).toBe(true)
    expect(wrapped).toContain("- Directory:")
  })

  test("keeps blockquote prefixes on wrapped lines", () => {
    const wrapped = wrapBrief(`> ${"word ".repeat(20)}`, 24)
    const lines = wrapped.split("\n")

    expect(lines.every((line) => line.length <= 24)).toBe(true)
    expect(lines.every((line) => line.startsWith("> "))).toBe(true)
  })

  test("indents list continuations without repeating the bullet", () => {
    const wrapped = wrapBrief(`- Directory: \`/${"a".repeat(100)}\``, 40)
    const lines = wrapped.split("\n")

    expect(lines[0].startsWith("- ")).toBe(true)
    expect(lines.slice(1).every((line) => !line.startsWith("- "))).toBe(true)
    expect(lines.every((line) => line.length <= 40)).toBe(true)
  })

  test("generates a brief through the server RPC", async () => {
    const fake = makeContext({ markdown: "# Handoff: TUI" })

    const result = await generateBriefFor(fake.context, fake.sessionID)

    expect(result?.markdown).toBe("# Handoff: TUI")
    expect(fake.generated).toEqual([{ sessionID: fake.sessionID, force: false, locale: "en" }])
  })

  test("saves the brief through the server file API", async () => {
    const fake = makeContext()

    const saved = await saveBrief(fake.context, fake.sessionID, "# Handoff: TUI")

    expect(saved).toBe(true)
    expect(fake.writes[0]).toMatchObject({ location: { directory: "/tmp/repo" }, path: "HANDOFF.md" })
    expect(new TextDecoder().decode(fake.writes[0].payload)).toBe("# Handoff: TUI")
    expect(fake.toasts.at(-1)?.variant).toBe("success")
  })

  test("opens the brief panel for the routed session", async () => {
    const fake = makeContext()
    tui.setup(fake.context)

    await command(fake).run()

    expect(fake.opened).toEqual(["handoff.brief"])
    expect(fake.navigated).toEqual([])
    expect(fake.generated).toEqual([])
  })

  test("picks a session and opens the panel from home", async () => {
    const fake = makeContext({
      route: { type: "home" },
      answers: ["ses_other"],
      sessions: [{ id: "ses_other", title: "Other session", directory: "/tmp/other" }],
    })
    tui.setup(fake.context)

    await command(fake).run()

    expect(fake.navigated).toEqual([{ type: "session", sessionID: "ses_other" }])
    expect(fake.opened).toEqual(["handoff.brief"])
  })

  test("alerts when there is no session to pick", async () => {
    const fake = makeContext({ route: { type: "home" } })
    tui.setup(fake.context)

    await command(fake).run()

    expect(fake.alerts).toEqual(["Open a session first."])
    expect(fake.opened).toEqual([])
  })
})
