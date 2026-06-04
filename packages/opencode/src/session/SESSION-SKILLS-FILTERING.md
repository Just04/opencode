# Session Skills 过滤机制

## 概述

当 conversation 配置了 `presets` 和 `session_skills: true` 时，系统需要根据当前激活的 preset 对技能列表进行过滤。目标是：AI 只能看到和加载当前 preset 所允许的技能。

---

## 需求说明

**核心规则**：选择了某个 preset（例如 `data-query`）时，AI 的 `<available_skills>` 只能出现：
1. 该 preset 的 `skills` 白名单中的技能
2. 内置出厂技能 `customize-opencode`

**排除规则**：
- 未绑定任何 preset 的技能（如 `skill-creator`）→ 隐藏
- 绑定了其他 preset 但 mode 与当前不符的技能（如 `bid-writing` 在 mode=qa 时）→ 隐藏
- 绑定了同 mode 的其他 preset 的技能（如 `ontology-kb` 在 data-query 激活时）→ 隐藏

---

## 架构：技能展示入口

AI（LLM）能看到技能列表的入口有两个，必须同时过滤：

| # | 入口 | 代码位置 | 用途 |
|---|------|----------|------|
| 1 | 系统提示词 `<available_skills>` | `session/system.ts` → `Skill.fmt()` | 直接告知 AI 有哪些技能可用 |
| 2 | skill 工具的 `description` | `tool/registry.ts` → `describeSkill()` | 工具定义中的技能列表，AI 通过 tool description 也能看到 |

两个入口各自独立生成技能列表，**必须同时应用 session 过滤**，否则 AI 仍能通过另一个入口看到被屏蔽的技能。

---

## 过滤链路详解

### 入口 1：系统提示词

**调用链**：`prompt.ts:1841` → `sys.skills(agent, sessionID)` → `session/system.ts` → `Skill.fmt(list, { verbose: true })`

```ts
// session/system.ts
const list = sessionID
  ? yield* SessionSkillsContext.filterForSession(sessionID, available)
  : available  // ← 无 sessionID 时不过滤，返回全部
```

### 入口 2：工具描述

**调用链**：`prompt.ts:572-589` → `registry.tools({...model, agent, sessionID})` → `tool/registry.ts` → `describeSkill(agent, sessionID)` → `Skill.fmt(list, { verbose: false })`

```ts
// tool/registry.ts 修复前
const describeSkill = Effect.fn("ToolRegistry.describeSkill")(function* (agent: Agent.Info) {
  const list = yield* skill.available(agent)  // ← 没有 sessionID，返回全部技能
  ...
  Skill.fmt(list, { verbose: false })
})
```

修复后传入 `sessionID`，使用 `filterForSession` 过滤。

---

## filterForSession 完整流程

```
filterForSession(sessionID, skills)
│
├─ 第 1 步：读取 conversation 配置
│   ├─ session_skills: boolean
│   ├─ presets: [{ id, mode, skills, directory }]
│   └─ defaultDirectory: string
│   └─ 无 presets → 返回全部
│
├─ 第 2 步：获取当前 session（含 session.directory）
│   └─ 无 session → 返回全部
│
├─ 第 3 步：解析 mode（project / qa）
│   优先级：promptModeBySession → session.conversation.mode → inferConversationMode
│   inferConversationMode 逻辑：
│     a. presetID 参数 → 找到对应 preset 的 mode
│     b. 目录匹配唯一 → 返回该 preset 的 mode
│     c. defaultDirectory 匹配 → 返回 "qa"
│     d. 无匹配 → 返回 undefined
│   └─ mode 为 undefined → 跳过 第 4 步（不过滤 mode）
│
├─ 第 4 步：按 mode 过滤（filterSkillsByMode）
│   逻辑：收集所有 preset 的 id + skills 到 tied 集合
│   - 技能在 tied 中且匹配当前 mode → 保留
│   - 技能在 tied 中但不匹配当前 mode → 排除
│   - 技能不在 tied 中（未绑定任何 preset）→ 保留 ← 这里 skill-creator 漏进来
│   └─ 结果示例：mode=qa → [customize-opencode, data-query, ontology-kb, skill-creator]
│
├─ 第 5 步：session_skills 开关
│   └─ false → 返回第 4 步结果（mode 过滤但不做白名单）
│   └─ true → 继续
│
├─ 第 6 步：解析当前激活的 presetID（resolvePresetID）
│   优先级：
│     a. promptPresetIDBySession（UI 主动设置）
│     b. session.conversation.presetID
│     c. 目录匹配（session.directory === preset.directory）
│     d. mode 回退（找到第一个该 mode 的 preset）
│   └─ 全部失败 → presetID = undefined
│
├─ 第 7 步：获取白名单（allowedForPreset）
│   └─ 从 preset.skills 取出白名单
│   └─ presetID 为 undefined → allowed = undefined
│
├─ 第 8 步：fallback 保护（关键修复）
│   当 session_skills=true 但 allowed 为空时：
│   └─ 旧行为：返回全部技能 ← 错误
│   └─ 新行为：只保留 customize-opencode ← 正确
│
└─ 第 9 步：白名单过滤（filterSkills）
    逻辑：
    - 内置技能 customize-opencode → 保留
    - 项目本地技能（.opencode/skills/）→ 保留
    - 非全局配置技能 → 保留
    - 在白名单中的全局技能 → 保留
    - 不在白名单中的全局技能 → 排除
```

---

## 改造文件清单

### 1. session-skills-context.ts（核心过滤逻辑）

| 行 | 改动 |
|----|------|
| 第 8-14 行 | 新增 `Log` 同步日志导入，增加 `slog` 实例用于纯函数内日志 |
| 第 40-60 行 | `resolvePresetID` 增加逐步骤同步日志 |
| 第 63-83 行 | `resolveMode` 增加逐步骤同步日志 |
| 第 85-169 行 | `filterForSession` 增加全链路异步日志 |
| 第 160-168 行 | **关键修复**：`session_skills=true` 但 `allowed` 为 undefined 时，只保留 `customize-opencode` |

```ts
// 第 160-168 行：fallback 保护
if (!allowed && conversation.session_skills) {
  const builtinOnly = filtered.filter((s) => s.name === BUILTIN_SKILL)  // BUILTIN_SKILL = "customize-opencode"
  return builtinOnly
}
```

### 2. session-skills.ts（filterSkillsByMode + filterSkills 日志）

| 行 | 改动 |
|----|------|
| 第 3-4 行 | 新增 `Log` 导入，创建 `slog` 实例 |
| 第 104-128 行 | `filterSkillsByMode` 增加逐技能决策日志（`decisions` 数组），说明每个技能通过/排除的原因 |
| 第 130-145 行 | `filterSkills` 增加逐技能决策日志 |
| 第 140-141 行 | 修复 TypeScript 类型窄化问题（`input.allowed` 可能为 undefined） |

### 3. tool/registry.ts（工具描述入口修复）

| 行 | 改动 |
|----|------|
| 第 77 行 | Interface 中 `tools` 的输入增加 `sessionID?: SessionID` |
| 第 279-296 行 | `describeSkill` 增加 `sessionID` 参数，调用 `filterForSession` 过滤 |
| 第 346 行 | `describeSkill` 调用处增加 `input.sessionID`（原变量名从 `input` 改为 `model`）|

```ts
// 修复前：describeSkill 不过滤
const list = yield* skill.available(agent)

// 修复后：describeSkill 也经过 session 过滤
const available = yield* skill.available(agent)
const list = sessionID ? yield* SessionSkillsContext.filterForSession(sessionID, available) : available
```

### 4. prompt.ts（传入 sessionID）

| 行 | 改动 |
|----|------|
| 第 575 行 | `registry.tools()` 调用增加 `sessionID: input.session.id` |

### 5. conversation-presets.ts（App 端斜杠命令过滤）

| 行 | 改动 |
|----|------|
| 第 10 行 | `ConversationConfig` 类型增加 `session_skills?: boolean` |
| 第 156-173 行 | `slashSkillVisible` 增加 `session_skills` 检查分支：当 `session_skills=true` 且当前 mode 的 presets 有 skills 列表时，只允许列表内的技能 |

---

## 日志说明

新增的日志前缀 `service=session-skills-context` 和 `service=session-skills`，每条日志包含：

| 日志 | 内容 |
|------|------|
| `filterForSession start` | 入参：sessionID, skillNames |
| `filterForSession: config loaded` | conversation 配置：session_skills, presets, defaultDirectory |
| `filterForSession: session found` | session 信息：id, directory |
| `resolveMode: step1/2/3` | mode 解析每一步的输入和结果 |
| `filterSkillsByMode result` | mode, tied 集合, 逐 skill 决策, 输出列表 |
| `filterForSession: session_skills check` | session_skills 值, mode 过滤后结果 |
| `resolvePresetID: step1/2/3/4` | presetID 解析每一步的输入和结果 |
| `allowedForPreset` | 返回的白名单 |
| `filterSkills result` | 逐 skill 决策（含白名单匹配情况）|
| `filterForSession final result` | 最终输出技能列表 |

---

## 测试场景

### 场景 1：目录匹配 + session_skills=true

**配置**：session.directory = "E:/opencodeTest", preset.directory = "E:/opencodeTest"
**结果**：resolvePresetID 通过目录匹配 → presetID=data-query → allowed=["data-query"] → 最终只显示 customize-opencode + data-query

### 场景 2：目录不匹配 + session_skills=true

**配置**：session.directory = "D:/other", preset.directory = "E:/opencodeTest"
**结果**：resolvePresetID 所有步骤失败 → presetID=undefined → allowed=undefined → fallback 保护 → 只显示 customize-opencode

### 场景 3：session_skills=false

**结果**：只做 mode 过滤（filterSkillsByMode），不做白名单过滤。未绑定技能（如 skill-creator）会显示。

### 场景 4：无 presets

**结果**：第 1 步提前返回，显示全部技能。

---

## 遗留问题

- **App 端斜杠命令精确匹配**：当前 `slashSkillVisible` 按 mode 合并了所有同 mode preset 的 skills，无法精确到单个 preset。需要传当前目录或 presetID 到该函数才能解决。
- **`sys.skills()` 无 sessionID 时**：不执行 `filterForSession`，返回全部技能。这是初始系统提示词的生成路径。
