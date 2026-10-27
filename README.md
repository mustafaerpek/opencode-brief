# opencode-handoff

Turn an OpenCode session into a reviewable handoff brief.

OpenCode sessions are long and full of tool calls. When a session ends, the useful parts are buried: which files changed, which commands ran, what passed, and what is still open. `opencode-handoff` collects that evidence into one Markdown brief that you can copy into a pull request, save as `HANDOFF.md`, or insert into the next prompt.

## Status

Early scaffold. The first version builds the brief from session messages and the working diff without calling a model.

What works:

- A `handoff.generate` RPC method that reads the session, shell commands, tool activity, and VCS changes.
- A deterministic Markdown brief with request, changes, commands, verification, TODOs, and next steps.
- A session side panel with Generate, Copy, Save, and Insert actions.
- A command palette entry and a side-panel launcher.
- A settings page for including commands and verification.
- Cached briefs with a staleness check based on the session update time.
- A composer pill when the session moved past the cached brief; it opens the Brief panel.
- A stale notice in the panel with a Regenerate action.
- A `/handoff` slash command and a `Handoff: Generate brief` palette entry in the TUI. It shows the brief in a dialog or writes `HANDOFF.md`.

Next:

- Optional model-written "why" and "risks" sections.
- Desktop write-through to `HANDOFF.md`.
- PR description template.

## Install for local development

Install dependencies. The TUI part loads from source, so it needs no build. Build the GUI bundle for Desktop:

```sh
bun install
bun run build
```

Then point OpenCode at this directory. In a project config:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["/absolute/path/to/opencode-handoff"]
}
```

For OpenCode Desktop, put the package in the global config so the GUI loads in every window:

```jsonc
{
  "plugins": ["/absolute/path/to/opencode-handoff"]
}
```

`opencode.json(c)` is global at `~/.config/opencode/opencode.jsonc`. Desktop does not read `cli.json`.

During development:

```sh
bun run dev
```

`vite build --watch` rebuilds `dist/gui-experimental.cjs`. Each rebuild reloads the GUI in every window and in the Electron main process. The server part does not restart.

## Use

### Desktop

1. Open a session.
2. Run `Handoff: Open brief` from the command palette, or open the Brief tab from the side panel.
3. Generate the brief.
4. Copy it, save it as `HANDOFF.md`, or insert it into the composer.

After a brief exists, a composer pill appears when the session changes again. It reads `Handoff: brief is stale` and opens the Brief panel, where Regenerate replaces the cached brief. The pill does not appear before the first brief, because there is nothing to compare against.

### Terminal

1. Open a session and run `/handoff`, or pick `Handoff: Generate brief` from the command palette.
2. Choose `Show brief` to read the Markdown in a dialog, or `Save HANDOFF.md` to write it to the session directory.
3. Run it again after more changes. A fresh cached brief is returned as is; a stale one is rebuilt.

The terminal command calls the same server RPC as the Desktop panel, so both surfaces share one brief builder and one cache.

## Package layout

```text
src/
├── index.ts          server part, registers the RPC
├── rpc.ts            RPC contract shared by server, TUI, and GUI
├── brief/generate.ts deterministic brief builder
├── tui.ts            ./tui entry, the /handoff command
├── gui.tsx           ./gui-experimental entry
└── gui/
    ├── definition.ts stores, i18n
    ├── window.tsx    command, panel, menu item, settings page, composer pill, styles
    ├── panel.tsx     the Brief panel
    ├── settings.tsx  settings rows
    ├── status.ts     cached brief status store and refresh
    └── styles.ts     panel CSS
```

The package exposes:

- `.` server part
- `./rpc` RPC contract
- `./tui` terminal UI
- `./gui-experimental` desktop GUI bundle

## Privacy

This version does not send session text to a model. It reads the session messages and the working diff on the OpenCode server and renders Markdown locally.

The brief can include user prompts, assistant text, file paths, shell commands, and command output. Review it before pasting it into a public pull request or an external service.

## Development

```sh
bun test
bun run typecheck
bun run build
```

## License

MIT
