import { createSignal, Show } from "solid-js"
import { createKeyed, usePlugin, type MountedSession } from "@opencode/plugin/gui"
import { Handoff, type GenerateOutput } from "../rpc"
import type { definition } from "./definition"
import { setStatuses, statuses } from "./status"

export function BriefPanel(props: { session: MountedSession }) {
  const ctx = usePlugin<typeof definition>()
  const ui = ctx.ui
  const [markdown, setMarkdown] = createSignal("")
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string>()

  const status = () => statuses[props.session.key]
  const stale = () => status()?.exists === true && status()?.stale === true

  const generate = async (force = false) => {
    setLoading(true)
    setError(undefined)

    try {
      const result = (await ctx.client.rpc(Handoff).generate({
        sessionID: props.session.id,
        force,
        locale: ctx.locale.locale(),
        includeCommands: ctx.stores.prefs.value.includeCommands,
        includeTests: ctx.stores.prefs.value.includeTests,
      })) as GenerateOutput

      setMarkdown(result.markdown)
      setStatuses(props.session.key, { exists: true, stale: false, generatedAt: result.generatedAt })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoading(false)
    }
  }

  createKeyed(
    () => props.session.id,
    () => void generate(),
  )

  const copy = async () => {
    const text = markdown()
    if (!text) return
    await ctx.system.copy(text)
    ctx.toast.show({ variant: "success", title: ctx.t("toast.copied") })
  }

  const save = async () => {
    const text = markdown()
    if (!text) return
    const saved = await ctx.system.save({ name: "HANDOFF.md", content: text })
    if (saved) ctx.toast.show({ variant: "success", title: ctx.t("toast.saved") })
  }

  const insert = () => {
    const text = markdown()
    if (!text) return
    ctx.screen.current()?.composer.insert(text)
    ctx.screen.current()?.composer.focus()
  }

  return (
    <div class="handoff">
      <div class="handoff-actions">
        <ui.Button variant="contrast" icon="file-document" busy={loading()} onClick={() => void generate(true)}>
          {ctx.t("panel.generate")}
        </ui.Button>
        <ui.Button variant="ghost" icon="copy" disabled={!markdown()} onClick={() => void copy()}>
          {ctx.t("panel.copy")}
        </ui.Button>
        <ui.Button variant="ghost" icon="download" disabled={!markdown()} onClick={() => void save()}>
          {ctx.t("panel.save")}
        </ui.Button>
        <ui.Button variant="ghost" icon="prompt" disabled={!markdown()} onClick={insert}>
          {ctx.t("panel.insert")}
        </ui.Button>
      </div>

      <Show when={stale()}>
        <div class="handoff-stale">
          <span>{ctx.t("panel.stale")}</span>
          <ui.Button variant="ghost" icon="refresh" busy={loading()} onClick={() => void generate(true)}>
            {ctx.t("panel.regenerate")}
          </ui.Button>
        </div>
      </Show>

      <Show when={error()}>
        {(message) => (
          <p class="handoff-error">
            {ctx.t("panel.error")} {message()}
          </p>
        )}
      </Show>

      <Show
        when={markdown()}
        fallback={loading() ? <ui.Loader /> : <p class="handoff-empty">{ctx.t("panel.empty")}</p>}
      >
        {(text) => <ui.Markdown text={text()} />}
      </Show>
    </div>
  )
}
