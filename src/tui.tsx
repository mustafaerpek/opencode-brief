/** @jsxImportSource @opentui/solid */
import { createEffect, createSignal, on, Show } from "solid-js"
import { Plugin } from "@opencode/plugin/tui"
import { Handoff, type GenerateOutput } from "./rpc"

const PANEL = "handoff.brief"

type TuiContext = Parameters<Parameters<typeof Plugin.define>[0]["setup"]>[0]

interface PanelInput {
  readonly name: string
  readonly sessionID: string
  readonly width: number
  readonly presentation: "panel" | "fullscreen"
  readonly focused: boolean
  readonly focus: () => void
  readonly close: () => void
  readonly toggleFullscreen: () => void
}

export function wrapBrief(text: string, width = 72): string {
  return text
    .split("\n")
    .flatMap((line) => wrapLine(line, width))
    .join("\n")
}

function wrapLine(line: string, width: number): string[] {
  if (line.length <= width) return [line]

  const prefix = line.match(/^(\s*(?:>\s*|[-*]\s+|\d+\.\s+)?)/)?.[1] ?? ""
  const body = line.slice(prefix.length)
  const available = Math.max(1, width - prefix.length)
  const continuation = /^\s*>/.test(prefix)
    ? prefix
    : /^\s*(?:[-*]\s+|\d+\.\s+)$/.test(prefix)
      ? " ".repeat(prefix.length)
      : prefix
  const words = body.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ""

  for (const word of words) {
    if (word.length > available) {
      if (current) {
        lines.push(current)
        current = ""
      }
      for (let index = 0; index < word.length; index += available) {
        lines.push(word.slice(index, index + available))
      }
      continue
    }

    if (!current) {
      current = word
    } else if (current.length + 1 + word.length <= available) {
      current += ` ${word}`
    } else {
      lines.push(current)
      current = word
    }
  }

  if (current) lines.push(current)
  return lines.map((value, index) => (index === 0 ? prefix : continuation) + value)
}

function tuiLocale(context: TuiContext): string | undefined {
  const configured = context.options.locale
  if (typeof configured === "string") return configured

  try {
    return Intl.DateTimeFormat().resolvedOptions().locale
  } catch {
    return undefined
  }
}

export async function generateBriefFor(
  context: TuiContext,
  sessionID: string,
  force = false,
): Promise<GenerateOutput | undefined> {
  try {
    return (await context.client.rpc(Handoff).generate({
      sessionID,
      force,
      locale: tuiLocale(context),
    })) as GenerateOutput
  } catch (cause) {
    context.ui.toast.show({
      title: "Handoff",
      message: cause instanceof Error ? cause.message : String(cause),
      variant: "error",
      sessionID,
    })
    return undefined
  }
}

export async function saveBrief(context: TuiContext, sessionID: string, markdown: string): Promise<boolean> {
  const directory = context.data.session.get(sessionID)?.location.directory ?? context.location?.directory

  if (!directory) {
    context.ui.toast.show({
      title: "Handoff",
      message: "The session has no directory.",
      variant: "warning",
      sessionID,
    })
    return false
  }

  try {
    const written = await context.client.file.write({
      location: { directory },
      path: "HANDOFF.md",
      payload: new TextEncoder().encode(markdown),
    })
    context.ui.toast.show({
      title: "Handoff",
      message: `Saved ${written.data.path}`,
      variant: "success",
      sessionID,
    })
    return true
  } catch (cause) {
    context.ui.toast.show({
      title: "Handoff",
      message: cause instanceof Error ? cause.message : String(cause),
      variant: "error",
      sessionID,
    })
    return false
  }
}

async function pickSession(context: TuiContext): Promise<string | undefined> {
  const sessions = context.data.session
    .list()
    .filter((session) => session.parentID === undefined)
    .sort((left, right) => right.time.updated - left.time.updated)
    .slice(0, 20)

  if (sessions.length === 0) {
    await context.ui.dialog.alert({ title: "Handoff", message: "Open a session first." })
    return undefined
  }

  return context.ui.dialog.select({
    title: "Handoff: pick a session",
    options: sessions.map((session) => ({
      title: session.title?.trim() || "Untitled session",
      value: session.id,
      description: context.ui.format.path(session.location.directory),
    })),
  })
}

export default Plugin.define({
  id: "handoff.tui",
  setup(context) {
    const openPanel = async () => {
      if (context.ui.panel.open(PANEL)) return true
      await new Promise((resolve) => setTimeout(resolve, 80))
      return context.ui.panel.open(PANEL)
    }

    function BriefPanel(props: { panel: PanelInput }) {
      const [markdown, setMarkdown] = createSignal("")
      const [loading, setLoading] = createSignal(false)
      const [error, setError] = createSignal<string>()

      const generate = async (sessionID: string, force = false) => {
        setLoading(true)
        setError(undefined)

        const result = await generateBriefFor(context, sessionID, force)
        if (result) {
          setMarkdown(result.markdown)
        } else {
          setError("The brief could not be generated.")
        }

        setLoading(false)
      }

      createEffect(
        on(
          () => props.panel.sessionID,
          (sessionID) => void generate(sessionID),
          { defer: false },
        ),
      )

      const save = async () => {
        const text = markdown()
        if (text) await saveBrief(context, props.panel.sessionID, text)
      }

      context.keymap.layer(() => ({
        commands: [
          {
            id: "handoff.save",
            title: "Save handoff brief",
            group: "Handoff",
            bind: "s",
            run: () => void save(),
          },
          {
            id: "handoff.regenerate",
            title: "Regenerate handoff brief",
            group: "Handoff",
            bind: "r",
            run: () => void generate(props.panel.sessionID, true),
          },
          {
            id: "handoff.fullscreen",
            title: "Toggle handoff full screen",
            group: "Handoff",
            bind: "f",
            run: () => props.panel.toggleFullscreen(),
          },
          {
            id: "handoff.close",
            title: "Close handoff panel",
            group: "Handoff",
            bind: "escape",
            run: () => props.panel.close(),
          },
        ],
      }))

      const text = () => wrapBrief(markdown(), Math.max(24, props.panel.width - 3))

      return (
        <box flexDirection="column" flexGrow={1} height="100%" gap={1} paddingLeft={1} paddingRight={1}>
          <box flexDirection="row" flexShrink={0} justifyContent="space-between">
            <text fg={context.theme.text.base}>
              <b>Handoff</b>
            </text>
            <text fg={context.theme.text.muted}>esc close</text>
          </box>
          <text fg={context.theme.text.muted} wrapMode="word">
            s save   r regenerate   f fullscreen
          </text>
          <Show when={error()}>
            <text fg={context.theme.text.feedback.error.base} wrapMode="word">
              {error()}
            </text>
          </Show>
          <Show
            when={markdown()}
            fallback={<text fg={context.theme.text.muted}>{loading() ? "Generating..." : "No brief yet."}</text>}
          >
            <scrollbox flexGrow={1} minHeight={0} focused={props.panel.focused}>
              <text fg={context.theme.text.base} wrapMode="word">
                {text()}
              </text>
            </scrollbox>
          </Show>
        </box>
      )
    }

    context.ui.slot({
      append: "session.panel",
      render: (panel) => (
        <Show when={panel.name === PANEL}>
          <BriefPanel panel={panel} />
        </Show>
      ),
    })

    context.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          id: "handoff.brief",
          title: "Handoff: Open brief",
          description: "Turn this session into a reviewable handoff brief",
          group: "Handoff",
          palette: true,
          slash: { name: "handoff" },
          run: async () => {
            const route = context.ui.router.current()

            if (route.type === "session") {
              if (!(await openPanel())) {
                context.ui.toast.show({
                  title: "Handoff",
                  message: "The brief panel could not open.",
                  variant: "warning",
                  sessionID: route.sessionID,
                })
              }
              return
            }

            const sessionID = await pickSession(context)
            if (!sessionID) return

            context.ui.router.navigate({ type: "session", sessionID })
            if (!(await openPanel())) {
              context.ui.toast.show({
                title: "Handoff",
                message: "Open the session and run /handoff again.",
                variant: "warning",
                sessionID,
              })
            }
          },
        },
      ],
    }))
  },
})
