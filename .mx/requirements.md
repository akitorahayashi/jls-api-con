# jls-api-con 要件

Jules API のワイヤ契約(型・列挙・バリデーション・メソッド面・エラー・前方互換規約)を単一の真実として保持し、`jls-api-rs`(Rust)と `jules-action`(TypeScript)を含む複数消費リポジトリがサブモジュールで pin して参照する契約リポジトリの要件を定義する。

## 目的

一つの Jules API を複数言語・複数リポジトリで実装する構成において、契約の乖離を実装リポジトリ側のコンパイル時とテスト時の双方で検出可能にする。型不足(消費側スキーマが API サーフェスの一部を欠く)と対応漏れ(repoless のような特定形状の未対応)の両方を、忘れようのない仕組みで防ぐ。

## 背景

現行の二消費リポジトリは同一 API を独立に写像しており、次の乖離が確認されている。契約リポジトリはこれらを一箇所に集約して解消する。

- `jules-action` は repoless セッションに非対応。`sessionSchema.sourceContext` が必須で、repoless(`sourceContext` 省略、または `githubRepoContext` 不在)がパース段階で落ちる。`jls-api-rs` は `source_context: Option` かつ repoless を独立 variant として保持する。
- `jules-action` の型不足: `id` を必須化、`PullRequest` の `baseRef`/`headRef` 欠落、`SessionOutput` の `changeSet` variant 欠落、`sourceSchema` が `GitHubRepo` 詳細(owner/repo/branches)を持たない、activities スキーマ全欠、AIP-193 エラー包絡未定義、`environmentVariablesEnabled` 未定義。
- サービスエンドポイントの不一致: 公式ドキュメントと `jules-action` は `https://jules.googleapis.com` + `/v1alpha`。`jls-api-rs` の `DEFAULT_BASE_URL` は `https://generativelanguage.googleapis.com/v1alpha`。契約が唯一の権威値を定める。

網羅性と正確性の基準実装は `jls-api-rs` とし、その `src/models`・`docs/jules_api`・`tests/fixtures` を契約化の起点とする。

## スコープ

対象:

- REST v1alpha のリソーススキーマ、列挙、バリデーション制約、メソッド面(パス・動詞・クエリ・既定値)、AIP-193 エラー包絡。
- 前方互換規約(未知の列挙値・未知 union variant・未知フィールドの許容)を消費者義務として明文化。
- 実ワイヤ形式の golden fixture と、ライブ互換の観測形状。

対象外:

- 各言語のクライアント実装、認証情報の保持、ネットワーク層。
- Jules サービス自体の挙動保証(公式ドキュメントの可用性・料金・上限に従う)。
- TOON 等の一時表現での永続化。正準形式は JSON/YAML とする。

## 設計方針

- contract-first: 機械可読仕様(OpenAPI 3.1)を単一の真実とし、消費側はここから型を生成、または生成型に対して手書き型を拘束する。
- variant は optional フィールドではなく直和型(`oneOf` + discriminator、または明示的な variant 定義)で表現する。repoless のような形状差を消費側が `?.` で握り潰せないようにし、コンパイル時に網羅性検査へ載せる。
- fixture は規約駆動で「参加が自動・離脱が明示」とする。消費側は fixture を全件 glob 検証し、契約側の fixture 追加が消費側テストを自動で落とす。
- 前方互換規約は仕様だけでは表現しきれないため、散文(`docs/semantics.md`)を権威とする。
- ファイル肥大化の回避: 仕様・fixture・散文をリソース単位に分割し、単一ファイルへの集中を作らない。
- LLM が主たる読者。読む順序と参照手順を `AGENTS.md` に集約し、意味論を `docs/semantics.md` に散文で集約する。
- silent fallback 禁止。CI の破壊検出・スキーマ検証・バンドルはいずれも失敗を明示する。

## リポジトリ構造

```
jls-api-con/
  README.md            # 人間向け: リポジトリの役割と消費手順
  AGENTS.md            # LLM向け: 読む順序・参照手順・不変条件
  CHANGELOG.md         # 契約バージョン履歴(破壊的/追加的の区別)
  spec/
    openapi.yaml       # ルート: info, servers, security, paths, 共有 parameters(pageSize/pageToken/filter)
    schemas/
      sessions.yaml    # Session, SourceContext(+context union), GitHubRepoContext,
                       #   SessionOutput(+union), PullRequest, ListSessionsResponse,
                       #   値型: Prompt, Title, StartingBranch, SessionName
      sources.yaml     # Source(+source union), GitHubRepo, GitHubBranch,
                       #   SourceName, ListSourcesResponse
      activities.yaml  # Activity(+event union), Plan, PlanStep, Artifact(+union),
                       #   ChangeSet(+changes union), GitPatch, Media, BashOutput,
                       #   ActivityName, ListActivitiesResponse
      errors.yaml      # AIP-193 エラー包絡
  fixtures/
    session/           # Session として検証
    session-list/      # ListSessionsResponse として検証
    source/            # Source として検証
    source-list/       # ListSourcesResponse として検証
    activity/          # Activity として検証
    activity-list/     # ListActivitiesResponse として検証
    error/             # AIP-193 Error として検証
  docs/
    semantics.md       # 状態遷移・union 規約・前方互換・ライブ互換の観測差
```

分割の規約:

- スキーマはリソース領域単位で 1 ファイル。列挙と値型は所有リソースに同居させ、他領域からは領域横断 `$ref` で参照する。`SourceName` は `sources.yaml` が所有し `sessions.yaml`/`activities.yaml` が参照、`ChangeSet`/`GitPatch` は `activities.yaml` が所有し `sessions.yaml` が参照する。
- タイムスタンプ(`format: date-time`)とバイト列(`format: byte`)はインライン指定とし、汎用共有ファイルを作らない。名称は責務を表さない `common`/`core`/`shared`/`utils` を避ける。
- fixture のディレクトリ名がスキーマ名に対応する。ファイルの追加はテストへの自動参加を意味し、ある形状を検証対象から外す唯一の方法は fixture を置かないことである。manifest ファイルは持たず、対応は命名規約で表す。

## 仕様(spec)要件

- OpenAPI 3.1 を採用する。3.1 のスキーマは JSON Schema 2020-12 上位互換であり、同一スキーマ節を codegen と fixture 検証の双方で使用できる。
- 複数ファイル構成を `$ref` で結合し、CI で単一 `dist/openapi.yaml` へバンドルする。外部参照を辿れない codegen ツールはバンドル成果物を入力とする。
- 表現すべき API サーフェス(基準実装 `jls-api-rs` に準拠):

メソッド面:

| メソッド | 動詞・パス | 既定 pageSize |
|---|---|---|
| sessions.create | POST /v1alpha/sessions | — |
| sessions.get | GET /v1alpha/{name=sessions/*} | — |
| sessions.list | GET /v1alpha/sessions | 30 |
| sessions.sendMessage | POST /v1alpha/{session=sessions/*}:sendMessage | — |
| sessions.approvePlan | POST /v1alpha/{session=sessions/*}:approvePlan | — |
| sources.get | GET /v1alpha/{name=sources/**} | — |
| sources.list | GET /v1alpha/sources | 30 |
| activities.get | GET /v1alpha/{name=sessions/*/activities/*} | — |
| activities.list | GET /v1alpha/{parent=sessions/*}/activities | 50 |

共有制約:

- `pageSize` は 1..100、100 超はサーバが 100 に丸める。0 は不正。
- `sources.list.filter` は AIP-160 式(現状 name によるフィルタのみ)。
- `approvePlan` はボディ無し。ライブ要求は `Content-Length: 0` を明示する。
- `sourceContext.source` パスは多セグメント(`sources/**`)でパーセントエンコードせず保持する。

直和型(union):

- `SourceContext.context`: `githubRepoContext` 存在 = repo-backed。`sourceContext` は存在するが context union のフィールドが不在 = repoless。`sourceContext` 自体の不在も許容(ライブ read 互換)。
- `SessionOutput`: `pullRequest` | `changeSet`。
- `Source.source`: `githubRepo`(ネスト形)。ライブ観測ではトップレベル `githubRepo`(`source` ラッパ省略)も許容。両形が同一 `GitHubRepo` を運ぶ。
- `Activity.activity`: `agentMessaged` | `userMessaged` | `planGenerated` | `planApproved` | `progressUpdated` | `sessionCompleted` | `sessionFailed`。
- `Artifact.content`: `changeSet` | `media` | `bashOutput`。
- `ChangeSet.changes`: `gitPatch`。

列挙(権威ソースとして単一箇所に定義し、消費側は動的生成する):

- `AutomationMode`: `AUTOMATION_MODE_UNSPECIFIED`, `AUTO_CREATE_PR`。
- `State`: `STATE_UNSPECIFIED`, `QUEUED`, `PLANNING`, `AWAITING_PLAN_APPROVAL`, `AWAITING_USER_FEEDBACK`, `IN_PROGRESS`, `PAUSED`, `FAILED`, `COMPLETED`。

値型のバリデーション制約:

- `prompt`: トリム後非空。必須。
- `title`: トリム後非空、255 文字以下。任意。
- `startingBranch`: 非空、空白文字を含まない。
- `SessionName`: `sessions/{id}` 単一セグメント(`id` に `/` 不可)。
- `SourceName`: `sources/` 前置、以降は多セグメント可、非空。
- `ActivityName`: `sessions/{sid}/activities/{aid}`、各セグメント非空。

入出力の別:

- `requirePlanApproval`, `automationMode` は入力専用。省略時はサーバ既定。
- `name`, `id`, `createTime`, `updateTime`, `state`, `url`, `outputs`, `artifacts` は出力専用。
- `environmentVariablesEnabled` はレスポンスに現れ、リクエスト構築では省略。

## fixtures 要件

- 各 fixture は API が実際に返す(または送る)ワイヤ形式そのままの JSON とする。消費側の serde/zod にそのまま投入できることが目的であり、TOON 等の中間表現では保存しない。
- 消費側は各ディレクトリ配下を全件 glob し、対応スキーマで strict デシリアライズする契約テストを 1 本ずつ持つ。個別ファイルをテストに列挙しない。
- 必須で用意する形状(基準実装のテストが依拠する形状を含む):
  - session: repo-backed、repoless、`changeSet` 出力を含む session、PR 出力に `baseRef`/`headRef` を含む session、`environmentVariablesEnabled` を含む session。
  - source: ネスト `source.githubRepo` 形、トップレベル `githubRepo` のライブ互換形。
  - activity: `planGenerated`、`progressUpdated`、`sessionCompleted`、`sessionFailed`、`changeSet` artifact、`bashOutput` artifact、`media` artifact。
  - list: 各リソースの list レスポンス(`nextPageToken` 有り・無しの双方)。
  - error: `NOT_FOUND`、`RESOURCE_EXHAUSTED`(429 quota)を含む AIP-193 包絡。
- repoless セッションの fixture は必須。これが存在することで、消費側の repoless 未対応は「テストを書き忘れた」ではなく「既存テストが落ちる」として現れる。

## 前方互換規約

スキーマだけでは表現できないため `docs/semantics.md` を権威とし、消費者義務として明記する。

- 未知の列挙値: 失敗させず生値を保持する(追加的な列挙拡張に耐える)。
- 未知の union variant: 失敗させず未知として保持する。
- 未知のオブジェクトフィールド: 無視して受理する(`additionalProperties: true`)。
- 上記により、API の追加的変更は消費側のデシリアライズを壊さない。破壊的変更のみが CI ゲートで検出対象となる。

## エラー契約

- AIP-193 包絡: `{ "error": { "code": number, "message": string, "status": string, "details": [] } }`。
- 非 JSON もしくは包絡不一致のボディは契約違反として区別する(消費側は API エラーと契約違反を別型で扱える情報を持つ)。
- `code: 429` かつ `status: RESOURCE_EXHAUSTED` 等を quota 超過として識別可能にする意味論を `docs/semantics.md` に記す。

## docs/semantics.md 要件

散文で次を集約する。

- セッション状態遷移と各 `State` の意味。
- union 各種の判別規則(特に repoless の「context union 不在で repoless」という判定)。
- ライブ互換の観測差(source のトップレベル `githubRepo`、`sourceContext` 不在、値型省略パターン)。
- 前方互換規約(消費者義務)。
- サービスエンドポイントとバージョン接頭辞の権威値。
- 意図的に契約へ含めない事項があればその理由(能力台帳は別ファイルにせず、ここに散文で記録する)。

## 消費側統合要件

- 両消費リポジトリはサブモジュールで契約を pin し、更新は PR(Renovate 等)で受ける。
- `jls-api-rs`: バンドル済み OpenAPI からワイヤ DTO を生成し、既存の手書き newtype(`Prompt`/`Title` 等)へ `TryFrom` 変換を張る。仕様変更は変換境界のコンパイルエラーとして局所化する。
- `jules-action`: OpenAPI から zod スキーマ/型を生成、または手書き zod を生成型へ `satisfies` で拘束する。
- 双方が fixture 全件 glob の契約テストを持つ。
- 検出経路は二重: 直和型と型生成でコンパイル時、fixture glob でテスト時。repoless 相当の欠落は両経路で捕捉される。

## CI / 破壊的変更検出(契約リポジトリ側)

- lint: spectral 等で OpenAPI を静的検査する。
- fixture 検証: 全 fixture を対応スキーマ(OpenAPI 3.1 = JSON Schema)で検証し、fixture と仕様の乖離を防ぐ。
- バンドル: 複数ファイル spec を単一成果物へ結合し、結合が通ることを検証する。
- 破壊検出: `oasdiff` 等で PR の破壊的変更を検出しゲートする。追加的変更は前方互換規約により通過させる。

## バージョニング

- 契約は semver で版管理する。破壊的変更は major、追加は minor。
- `CHANGELOG.md` で破壊的/追加的を区別して記録する。消費側は pin する版で影響範囲を判断する。

## 未解決事項

- サービスエンドポイントの権威値確定。公式ドキュメントに従い `https://jules.googleapis.com` + `/v1alpha` を採るのが妥当。`jls-api-rs` の `generativelanguage.googleapis.com/v1alpha` 既定は要検証(パス構築が `/v1alpha` を再付加する可能性を含む)。
- `list` の既定 pageSize が sessions/sources=30、activities=50 と異なる点を契約定数として確定する。
- `originator` を自由文字列のまま保つか、`user`/`agent`/`system` を列挙化するか。基準実装は自由文字列。
