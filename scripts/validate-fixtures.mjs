// Validate every fixture against its schema in the bundled contract.
//
// Convention: each subdirectory of fixtures/ maps to exactly one component
// schema. The mapping is explicit below; an unmapped directory, a missing
// directory, an empty directory, or a fixture that fails validation is a hard
// error. There is no silent skip.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import AjvModule from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';

const Ajv = AjvModule.default ?? AjvModule;
const addFormats = addFormatsModule.default ?? addFormatsModule;

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const bundledPath = join(root, 'dist', 'openapi.json');

if (!existsSync(bundledPath)) {
  console.error('dist/openapi.json not found. Run `npm run bundle` first.');
  process.exit(1);
}

const bundled = JSON.parse(readFileSync(bundledPath, 'utf8'));

// fixtures/<dir> -> components.schemas.<name>
const DIR_SCHEMA = {
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

const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addFormat('byte', true); // base64 payloads are not structurally validated here
ajv.addSchema(bundled, 'contract');

const fixturesDir = join(root, 'fixtures');
const presentDirs = readdirSync(fixturesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

let failures = 0;
let checked = 0;

for (const dir of presentDirs) {
  const schemaName = DIR_SCHEMA[dir];
  if (!schemaName) {
    console.error(`fixtures/${dir}/ has no schema mapping. Add it to DIR_SCHEMA.`);
    failures += 1;
    continue;
  }

  const validate = ajv.getSchema(`contract#/components/schemas/${schemaName}`);
  if (!validate) {
    console.error(`Schema ${schemaName} not found in bundled contract (fixtures/${dir}/).`);
    failures += 1;
    continue;
  }

  const files = readdirSync(join(fixturesDir, dir)).filter((f) => f.endsWith('.json'));
  if (files.length === 0) {
    console.error(`fixtures/${dir}/ contains no .json fixtures.`);
    failures += 1;
    continue;
  }

  for (const file of files) {
    checked += 1;
    const rel = `fixtures/${dir}/${file}`;
    let data;
    try {
      data = JSON.parse(readFileSync(join(fixturesDir, dir, file), 'utf8'));
    } catch (err) {
      console.error(`FAIL ${rel}: invalid JSON — ${err.message}`);
      failures += 1;
      continue;
    }
    if (validate(data)) {
      console.log(`ok   ${rel} -> ${schemaName}`);
    } else {
      failures += 1;
      console.error(`FAIL ${rel} (schema ${schemaName}):`);
      for (const e of validate.errors) {
        console.error(`       ${e.instancePath || '/'} ${e.message}`);
      }
    }
  }
}

// Every declared mapping must have a directory present.
for (const [dir, schemaName] of Object.entries(DIR_SCHEMA)) {
  if (!presentDirs.includes(dir)) {
    console.error(`Missing fixtures directory for mapping ${dir} -> ${schemaName}.`);
    failures += 1;
  }
}

console.log(`\n${checked} fixtures checked, ${failures} failure(s).`);
process.exit(failures > 0 ? 1 : 0);
