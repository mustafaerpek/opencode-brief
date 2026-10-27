import {
  Command,
  ComposerPill,
  MenuItem,
  Panel,
  SettingsPage,
  Style,
  type PanelTab,
  type Plugin,
} from "@opencode/plugin/gui"
import type { definition } from "./definition"
import { BriefPanel } from "./panel"
import { HandoffSettings } from "./settings"
import { statuses, watchStatus } from "./status"
import { styles } from "./styles"

export const setup: Plugin.Setup<typeof definition> = (ctx) => {
  watchStatus(ctx)
  const tab: PanelTab = {
    id: "main",
    get title() {
      return ctx.t("panel.title")
    },
    closable: "compact",
    fallback: true,
  }

  ctx.add(
    Command,
    (): Command => ({
      id: "open",
      title: ctx.t("command.open"),
      description: ctx.t("command.open.description"),
      section: "session",
      run: () => {
        const session = ctx.sessions.current()
        if (session) ctx.layout.toggle(`${ctx.id}:main`, session)
      },
    }),
  )

  ctx.add(Panel, {
    id: "main",
    region: "side",
    mobile: {
      get title() {
        return ctx.t("panel.title")
      },
      order: 40,
      kind: "menu",
      icon: "file-document",
    },
    list: (input) => (input.open.includes("main") ? [tab] : []),
    render: (props) => <BriefPanel session={props.session} />,
  })

  ctx.add(
    MenuItem,
    (): MenuItem => {
      const session = ctx.sessions.current()

      return {
        menu: "session.panel",
        id: "brief",
        title: ctx.t("panel.title"),
        icon: "file-document",
        keybind: `${ctx.id}.open`,
        opened: !!session && ctx.layout.state(`${ctx.id}:main`, session) !== "closed",
        run: () => {
          const current = ctx.sessions.current()
          if (current) ctx.layout.open(`${ctx.id}:main`, current)
        },
      }
    },
  )

  ctx.add(SettingsPage, {
    id: "handoff",
    icon: "file-document",
    get title() {
      return ctx.t("settings.title")
    },
    render: () => <HandoffSettings />,
  })

  ctx.add(ComposerPill, {
    id: "stale",
    order: 20,
    show: (input) => {
      const status = statuses[input.session.key]
      if (!status?.exists || !status.stale) return undefined

      return {
        icon: "circle-exclamation",
        label: ctx.t("pill.stale"),
        title: ctx.t("pill.stale.description"),
        tone: "warning",
        run: () => ctx.layout.open(`${ctx.id}:main`, input.session),
      }
    },
  })

  ctx.add(Style, styles)
}
