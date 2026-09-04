# OpenAI Agents SDK Patterns for API Automation Factory

Research of [openai/openai-agents-js](https://github.com/openai/openai-agents-js) (SDK + `examples/`), mapped to the API Automation Factory product contract in `docs/plans/2026-09-04-001-feat-api-automation-factory-plan.md` and `STRATEGY.md`.

**Verdict:** Adopt the SDK’s *orchestration, schema, MCP inventory, HITL, and guardrail* patterns for the factory’s **margin LLM assist** and **MCP discovery** layers. Do **not** adopt free-form multi-agent suite authorship or SandboxAgent codegen as the primary emit path—that contradicts KD1 / R8 (compile-first).

---

## 1. What the SDK is good at (for us)

Core concepts from the SDK README that matter here:

| SDK concept | Factory relevance |
|---|---|
| Agents + tools + Zod `outputType` | Structured margin proposals (auth profiles, mapping leftovers) |
| MCP servers / `getAllMcpTools` | Ingest MCP tool surfaces + schemas for inventory |
| Deterministic code-owned pipelines | Factory stages: ingest → merge → emit → propose |
| Human-in-the-loop / `needsApproval` | Propose-only trust analogue (no silent side effects) |
| Guardrails | Reject LLM suggestions outside inventory |
| Agents-as-tools + Manager class | Specialized margin agents under a code orchestrator |
| Tracing (`withTrace`) | Factory run observability |
| `RunContext` | Per-service auth profile context |

Out of scope for primary emit: Realtime voice agents, hosted multi-agent “walk the repo and write tests,” unconstrained SandboxAgent coding loops.

---

## 2. Patterns to implement (ranked)

### P1 — Code-owned deterministic pipeline (primary architecture)

**SDK examples:** `examples/agent-patterns/deterministic.ts`, `examples/research-bot/manager.ts`, `examples/financial-research-agent/manager.ts`

**Pattern:** A TypeScript `Manager` (not the LLM) owns stage order. Each stage has explicit inputs/outputs. Gates abort or divert when quality checks fail. Agents are step workers, not the control plane.

**Factory mapping:**

```text
Operator trigger
  → Ingest MCP defs (P2)
  → Ingest Spring contracts
  → Merge inventory + drift report (KD7)
  → Compile HTTP + MCP Playwright/Zod suites (deterministic emit)
  → [optional] Margin agents for auth / leftovers (P4–P6)
  → Open bounded propose PR (P3)
  → Human merge → CI gate
```

**Do:** Put orchestration in factory code (`FactoryRunManager`), Zod-parse every stage boundary, fail closed when inventory is empty.

**Don’t:** Let a single agent decide whether to skip MCP tools or invent endpoints.

---

### P2 — MCP inventory via connect + list tools (not via chat)

**SDK examples:** `examples/mcp/get-all-mcp-tools-example.ts`, `mcp-servers-example.ts`, `streamable-http-example.ts`, `tool-filter-example.ts`, `filesystem-example.ts`

**Pattern:**

- Connect with `MCPServerStdio` / `MCPServerStreamableHttp` / `connectMcpServers({ connectInParallel: true })`.
- Prefer `getAllMcpTools({ mcpServers, convertSchemasToStrict: true })` to materialize the tool surface.
- Use `createMCPToolStaticFilter({ allowed, blocked })` for scoped discovery.
- Always `close()` / async-dispose servers in `finally`.

**Factory mapping:**

- MCP definitions are the **authoritative coverage inventory** (R2).
- Store tool name, description, JSON schema → Zod (or compile to Zod later).
- Parallel connect across services for ecosystem scale (R10 bounding still applies at PR time).
- Tool filters = per-service exclusions maintained by SDETs.

**Live MCP test lane:** Generated Playwright (or Node) tests should invoke MCP tools against real servers the same way these examples connect—deterministic call + Zod parse of results—not by asking an agent to “try the tools.”

---

### P3 — Human gate before irreversible side effects (propose-only)

**SDK examples:** `examples/agent-patterns/human-in-the-loop.ts`, `examples/mcp/hosted-mcp-human-in-the-loop.ts`

**Pattern:** `needsApproval` / `requireApproval` interrupts the run; persist `RunState`, approve/reject, resume. Never auto-complete side effects.

**Factory mapping:**

- Factory analogue of approval is **opening a propose-only PR** (R7), not merging.
- Persist run artifacts (inventory, emit diff, drift list) like `result.json` state persistence in the HITL example.
- Optional: if margin agents propose auth secret *names* or mapping tables, require explicit approval items before those hints land in the PR body/files.

**Do not** wire `AUTO_APPROVE_HITL`-style bypasses into production factory paths.

---

### P4 — Zod / Standard Schema at every LLM boundary

**SDK examples:** `examples/standard-schema/*`, `examples/docs/agents/agentWithZodOutputType.ts`, research-bot / financial `outputType` schemas

**Pattern:** Tools take Zod parameters; agents declare `outputType: z.object(...)`. Parse `finalOutput` with Zod before the next stage consumes it.

**Factory mapping:**

- Generated suites: Zod-validate HTTP responses and MCP tool results (R4, R5).
- Margin agents: structured outputs only, e.g. `AuthProfileHint`, `MappingProposal`, `DriftNarrative`—never free-form “here is a test file.”
- Prefer Standard Schema boundary if both Zod and other schema libs appear in Spring→schema conversion.

---

### P5 — Forced tool use for margin agents

**SDK examples:** `examples/agent-patterns/forcing-tool-use.ts`, research-bot search agent (`toolChoice: 'required'`)

**Pattern:** `modelSettings: { toolChoice: 'required' }` and/or `toolUseBehavior: 'stop_on_first_tool'` so the model cannot skip tools or invent answers.

**Factory mapping:**

- Auth-wiring agent must call inventory/auth-config tools before proposing a profile.
- Leftover-mapping agent must read MCP tool schema + Spring OpenAPI/controller snippets via tools; cannot invent paths.
- Use `stop_on_first_tool` when the tool result *is* the proposal payload.

---

### P6 — Guardrails: inventory is the allow-list

**SDK examples:** `examples/agent-patterns/output-guardrails.ts`, `examples/basic/tools.ts` (tool input/output guardrails)

**Pattern:** Tripwires reject outputs that violate policy; tool guardrails can `rejectContent` before execute.

**Factory mapping:**

- Output guardrail: every proposed endpoint/tool name must exist in the merged inventory.
- Tool input guardrail: refuse file writes outside the emit workspace / refuse inventing new test IDs that collide.
- Treat guardrail trip as “list in uncovered/drift section,” not silent drop (aligns with KD7 / R11).

---

### P7 — Specialized agents-as-tools under a manager (margins only)

**SDK examples:** `examples/agent-patterns/agents-as-tools.ts`, `examples/financial-research-agent/manager.ts` (writer + fundamentals/risk as tools), `examples/customer-service/index.ts` (handoffs + `RunContext`)

**Pattern:** Orchestrator agent or code manager delegates to narrow specialists via `.asTool()` or handoffs. Shared typed `RunContext` carries session state (e.g. auth).

**Factory mapping:**

| Specialist | Job | When |
|---|---|---|
| `AuthProfileAgent` | Suggest per-service auth profile shape from existing configs / env names | Auth incomplete |
| `MappingLeftoverAgent` | Propose MCP↔HTTP maps for unmapped tools | After compile gaps |
| `DriftNarratorAgent` | Turn structured drift JSON into PR-readable summary | Always optional |
| *(none)* | Author Playwright tests | Never (compiler owns emit) |

Use `RunContext<{ serviceId, authProfile, inventoryRef }>` mirroring customer-service context.

---

### P8 — Verifier / judge loop for LLM suggestions

**SDK examples:** `examples/financial-research-agent` verifier + revise loop, `examples/agent-patterns/llm-as-a-judge.ts`

**Pattern:** Produce → verify against ground truth → revise with bounded retries → fail if still unverified.

**Factory mapping:**

- Ground truth = merged inventory + Spring schemas.
- Verifier agent (or pure function) checks mapping proposals cite real tool names and paths.
- Max 1–2 revisions; on failure, put leftovers in the PR uncovered list instead of emitting bad tests.

---

### P9 — Parallelism at inventory and service boundaries

**SDK examples:** `examples/agent-patterns/parallelization.ts`, financial `performSearches`, `connectMcpServers({ connectInParallel: true })`

**Pattern:** Fan-out independent work with `Promise.all`; synthesize afterward in code.

**Factory mapping:** Parallel MCP connects, parallel Spring parses per module, parallel suite emit per tool *within* a service—then one bounded propose PR per service (R10).

---

### P10 — Tracing every factory run

**SDK examples:** nearly all examples wrap with `withTrace(...)`; research-bot prints `trace_id`.

**Pattern:** One trace per factory run; custom spans per stage (ingest, merge, emit, margin assist, PR).

**Factory mapping:** Operators debug “why was tool X uncovered?” via spans + structured logs, not by re-reading free-form agent chat.

---

## 3. Patterns to constrain or reject

| SDK pattern | Why reject / constrain |
|---|---|
| SandboxAgent coding loops (`examples/sandbox/coding-task.ts`) as primary emit | Conflicts with KD1: suites must compile from contracts |
| Free-form “write me Playwright tests” agent | Violates R1 / R8 |
| Hosted MCP agent chat as the coverage mechanism | Coverage must be deterministic tests in CI (F3), not an agent session |
| Auto-approve HITL | Violates propose-only trust (R7) |
| Routing/handoff chatbots as the product UX | Operator interface is CLI/CI + PR review, not a triage chatbot |
| Realtime / voice | Irrelevant to contract testing |

Sandbox may be revisited later only as an isolated sandbox for *inspecting* a Spring repo during leftover mapping—with path grants and no authority to become the suite author.

---

## 4. Recommended factory architecture (Agents SDK slots)

```text
┌─────────────────────────────────────────────────────────────┐
│ FactoryRunManager (code) — P1 deterministic control plane   │
│  withTrace(factory-run)                                     │
├──────────────┬──────────────────────┬───────────────────────┤
│ MCP Ingest   │ Spring Ingest        │ Inventory Merge       │
│ getAllMcpTools│ OpenAPI/controllers │ MCP floor + drift     │
│ filters P2   │                      │ KD7 / R11             │
├──────────────┴──────────────────────┴───────────────────────┤
│ Deterministic Emitter                                       │
│  → Playwright HTTP + Zod                                    │
│  → Playwright/Node live MCP + Zod                           │
├─────────────────────────────────────────────────────────────┤
│ Margin Assist (optional, @openai/agents)                    │
│  AuthProfileAgent | MappingLeftoverAgent | DriftNarrator    │
│  Zod outputType · toolChoice required · inventory guardrails│
│  Verifier loop P8                                           │
├─────────────────────────────────────────────────────────────┤
│ Propose-only PR publisher (human gate P3)                   │
│  bounded unit · uncovered list · drift findings             │
└─────────────────────────────────────────────────────────────┘
         merge by human → CI runs deterministic suites
```

**Package posture:** Depend on `@openai/agents` + `zod` for margin assist and MCP client usage. Keep the compiler/emitter free of LLM calls so the compile path works when contracts are present (Success Criteria).

---

## 5. Example → requirement crosswalk

| Requirement / decision | Best SDK example(s) | Implement as |
|---|---|---|
| R1 compile-from-contracts | `deterministic.ts`, research-bot `manager.ts` | Code pipeline; agents not in emit |
| R2 MCP authoritative inventory | `get-all-mcp-tools-example.ts` | Inventory builder |
| R4 live MCP tests | `streamable-http-example.ts`, stdio filesystem | Test runtime connectors |
| R5 HTTP Zod tests | `standard-schema`, Zod `outputType` examples | Emit Zod from Spring DTOs |
| R7 propose-only | `human-in-the-loop.ts` | PR gate + optional approvals |
| R8 LLM at margins | financial manager + verifier; forcing-tool-use | Margin agents only |
| R9 per-service auth | customer-service `RunContext` | Typed auth context + profiles |
| R10 bounded PRs | parallelization + manager stages | Per-service run + PR |
| R11 / KD7 partial propose | output-guardrails + uncovered lists | Gate + report, don’t drop MCP tools |
| F3 CI gate | N/A (Playwright CI) | Merged suites only; no agents in CI |

---

## 6. Implementation guidance (first slices)

1. **Inventory MVP** — MCP connect + `getAllMcpTools` + strict schema capture; no LLM.
2. **Emit MVP** — Template-compile Playwright HTTP + MCP tests from inventory; Zod from JSON Schema where possible.
3. **Propose PR** — Bounded diff + uncovered/drift markdown; no auto-merge.
4. **Margin assist v1** — One `MappingLeftoverAgent` with Zod `outputType`, `toolChoice: 'required'`, inventory guardrail, verifier function.
5. **Auth profiles** — Config-first; Agents SDK only to *suggest* profile shape into the propose PR for human edit.

---

## 7. Sources reviewed

- Repo: https://github.com/openai/openai-agents-js (clone snapshot used for this research)
- Packages: `agents`, `agents-core`, `agents-openai`, `agents-extensions`, `agents-realtime`
- Example dirs: `agent-patterns`, `mcp`, `standard-schema`, `tools`, `research-bot`, `financial-research-agent`, `customer-service`, `sandbox`, `docs/*`, `basic`
- Product authority: `docs/plans/2026-09-04-001-feat-api-automation-factory-plan.md`, `STRATEGY.md`
