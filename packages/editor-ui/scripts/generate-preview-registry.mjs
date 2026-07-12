import { listNodeDefinitions } from '@visual-node/core';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.join(__dirname, '..', 'src', 'preview', 'node-registry.json');

const definitions = listNodeDefinitions();
const registry = {};

for (const def of definitions) {
  registry[def.type] = def;
}

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, JSON.stringify(registry, null, 2));
console.log(`✓ Generated node registry at ${outputPath}`);
