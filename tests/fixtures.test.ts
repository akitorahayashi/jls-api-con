// Contract test: every fixture conforms to its schema, and the contract rejects
// malformed shapes. Validates against the bundled dist/openapi.json (produced by
// `bun run bundle`, which `bun run check` runs first).
//
// Convention: each subdirectory of fixtures/ maps to exactly one component
// schema. An unmapped directory, a missing directory, or an empty directory is a
// failure — there is no silent skip.

import { beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AnySchemaObject, ValidateFunction } from 'ajv';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const root = join(import.meta.dir, '..');
const fixturesDir = join(root, 'fixtures');

// fixtures/<dir> -> components.schemas.<name>
const DIR_SCHEMA: Record<string, string> = {
  session: 'Session',
  'session-list': 'ListSessionsResponse',
  'create-session-request': 'CreateSessionRequest',
  'send-message-request': 'SendMessageRequest',
  source: 'Source',
  'source-list': 'ListSourcesResponse',
  activity: 'Activity',
  'activity-list': 'ListActivitiesResponse',
  error: 'Error',
};

const presentDirs = readdirSync(fixturesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

let ajv: Ajv2020;

beforeAll(() => {
  const bundledPath = join(root, 'dist', 'openapi.json');
  if (!existsSync(bundledPath)) {
    throw new Error('dist/openapi.json not found. Run `bun run bundle` first.');
  }
  const bundled = JSON.parse(
    readFileSync(bundledPath, 'utf8'),
  ) as AnySchemaObject;
  ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);
  ajv.addFormat('byte', true); // base64 payloads are not structurally validated
  ajv.addSchema(bundled, 'contract');
});

function validator(schemaName: string): ValidateFunction {
  const validate = ajv.getSchema(`contract#/components/schemas/${schemaName}`);
  if (!validate) {
    throw new Error(`schema ${schemaName} not found in bundled contract`);
  }
  return validate;
}

describe('fixture directory conventions', () => {
  test('every fixture directory maps to a schema', () => {
    const unmapped = presentDirs.filter((dir) => !DIR_SCHEMA[dir]);
    expect(unmapped).toEqual([]);
  });

  test('every schema mapping has a fixture directory', () => {
    const missing = Object.keys(DIR_SCHEMA).filter(
      (dir) => !presentDirs.includes(dir),
    );
    expect(missing).toEqual([]);
  });
});

for (const dir of presentDirs) {
  const schemaName = DIR_SCHEMA[dir];
  if (!schemaName) {
    continue; // reported by the mapping test above
  }
  const files = readdirSync(join(fixturesDir, dir)).filter((f) =>
    f.endsWith('.json'),
  );

  describe(`fixtures/${dir} (${schemaName})`, () => {
    test('has at least one fixture', () => {
      expect(files.length).toBeGreaterThan(0);
    });

    for (const file of files) {
      test(`${file} conforms`, () => {
        const validate = validator(schemaName);
        const data = JSON.parse(
          readFileSync(join(fixturesDir, dir, file), 'utf8'),
        );
        const ok = validate(data);
        if (!ok) {
          throw new Error(ajv.errorsText(validate.errors));
        }
        expect(ok).toBe(true);
      });
    }
  });
}

describe('contract rejects malformed shapes', () => {
  const githubRepo = {
    owner: 'o',
    repo: 'r',
    isPrivate: true,
    defaultBranch: { displayName: 'main' },
  };
  const cases: Array<[string, string, unknown]> = [
    ['Session without prompt', 'Session', { name: 'sessions/x' }],
    [
      'session output carrying both pullRequest and changeSet',
      'Session',
      {
        name: 'sessions/x',
        prompt: 'p',
        outputs: [
          {
            pullRequest: { url: 'u', title: 't', description: 'd' },
            changeSet: { gitPatch: { unidiffPatch: 'x' } },
          },
        ],
      },
    ],
    [
      'SourceContext without source',
      'SourceContext',
      { githubRepoContext: { startingBranch: 'main' } },
    ],
    [
      'Source with both nested and top-level repo',
      'Source',
      { name: 'sources/github/o/r', source: { githubRepo }, githubRepo },
    ],
    [
      'Activity with two events',
      'Activity',
      {
        name: 'sessions/s/activities/a',
        originator: 'agent',
        sessionCompleted: {},
        progressUpdated: { title: 't', description: 'd' },
      },
    ],
    ['whitespace-only prompt', 'Prompt', '   '],
    ['title over 255 characters', 'Title', 'a'.repeat(256)],
  ];

  for (const [name, schemaName, data] of cases) {
    test(`rejects ${name}`, () => {
      expect(validator(schemaName)(data)).toBe(false);
    });
  }
});
