import { JsonSchema } from "effect"
import { Rpc } from "@opencode/plugin/rpc"

const generateInput: JsonSchema.JsonSchema = {
  type: "object",
  properties: {
    sessionID: { type: "string" },
    force: { type: "boolean" },
    locale: { type: "string", maxLength: 35 },
    includeCommands: { type: "boolean" },
    includeTests: { type: "boolean" },
  },
  required: ["sessionID"],
  additionalProperties: false,
}

const generateOutput: JsonSchema.JsonSchema = {
  type: "object",
  properties: {
    markdown: { type: "string" },
    stale: { type: "boolean" },
    generatedAt: { type: "number" },
  },
  required: ["markdown", "stale", "generatedAt"],
  additionalProperties: false,
}

const statusOutput: JsonSchema.JsonSchema = {
  type: "object",
  properties: {
    exists: { type: "boolean" },
    stale: { type: "boolean" },
    generatedAt: { type: "number" },
  },
  required: ["exists", "stale"],
  additionalProperties: false,
}

export const Handoff = Rpc.define({
  id: "handoff",
  methods: {
    generate: {
      input: generateInput,
      output: generateOutput,
    },
    status: {
      input: {
        type: "object",
        properties: { sessionID: { type: "string" } },
        required: ["sessionID"],
        additionalProperties: false,
      } satisfies JsonSchema.JsonSchema,
      output: statusOutput,
    },
  },
  events: {},
})

export interface GenerateInput {
  sessionID: string
  force?: boolean
  locale?: string
  includeCommands?: boolean
  includeTests?: boolean
}

export interface GenerateOutput {
  markdown: string
  stale: boolean
  generatedAt: number
}

export interface StatusOutput {
  exists: boolean
  stale: boolean
  generatedAt?: number
}
