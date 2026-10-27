import { Plugin } from "@opencode/plugin"
import { briefStatus, generateBrief } from "./brief/generate"
import { Handoff, type GenerateInput } from "./rpc"

export default Plugin.define({
  id: "handoff",
  async setup(ctx) {
    await ctx.rpc.register(Handoff, {
      generate: async (input) => {
        return generateBrief(ctx, input as GenerateInput)
      },
      status: async (input) => {
        const { sessionID } = input as { sessionID: string }
        return briefStatus(ctx, sessionID)
      },
    })
  },
})
