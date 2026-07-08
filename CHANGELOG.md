# Changelog

Contract versioning follows semver: breaking changes are major, additive
changes are minor. Entries distinguish breaking from additive changes so that
consumers can judge the impact of a pinned version.

## 0.1.0

Initial contract for the Jules API REST v1alpha.

- Resources: `Session`, `Source`, `Activity`, and their list responses.
- Requests: `CreateSessionRequest`, `SendMessageRequest`.
- Methods: sessions create/get/list/sendMessage/approvePlan, sources get/list,
  activities get/list.
- Unions: session source context (repo-backed / repo-less), session output
  (pull request / change set), source payload (nested / top-level), activity
  event (seven variants), artifact (change set / media / bash output).
- Enums: `State`, `AutomationMode`.
- AIP-193 error envelope.
- Fixtures for every schema, including repo-less sessions and observed
  live-compatibility shapes.
