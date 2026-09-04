---
name: API Automation Factory
last_updated: 2026-09-04
---

# API Automation Factory Strategy

## Target problem

SDETs already cover UIs with Playwright, but the same APIs are now MCP tool surfaces consumed by agents. Contract breaks fail silently for agents rather than a human in a browser, and manual or UI-driven coverage cannot keep pace with the full MCP surface across the ecosystem.

## Our approach

Win by compiling MCP definitions plus Spring Boot contracts into deterministic Playwright + Zod suites (HTTP and live MCP), and by keeping OpenAI assist strictly at the margins—auth wiring and unmapped leftovers—never as free-form suite authorship. Deliver every change as a propose-only, human-reviewed PR.

## Who it's for

**Primary:** SDET / QA automation owner — They're hiring API Automation Factory to propose reviewable HTTP + MCP contract suites that CI can gate, without owning free-form AI-authored tests.

**Secondary:** API / MCP service owner — They supply Spring and MCP sources and respond to drift findings in propose PRs.

## Key metrics

- **Dual-lane coverage** - Share of in-scope MCP tools that have both a live MCP invocation test and a mapped HTTP Zod test in the merged suite (factory coverage report / inventory).
- **Propose reviewability** - Median files and tools touched per propose PR; must stay within a bounded service unit (PR metadata).
- **Contract-break catch rate** - Share of intentional contract-breaking changes that fail CI on merged suites without requiring a UI journey (CI + fixture experiments).
- **Compile-path autonomy** - Share of emitted tests produced by the compiler with zero LLM authorship (factory run telemetry).
- **Drift transparency** - Share of propose PRs that explicitly list uncovered tools/endpoints and MCP↔Spring drift when present (PR checklist / report artifact).

## Tracks

### Inventory compiler

Merge MCP tool/server definitions (coverage authority) with Spring Boot contracts (request/response enrichment) into a stable coverage inventory, with an MCP coverage floor when Spring detail is missing or conflicting.

_Why it serves the approach:_ Compile-first only works if the inventory is the single source of truth for what must be covered.

### Dual-lane emit

Emit deterministic Playwright suites with Zod validation for both HTTP endpoints and live MCP tool calls, packaged for CI after human merge.

_Why it serves the approach:_ Success requires both lanes; agents call MCP while HTTP contracts live in Spring.

### Propose-only trust pipeline

Open bounded propose PRs (per service or equivalent), never auto-merge; attach uncovered lists and drift findings so review quality owns generated tests.

_Why it serves the approach:_ Trust in generated suites comes from human review gates, not from LLM confidence.

### Margin LLM assist (Agents SDK)

Use OpenAI Agents SDK patterns only for auth-profile wiring hints, MCP↔HTTP mapping proposals on leftovers, and PR narrative for drift—always gated by inventory checks and human propose review.

_Why it serves the approach:_ Keeps LLM help without letting free-form generation become the emit path.

## Not working on

- Free-form LLM or sandbox-agent authorship of the primary test suites
- UI / browser Playwright generation or agent-behavior / LLM evals
- Auto-merge of generated suites, or treating inventory as a secondary product to “LLM walks the repos”
- Cross-service orchestration scenarios beyond per-capability HTTP/MCP contracts (deferred)

## Marketing

**One-liner:** Compile MCP + Spring contracts into deterministic Playwright/Zod suites that agents can trust—proposed only via human-reviewed PRs.

**Key message:** Coverage scale comes from the compiler; trust comes from propose-only review; OpenAI assists at the edges, not as the author of the suite.
