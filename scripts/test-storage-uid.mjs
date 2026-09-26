import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../src/lib/storage.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.CommonJS,
  },
});

const module = { exports: {} };
const context = vm.createContext({
  module,
  exports: module.exports,
  require: () => ({}),
  crypto: {},
  Math,
  Date,
  console,
  localStorage: {
    getItem: () => JSON.stringify([{ id: 'id-1790416290385-7q2enzck', messages: [] }]),
    setItem: () => {},
    removeItem: () => {},
  },
});
vm.runInContext(outputText, context, { filename: 'storage.ts' });

const id = module.exports.uid();
assert.match(
  id,
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  `uid() must return a UUID v4 when crypto.randomUUID is unavailable; received ${id}`,
);

console.log(`storage uid fallback passed: ${id}`);

const migrated = module.exports.loadConversations('guest');
assert.match(
  migrated[0].id,
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  `loadConversations() must migrate persisted legacy ids; received ${migrated[0].id}`,
);

console.log(`legacy conversation id migration passed: ${migrated[0].id}`);
