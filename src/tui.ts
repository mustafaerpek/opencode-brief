import { Plugin } from "@opencode/plugin/tui"
import { Handoff, type GenerateOutput } from "./rpc"

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

export default Plugin.define({
  id: "handoff.tui",
  setup(context) {
    const generate = async (sessionID: string): Promise<GenerateOutput | undefined> => {
      try {
        return (await context.client.rpc(Handoff).generate({ sessionID })) as GenerateOutput
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

    const save = async (sessionID: string, markdown: string) => {
      const directory = context.data.session.get(sessionID)?.location.directory ?? context.location?.directory

      if (!directory) {
        context.ui.toast.show({
          title: "Handoff",
          message: "The session has no directory.",
          variant: "warning",
          sessionID,
        })
        return
      }

      const path = "HANDOFF.md"

      try {
        const written = await context.client.file.write({
          location: { directory },
          path,
          payload: new TextEncoder().encode(markdown),
        })
        context.ui.toast.show({
          title: "Handoff",
          message: `Saved ${written.data.path}`,
          variant: "success",
          sessionID,
        })
      } catch (cause) {
        context.ui.toast.show({
          title: "Handoff",
          message: cause instanceof Error ? cause.message : String(cause),
          variant: "error",
          sessionID,
        })
      }
    }

    const pickSession = async (): Promise<string | undefined> => {
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

    context.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          id: "handoff.brief",
          title: "Handoff: Generate brief",
          description: "Turn this session into a reviewable handoff brief",
          group: "Handoff",
          palette: true,
          slash: { name: "handoff" },
          run: async () => {
            const route = context.ui.router.current()
            const sessionID = route.type === "session" ? route.sessionID : await pickSession()

            if (!sessionID) return

            const result = await generate(sessionID)
            if (!result) return

            const action = await context.ui.dialog.select({
              title: "Handoff brief",
              options: [
                {
                  title: "Show brief",
                  value: "show",
                  description: "Read the Markdown in a dialog",
                },
                {
                  title: "Save HANDOFF.md",
                  value: "save",
                  description: "Write the brief to the session directory",
                },
              ],
            })

            if (action === "show") {
              const width = Math.max(48, Math.min(72, context.renderer.terminalWidth - 24))
              await context.ui.dialog.alert({ title: "Handoff brief", message: wrapBrief(result.markdown, width) })
            }

            if (action === "save") {
              await save(sessionID, result.markdown)
            }
          },
        },
      ],
    }))
  },
})
