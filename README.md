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
npm run factory -- propose --service demo
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

## Layout (target)

- `contracts/<service>/` — OpenAPI + MCP defs + service manifest
- `support/` — auth profiles, mappings, exclusions/allowlists, fixtures
- `generated/<service>/{http,mcp,schemas}/` — overwrite-owned emitted suites
- `src/` — factory CLI, ingest, inventory, emit, propose
- `fixtures/demo-service/` — local dual-lane proof target

## Demo flow

```bash
# compile suites (dry-run propose)
npm run factory -- propose --service demo --dry-run

# start fixture + run dual-lane Playwright projects
node fixtures/demo-service/server.mjs &
DEMO_API_TOKEN=demo-token npm run test:e2e
```

See `docs/plans/2026-09-04-001-feat-api-automation-factory-plan.md` for the full product and planning contract.
