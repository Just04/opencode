import { Schema } from "effect"

export const IconClass = Schema.Literals(["data", "bid", "onto"])

export const PresetMode = Schema.Literals(["project", "qa"])

export const Preset = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.String,
  icon: Schema.optional(Schema.String),
  iconClass: Schema.optional(IconClass),
  tagLabel: Schema.optional(Schema.String),
  skillTags: Schema.optional(Schema.Array(Schema.String)),
  directory: Schema.String,
  skills: Schema.optional(Schema.Array(Schema.String)),
  mode: Schema.optional(PresetMode).annotate({
    description: 'Sidebar mode for this preset: "project" or "qa" (default: "project")',
  }),
})

export const Info = Schema.Struct({
  directory: Schema.optional(Schema.String),
  defaultDirectory: Schema.optional(Schema.String),
  presets: Schema.optional(Schema.Array(Preset)),
  session_skills: Schema.optional(Schema.Boolean).annotate({
    description:
      "When true, only skills listed in the conversation preset's `skills` array are available in that session (default: false)",
  }),
  unlisted: Schema.optional(Schema.Literals(["deny", "hide"])).annotate({
    description:
      'How to treat ~/.config/opencode/skills not in the preset list when session_skills is enabled (default: "deny")',
  }),
})

export type Preset = Schema.Schema.Type<typeof Preset>
export type Info = Schema.Schema.Type<typeof Info>

export * as ConfigConversation from "./conversation"
