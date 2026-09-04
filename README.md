# api-automation-factory

Compile-first factory that turns **MCP tool surfaces** plus **OpenAPI (Spring Boot) contracts** into deterministic **Playwright** suites (HTTP + live MCP) with **Zod** validation. Suites are delivered only as **propose-only** draft PRs for human review — the factory never auto-merges.

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

## Layout

- `contracts/<service>/` — OpenAPI + MCP defs + service manifest
- `support/` — auth profiles, mappings, exclusions/allowlists, fixtures, egress allowlist
- `generated/<service>/{http,mcp,schemas}/` — overwrite-owned emitted suites
- `src/` — factory CLI, ingest, inventory, emit, propose
- `fixtures/demo-service/` — local dual-lane proof target
- `tests/unit/` + `tests/golden/` — factory unit and emit golden suites

## CI expectations

| Workflow | Purpose |
|----------|---------|
| `factory-ci.yml` | `typecheck` + Vitest unit/golden |
| `suites.yml` | Propose dry-run + Playwright `demo-http` / `demo-mcp` against fixture; auth-class gate with unset `DEMO_API_TOKEN` |
| `factory-propose.yml` | Operator `workflow_dispatch` propose; draft PR step gated until GitHub App creds exist; **never auto-merges** |

Playwright projects are auto-discovered from `generated/<service>/{http,mcp}` — the propose bot must not edit workflow project lists.

## Demo flow

```bash
# compile suites (dry-run propose)
npm run factory -- propose --service demo --dry-run

# start fixture + run dual-lane Playwright projects
node fixtures/demo-service/server.mjs &
DEMO_API_TOKEN=demo-token npm run test:e2e
```

Demo R6: `getOrderById` is dual-lane mapped; `listRecentOrders` is MCP-floor propose coverage and **rollout-excluded** (`support/exclusions/demo.yaml`) as the KD7 MCP-only proof tool.

See `docs/plans/2026-09-04-001-feat-api-automation-factory-plan.md` for the full product and planning contract.
