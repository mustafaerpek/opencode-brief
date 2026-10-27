import { describe, expect, test } from "bun:test"
import tui from "../src/tui"

type TuiContext = Parameters<typeof tui.setup>[0]
type Layer = ReturnType<Parameters<TuiContext["keymap"]["layer"]>[0]>
type Command = NonNullable<Layer["commands"]>[number]

function makeContext(options: { session?: boolean; select?: string; directory?: string } = {}) {
  const generated: unknown[] = []
  const alerts: string[] = []
  const toasts: Array<{ message: string; variant?: string }> = []
  const writes: Array<{ location?: { directory?: string }; path: string; payload: Uint8Array }> = []
  const layers: Array<() => Layer> = []
  const sessionID = "ses_tui"

  const context = {
    location: { directory: options.directory ?? "/tmp/repo" },
    data: {
      session: {
        get: (id: string) =>
          options.directory && id === sessionID ? { location: { directory: options.directory } } : undefined,
      },
    },
    client: {
      rpc: () => ({
        generate: async (input: unknown) => {
          generated.push(input)
          return { markdown: "# Handoff: TUI\n\n- test", stale: false, generatedAt: 1 }
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
        current: () => (options.session === false ? { type: "home" } : { type: "session", sessionID }),
      },
      dialog: {
        select: async () => options.select,
        alert: async (input: { message: string }) => {
          alerts.push(input.message)
        },
      },
      toast: {
        show: (input: { message: string; variant?: string }) => {
          toasts.push(input)
        },
      },
    },
    keymap: {
      layer: (factory: () => Layer) => {
        layers.push(factory)
      },
    },
  }

  return { context: context as unknown as TuiContext, layers, generated, alerts, toasts, writes, sessionID }
}

function command(context: ReturnType<typeof makeContext>): Command {
  const layer = context.layers[0]?.()
  const found = layer?.commands?.find((item) => item.id === "handoff.brief")
  if (!found) throw new Error("handoff.brief command was not registered")
  return found
}

describe("handoff tui", () => {
  test("generates the brief for the routed session and shows it", async () => {
    const fake = makeContext({ select: "show" })
    tui.setup(fake.context)

    await command(fake).run()

    expect(fake.generated).toEqual([{ sessionID: fake.sessionID }])
    expect(fake.alerts).toEqual(["# Handoff: TUI\n\n- test"])
  })

  test("saves HANDOFF.md through the server file API", async () => {
    const fake = makeContext({ select: "save", directory: "/tmp/repo" })
    tui.setup(fake.context)

    await command(fake).run()

    expect(fake.writes).toHaveLength(1)
    expect(fake.writes[0]).toMatchObject({ location: { directory: "/tmp/repo" }, path: "HANDOFF.md" })
    expect(new TextDecoder().decode(fake.writes[0].payload)).toBe("# Handoff: TUI\n\n- test")
    expect(fake.toasts.at(-1)?.variant).toBe("success")
  })

  test("warns when no session is open", async () => {
    const fake = makeContext({ session: false })
    tui.setup(fake.context)

    await command(fake).run()

    expect(fake.generated).toEqual([])
    expect(fake.toasts.at(-1)).toMatchObject({ message: "Open a session first.", variant: "warning" })
  })
})
