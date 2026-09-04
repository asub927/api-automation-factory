# Experiment targets: how input works + candidate APIs

Grounded in `STRATEGY.md` and the product plan. Answers: what the factory ingests, where an agent may explore a codebase, and which public APIs are good for proving the concept.

---

## How input works

The factory does **not** take “go explore this repo and invent tests” as its primary input. Primary inputs are **structured contracts**:

```text
Operator (CLI / CI)
  │
  ├─► MCP server config(s)     → connect → list tools + JSON schemas
  │     (stdio / streamable HTTP / hosted)
  │
  ├─► HTTP contract source(s)  → OpenAPI / Spring controllers+DTOs / springdoc
  │
  └─► Auth profile(s)          → per-service OAuth / API key / basic / etc.
        │
        ▼
  Merged coverage inventory (MCP authoritative; Spring enriches Zod)
        │
        ▼
  Deterministic emit → Playwright HTTP + live MCP tests (Zod)
        │
        ▼
  Propose-only PR (human merge) → CI runs merged suites
```

| Input | Role | Example |
|---|---|---|
| MCP definitions | Coverage authority — every in-scope tool must get a live MCP test | `MCPServerStreamableHttp` URL, or stdio command |
| Spring / OpenAPI | Request/response enrichment for Zod; maps tools → HTTP | `/v3/api-docs`, OpenAPI YAML, controller+DTO scan |
| Auth profiles | How generated tests authenticate | env-backed API key / bearer / basic |
| Exclusions / bounds | Keep PRs reviewable | allow/block tool filters, per-service unit |

**Where “agent explores the codebase” fits:** only as **margin assist** when contracts are incomplete — e.g. unmapped MCP↔HTTP leftovers, auth-profile wiring hints, drift narrative. The agent may read Spring controllers to *propose* a mapping; it does **not** author the suite. The compiler still emits tests from inventory.

If you want a Spike where an agent walks a repo and drafts tests, treat that as a **contrast experiment** against the compile path — not the product default.

---

## Best way to prove dual-lane (MCP + HTTP) without a Spring mono-repo

Many popular REST APIs have **no** native MCP server. For concept tests, wrap their OpenAPI with an OpenAPI→MCP bridge so each HTTP operation becomes an MCP tool:

- [criteo/openapi-to-mcp](https://github.com/criteo/openapi-to-mcp)
- [mcp-openapi](https://github.com/Docat0209/mcp-openapi) (`npx mcp-openapi --spec <url>`)

That gives the factory both lanes from one public API: compile HTTP tests from the OpenAPI, and live MCP tests against the bridged tools.

---

## Recommended experiment ladder

Probed for reachability on 2026-09-04 from this environment.

### Tier A — HTTP smoke (start here, minutes)

No auth, small surface, easy Zod. Use to validate emit + Playwright API testing before MCP.

| API | Base URL | Contract | Auth | Why |
|---|---|---|---|---|
| **JSONPlaceholder** | `https://jsonplaceholder.typicode.com` | Community OpenAPI ([posts spec](https://raw.githubusercontent.com/api-evangelist/jsonplaceholder/refs/heads/main/openapi/jsonplaceholder-posts-api-openapi.yml)); live `GET /posts/1` → 200 | None | Classic CRUD fake API; wrap with openapi-to-mcp for dual-lane |
| **httpbin** | `https://httpbin.org` | Informal; `/get`, `/post`, `/status/{code}` | None | Status codes, headers, echo — great for negative/Zod edge cases |
| **ReqRes** | `https://reqres.in` | Docs site; live `GET /api/users/2` → 200 | None (demo token optional) | Tiny user CRUD; quick CI smoke |
| **DummyJSON** | `https://dummyjson.com` | Site docs; live `GET /products/1` → 200 | None | Products/users/carts — slightly richer payloads |

### Tier B — Auth profiles (proves R9)

| API | Base URL | Contract | Auth | Why |
|---|---|---|---|---|
| **Restful Booker** | `https://restful-booker.herokuapp.com` | [API docs](https://restful-booker.herokuapp.com/apidoc/index.html); live `GET /booking` → 200 | Token via `POST /auth` | Industry-standard API-testing sandbox; auth + CRUD booking |

### Tier C — OpenAPI-rich compile target (proves inventory → Zod emit)

| API | Spec URL | Live API | Notes |
|---|---|---|---|
| **Swagger Petstore v2** | `https://petstore.swagger.io/v2/swagger.json` (200, ~14KB) | `https://petstore.swagger.io/v2` | Canonical OpenAPI teaching API; good compile input |
| **Swagger Petstore v3** | `https://petstore3.swagger.io/api/v3/openapi.json` (200, ~17KB) | Host flaky (`findByStatus` returned 500 in probe) | Prefer for OpenAPI 3 shape; don’t rely on live host stability |
| **PokéAPI** | [openapi.yml](https://raw.githubusercontent.com/PokeAPI/pokeapi/refs/heads/master/openapi.yml) | `https://pokeapi.co/api/v2` (ditto → 200) | Large, read-only, no auth; stress-tests inventory scale / PR bounding |

### Tier D — Dual-lane MCP + HTTP (proves R4–R6)

| Target | HTTP | MCP | Why |
|---|---|---|---|
| **Petstore or JSONPlaceholder + openapi-to-mcp** | OpenAPI above | Bridge generates tools 1:1 from operations | Cleanest concept demo: same operation → HTTP Zod test + live MCP Zod test |
| **GitHub** | [REST API](https://api.github.com) + [official OpenAPI](https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json) | [github/github-mcp-server](https://github.com/github/github-mcp-server) (remote: `https://api.githubcopilot.com/mcp/`) | Real ecosystem surface; needs PAT; use **scoped toolsets** (`repos`, `issues`, …) so propose PRs stay bounded |
| **DeepWiki MCP** (Agents SDK example) | N/A as primary HTTP contract | `https://mcp.deepwiki.com/mcp` | Good for MCP-client plumbing only; not a dual-lane Spring/OpenAPI story |

### Tier E — Closest to production shape (Spring + MCP)

| Target | What you get |
|---|---|
| **springdoc-openapi demos** / Spring Petclinic + springdoc | Real Spring Boot `/v3/api-docs` + controllers/DTOs as compile input |
| Thin **MCP adapter** over that service (hand-written or openapi-to-mcp) | Dual inventory the way the product assumes |

Use Tier E once Tier D works; don’t block the concept spike on owning a Spring service.

---

## Suggested first spike (concrete)

1. **HTTP lane:** Compile 3–5 Playwright + Zod tests from JSONPlaceholder OpenAPI (`/posts` CRUD).
2. **MCP lane:** Run `openapi-to-mcp` (or `mcp-openapi`) against the same OpenAPI; generate live MCP invocation tests for the same operations.
3. **Auth lane (optional same week):** Restful Booker — one auth profile + booking CRUD.
4. **Scale/auth realism:** GitHub REST + official MCP server with `repos`+`issues` toolsets only; propose-only PR for that bounded unit.

Success for the spike: both lanes exist for the same capability, Zod fails on a deliberate schema break, and nothing auto-merges.

---

## What not to use for the first concept test

- Huge unscoped GitHub MCP toolsets (unreviewable PRs)
- Petstore3 live host as the only CI dependency (flaky in probe)
- Voice/realtime or unrelated MCP demos as coverage targets
- “Agent writes the whole Playwright suite from a repo walk” as the measured success path
