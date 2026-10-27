import { createEffect, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { createKeyed, type Context } from "@opencode/plugin/gui"
import { Handoff, type StatusOutput } from "../rpc"

export const [statuses, setStatuses] = createStore<Record<string, StatusOutput | undefined>>({})

export async function refreshStatus(ctx: Context, session: { key: string; id: string }) {
  try {
    const result = (await ctx.client.rpc(Handoff).status({ sessionID: session.id })) as StatusOutput
    setStatuses(session.key, result)
  } catch {
    setStatuses(session.key, undefined)
  }
}

export function watchStatus(ctx: Context) {
  createKeyed(
    () => ctx.sessions.current()?.key,
    () => {
      const session = ctx.sessions.current()
      if (!session) return

      createEffect(() => {
        const updated = session.server.data.session.get(session.id)?.time.updated
        if (updated === undefined) return

        const timer = setTimeout(() => void refreshStatus(ctx, session), 400)
        onCleanup(() => clearTimeout(timer))
      })
    },
  )
}
