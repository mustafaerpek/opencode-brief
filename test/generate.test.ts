import { describe, expect, test } from "bun:test"
import type { Plugin } from "@opencode/plugin"
import { briefStatus, generateBrief } from "../src/brief/generate"

function makeContext() {
  const storage = new Map<string, unknown>()
  const session = {
    id: "ses_test",
    title: "Fix callback validation",
    time: { created: 1, updated: 100 },
    location: { directory: "/tmp/repo" },
  }

  const context = {
    session: {
      get: async () => session,
      context: async () => [
        { type: "user", text: "Validate the OAuth state before exchanging the code." },
        {
          type: "shell",
          command: "bun test src/auth",
          status: "exited",
          exit: 0,
        },
        {
          type: "assistant",
          content: [
            { type: "text", text: "I moved the state check before the code exchange." },
            { type: "tool", name: "edit" },
          ],
        },
      ],
    },
    vcs: {
      status: async () => ({
        data: [{ file: "src/auth/callback.ts", additions: 4, deletions: 1, status: "modified" }],
      }),
      diff: async () => ({
        data: [
          {
            file: "src/auth/callback.ts",
            patch: "+ // TODO: cover the expired state case",
            additions: 4,
            deletions: 1,
            status: "modified",
          },
        ],
      }),
    },
    storage: {
      get: async (key: string) => storage.get(key),
      set: async (key: string, value: unknown) => {
        storage.set(key, value)
      },
    },
  }

  return { ctx: context as unknown as Plugin.Context, session }
}

describe("handoff brief", () => {
  test("builds a deterministic brief from session evidence", async () => {
    const { ctx } = makeContext()
    const result = await generateBrief(ctx, { sessionID: "ses_test" })

    expect(result.markdown).toContain("# Handoff: Fix callback validation")
    expect(result.markdown).toContain("`src/auth/callback.ts` (+4/-1, modified)")
    expect(result.markdown).toContain("`bun test src/auth` (exit 0)")
    expect(result.markdown).toContain("TODO: cover the expired state case")
    expect(result.markdown).toContain("I moved the state check before the code exchange.")
  })

  test("marks the brief stale after the session updates", async () => {
    const { ctx, session } = makeContext()

    const empty = await briefStatus(ctx, "ses_test")
    expect(empty).toEqual({ exists: false, stale: true })

    const first = await generateBrief(ctx, { sessionID: "ses_test" })
    expect(first.stale).toBe(false)

    const fresh = await briefStatus(ctx, "ses_test")
    expect(fresh.exists).toBe(true)
    expect(fresh.stale).toBe(false)
    expect(fresh.generatedAt).toBe(first.generatedAt)

    session.time.updated = 200
    const stale = await briefStatus(ctx, "ses_test")
    expect(stale.exists).toBe(true)
    expect(stale.stale).toBe(true)
    expect(stale.generatedAt).toBe(first.generatedAt)
  })
})
