import { usePlugin } from "@opencode/plugin/gui"
import type { definition } from "./definition"

export function HandoffSettings() {
  const ctx = usePlugin<typeof definition>()
  const ui = ctx.ui
  const prefs = ctx.stores.prefs

  return (
    <div class="handoff-settings">
      <ui.Switch
        label={ctx.t("settings.commands")}
        description={ctx.t("settings.commands.description")}
        checked={prefs.value.includeCommands}
        onChange={(checked) =>
          prefs.update((draft) => {
            draft.includeCommands = checked
          })
        }
      />
      <ui.Switch
        label={ctx.t("settings.tests")}
        description={ctx.t("settings.tests.description")}
        checked={prefs.value.includeTests}
        onChange={(checked) =>
          prefs.update((draft) => {
            draft.includeTests = checked
          })
        }
      />
      <p class="handoff-settings-note">{ctx.t("settings.note")}</p>
    </div>
  )
}
