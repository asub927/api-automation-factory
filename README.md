# api-automation-factory

Compile-first factory that turns **MCP tool surfaces** plus **OpenAPI (Spring Boot) contracts** into deterministic **Playwright** suites (HTTP + live MCP) with **Zod** validation. Suites are delivered only as **propose-only** draft PRs for human review — the factory never auto-merges.

- Product strategy: [`STRATEGY.md`](./STRATEGY.md)
- Product plan: [`docs/plans/2026-09-04-001-feat-api-automation-factory-plan.md`](./docs/plans/2026-09-04-001-feat-api-automation-factory-plan.md)
- Agents SDK pattern research: [`docs/research/openai-agents-js-patterns-for-factory.md`](./docs/research/openai-agents-js-patterns-for-factory.md)
- Experiment APIs & inputs: [`docs/research/experiment-apis-and-inputs.md`](./docs/research/experiment-apis-and-inputs.md)

## Requirements

- Node.js **22.13+**
- npm (lockfile committed with this repo)

## Setup

```bash
npm install
npm run typecheck
npm test
```

## CLI

```bash
npx factory --help
npx factory propose --help
npx factory propose --service demo
```

Or via the npm script:

```bash
npm run factory -- --help
npm run factory -- propose --service demo --dry-run
```

LLM assistance is optional and **off by default**.

### Exit codes

| Code | Meaning |
|------|---------|
| 0 | OK |
| 2 | Unknown command |
| 64 | Usage |
| 78 | Setup |
| 79 | Auth |
| 80 | Transport |
| 81 | Contract |

## Service manifests

Each onboarded service has `contracts/<service>/service.manifest.yaml` naming:

- OpenAPI source (`lockfile` path or `fetch` URL) and MCP defs path
- `baseUrl` / `mcpEndpoint` (must match `support/egress-allowlist.yaml`)
- `authProfileId` → `support/profiles/<id>.yaml`
- Optional mapping / exclusion / mutation allowlist paths under `support/`

Demo example: `contracts/demo/service.manifest.yaml`.

## Auth profiles

Profiles live in `support/profiles/` and declare auth **type** plus secret **env var names only** (e.g. `DEMO_API_TOKEN`). Values are injected by CI or local `.env` — never committed in profiles or generated suites.

Missing required secrets fail with **auth** class (exit 79), not contract.

## Where suites land

**Production suites live in the mapped app workspace repo**, not in this factory repo:

```text
playwright/
  package.json                 # npm workspaces: ui, api
  playwright.config.ts         # discovers api/*/tests
  ui/                          # empty stub ok (factory never authors UI tests)
  api/
    support/                   # vendored overwrite-owned helpers
    <serviceId>/
      tests/*.{http,mcp}.spec.ts
      schemas/
```

`factory propose` scaffolds/validates that shape, emits suites + support kit, and opens a **draft** PR on `workspace.repo` with `playwright/**` path filters only.

This factory repo keeps **compiler + demo/fixture self-tests** under `generated/demo/` only.

## Layout

- `contracts/<service>/` — OpenAPI + MCP defs + service manifest (`workspace.repo` / `workspace.mode`)
- `support/` — auth profiles, mappings, exclusions/allowlists, fixtures, egress allowlist
- `generated/demo/` — factory self-test emit only (same relative `tests/` + `schemas/` layout)
- `fixtures/workspace-app/` — minimal app-workspace mirror for propose dry-run
- `fixtures/demo-service/` — local dual-lane proof HTTP/MCP target
- `src/` — factory CLI, ingest, inventory, emit, scaffold, propose
- `tests/unit/` + `tests/golden/` — factory unit and emit golden suites

## CI expectations

| Workflow | Purpose |
|----------|---------|
| `factory-ci.yml` | `typecheck` + Vitest unit/golden |
| `suites.yml` | Demo fixture propose dry-run + Playwright `demo-http` / `demo-mcp`; auth-class gate |
| `factory-propose.yml` | Operator `workflow_dispatch` propose into workspace dir; draft PR gated; **never auto-merges** |

Factory Playwright discovery is limited to the **demo** self-test service. JSONPlaceholder (and other samples) are contracts/docs only — not default suite CI in this repo.

## Demo flow

```bash
# scaffold + emit into fixture workspace (no GitHub)
npm run factory -- propose --service demo --workspace-dir fixtures/workspace-app --dry-run

# start fixture + run factory self-test dual-lane projects
node fixtures/demo-service/server.mjs &
DEMO_API_TOKEN=demo-token npm run test:e2e -- --project=demo-http --project=demo-mcp
```

Demo R6: `getOrderById` is dual-lane mapped; `listRecentOrders` is MCP-floor propose coverage and **rollout-excluded** (`support/exclusions/demo.yaml`) as the KD7 MCP-only proof tool.

## JSONPlaceholder sample (contracts only)

Contracts under `contracts/jsonplaceholder/` remain useful for emit unit tests and docs. They are **not** a production suite home in this repo and are excluded from default Playwright/CI discovery. To exercise them, point `workspace.repo` at an app workspace and run `factory propose` there.

See `docs/plans/2026-09-04-001-feat-api-automation-factory-plan.md` for the full product and planning contract.
