# jls-api-con

Single-source-of-truth wire contract for the Jules API REST v1alpha. Consumer
repositories (`jls-api-rs`, `jules-action`, and future clients) pin this
repository as a submodule and detect contract drift at their own compile time
and test time.

## Layout

```
spec/
  openapi.yaml         OpenAPI 3.1 root: servers, security, paths, parameters
  schemas/
    sessions.yaml      Session, SourceContext, SessionOutput, value types, enums
    sources.yaml       Source, GitHubRepo, SourceName
    activities.yaml    Activity, event union, artifacts, ChangeSet, GitPatch
    errors.yaml        AIP-193 error envelope
fixtures/              Real wire-shape JSON, one directory per schema
docs/semantics.md      Behavior the schema cannot express (authority for meaning)
dist/openapi.json      Bundled single-file contract (generated, committed)
tests/                 Fixture-conformance test (bun test)
```

OpenAPI 3.1 schemas are JSON Schema 2020-12, so the same schema nodes drive both
code generation in consumers and fixture validation here.

## How consumers use it

- Pin this repository as a submodule and take updates through pull requests.
- Generate types from `dist/openapi.json`, or constrain hand-written types
  against generated types, at the consumer's discretion. This repository does
  not host generators.
- Run a fixture test that globs every `fixtures/<schema>/` directory and
  decodes each file with the consumer's own deserializer. A fixture added here
  automatically enrolls in the consumer's test on the next submodule update, so
  a missing capability surfaces as a failing existing test rather than as a
  forgotten one.
- Honor the forward-compatibility obligations in `docs/semantics.md` (tolerate
  unknown enum values, unknown union variants, and unknown fields).

## Local checks

```
bun install
bun run check      # biome + typecheck + bundle + bun test
bun run fix        # apply Biome formatting and safe fixes
```

Individual steps: `bun run typecheck`, `bun run bundle`, `bun test`. Biome
(`biome.json`) formats and lints JSON and TypeScript; the YAML spec and
generated `dist/` are outside its scope.

`bun install` installs a husky pre-commit hook (`.husky/pre-commit`) that runs
`lint-staged` (Biome on staged files), regenerates `dist/openapi.json`, and
stages it. The committed bundle therefore never drifts from source; CI's
staleness check is the backstop.

## Fixtures

Each subdirectory of `fixtures/` maps to exactly one component schema
(`fixtures/session/` to `Session`, `fixtures/session-list/` to
`ListSessionsResponse`, and so on; the mapping lives in
`tests/fixtures.test.ts`). Every fixture must be a real wire shape and
must validate against its schema. Adding a directory without a mapping, an
empty directory, or a non-validating fixture fails the check.

## Continuous integration

CI runs `bun run check` (Biome, typecheck, bundle, fixture validation) and
confirms `dist/openapi.json` is regenerated from source.
