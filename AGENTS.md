# AGENTS

Contract repository for the Jules API. Structure defines wire shapes; meaning
lives in prose.

## Reading order

1. `docs/semantics.md` — behavior, unions, forward-compatibility obligations.
2. `spec/openapi.yaml` and `spec/schemas/*.yaml` — structure, methods, enums.
3. `fixtures/<schema>/*.json` — concrete wire shapes per schema.

Read large JSON through the `toon` CLI (`toon dist/openapi.json`) to reduce
tokens; do not convert stored files to TOON. JSON and YAML are the canonical
formats.

## Invariants

- The schema is closed on known enum values and known union variants. Runtime
  tolerance of unknown values is a consumer obligation stated in
  `docs/semantics.md`, not a schema feature.
- Unions are modeled as `oneOf` with exactly-one-variant semantics
  (`SessionOutput`, `Artifact`, `Activity` event, `Source` payload). Both-present
  and none-present are rejected.
- Repo-less sessions are a first-class shape: `sourceContext` absent, or present
  without `githubRepoContext`. Fixtures for it are required.
- Every object is open (`additionalProperties: true`) for forward compatibility.

## Adding a fixture

Place a real wire-shape JSON file under the directory whose name maps to its
schema (see `tests/fixtures.test.ts`). It auto-enrolls in
`bun test`. To cover a new schema, add the directory and its
mapping; an unmapped directory fails the check.

## Commands

```
bun run check              # biome + typecheck + bundle + bun test
bun run fix                # apply Biome formatting and safe fixes
bun run bundle             # regenerate dist/openapi.json from spec/
bun test                   # fixture conformance + rejection checks
```

`dist/openapi.json` is regenerated and staged automatically by the husky
pre-commit hook (`.husky/pre-commit`, installed on `bun install`), so it never
drifts from `spec/`. CI fails if it is stale.
