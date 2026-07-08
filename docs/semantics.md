# Jules API contract semantics

This document is the authority for contract behavior that the OpenAPI schema
cannot express by itself. The schema in `spec/` defines structure; this file
defines the obligations and interpretations that accompany it. Where the two
appear to disagree, the schema governs structure and this file governs meaning.

## Service

- Endpoint: `https://jules.googleapis.com`
- Version prefix: `/v1alpha` (carried in the `servers` URL)
- Authentication: API key in the `x-goog-api-key` request header
- URI style: gRPC transcoding (AIP-127). Custom methods use a trailing
  `:verb` suffix (`:sendMessage`, `:approvePlan`)
- Timestamps are RFC 3339 strings. Bytes fields are base64 strings.

## Forward compatibility

The schema enumerates known values and known variants. Consumers carry the
following runtime obligations, which the closed schema does not encode:

- Unknown enum values (for `State`, `AutomationMode`) are preserved, not
  rejected. Additive server-side enum growth must not break a consumer.
- Unknown union variants (a future `SessionOutput`, `Artifact`, or activity
  event) are preserved as an opaque value, not rejected.
- Unknown object fields are ignored. Every object is effectively open
  (`additionalProperties: true`).

Fixtures under `fixtures/` only contain known values and known variants; the
forward-compatibility obligations above are verified by consumer test suites,
not by fixture validation in this repository.

## Resource names

- Session name: `sessions/{session}`, a single segment after `sessions/`.
- Source name: `sources/{source}`, multi-segment (`sources/**`), for example
  `sources/github/owner/repo`. Slashes in the source segment are path segments,
  not percent-encoded.
- Activity name: `sessions/{session}/activities/{activity}`.

## Sessions

### State

`State` is output-only. Known values and their meaning:

- `STATE_UNSPECIFIED`: state not reported.
- `QUEUED`: accepted, not yet started.
- `PLANNING`: producing a plan.
- `AWAITING_PLAN_APPROVAL`: paused for human plan approval.
- `AWAITING_USER_FEEDBACK`: paused for human input.
- `IN_PROGRESS`: executing.
- `PAUSED`: suspended.
- `FAILED`: terminated without success.
- `COMPLETED`: terminated with success.

### Input-only and output-only fields

- Input-only (present in create requests, not meaningful to send back):
  `requirePlanApproval`, `automationMode`. When `automationMode` is omitted the
  server applies its default.
- Output-only: `name`, `id`, `createTime`, `updateTime`, `state`, `url`,
  `outputs`.
- `environmentVariablesEnabled` appears inside `sourceContext` on responses and
  is omitted when constructing a request.

The create request body is modeled as `CreateSessionRequest` rather than the
full `Session`, because a create request carries only input fields.

### Repo-backed and repo-less sessions

`sourceContext.context` is a flattened union. Repo-backed sessions carry
`githubRepoContext`. A repo-less session is indicated by:

- absence of `githubRepoContext` while `sourceContext` is present, or
- absence of `sourceContext` entirely (also observed on historical responses).

A repo-less create request omits `sourceContext`. This is the shape that a
naive required-`sourceContext` consumer model fails to accept; the
`fixtures/session/repoless-*.json` and
`fixtures/create-session-request/repoless.json` fixtures exist so that a
consumer without repo-less support fails its fixture validation rather than
silently dropping the case.

### Session outputs

`SessionOutput` is a flattened union with exactly one variant per item:

- `pullRequest`: a created pull request. `baseRef` and `headRef` appear on
  responses.
- `changeSet`: an emitted change set (see Activities). Appears alongside a
  `pullRequest` on repo-backed responses, on historical responses, and on
  repo-less output where no pull request is created.

An item carrying both variants, or neither, is rejected.

## Sources

`Source` carries its repository payload in one of two shapes:

- Documented shape: nested under `source.githubRepo`.
- Observed live shape: top-level `githubRepo`, with the `source` wrapper
  omitted.

Both shapes carry the same `GitHubRepo`. Exactly one shape is present; a
response carrying both is rejected. The live shape exists because current live
responses have been observed without the intermediate `source` wrapper.

## Activities

`Activity` carries common fields plus exactly one flattened event variant:
`agentMessaged`, `userMessaged`, `planGenerated`, `planApproved`,
`progressUpdated`, `sessionCompleted`, `sessionFailed`. An activity with two
known events, or none, is rejected by the schema; unknown future events are a
consumer forward-compatibility concern (see above).

`originator` is a free-form string (observed values: `user`, `agent`,
`system`) and is intentionally not enumerated.

`Artifact` is a flattened union with exactly one variant per item: `changeSet`,
`media`, `bashOutput`. `ChangeSet.changes` currently has the single `gitPatch`
variant; `ChangeSet.source` is optional and may be absent or carry an unusual
value such as `sources/github/` on repo-less output.

## Pagination

List operations accept `pageSize` (1..100; values above 100 are coerced to 100
by the server) and `pageToken`. The server default `pageSize` differs by
method:

- `sessions.list`: 30
- `sources.list`: 30
- `activities.list`: 50

`nextPageToken` is omitted by the server when no further pages exist.

## Errors

Non-2xx responses use the AIP-193 envelope: an `error` object with `code`,
`message`, and (when present) `status` and `details`. A non-JSON body or a body
that does not match this envelope is a contract violation and is distinct from a
structured API error.

Quota exhaustion is identified by `code` 429 together with `status`
`RESOURCE_EXHAUSTED` (or a message indicating a quota was exceeded).
