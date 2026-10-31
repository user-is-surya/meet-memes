// Bumps the version in extension/manifest.json and package.json.
// Usage: npm run bump -- patch|minor|major|1.2.3
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = [join(root, 'extension', 'manifest.json'), join(root, 'package.json')];

const arg = process.argv[2] || 'patch';
const manifest = JSON.parse(await readFile(files[0], 'utf8'));
const [major, minor, patch] = manifest.version.split('.').map(Number);
const next = /^\d+\.\d+\.\d+$/.test(arg) ? arg
  : arg === 'major' ? `${major + 1}.0.0`
  : arg === 'minor' ? `${major}.${minor + 1}.0`
  : `${major}.${minor}.${patch + 1}`;

for (const file of files) {
  const json = JSON.parse(await readFile(file, 'utf8'));
  json.version = next;
  await writeFile(file, JSON.stringify(json, null, 2) + '\n');
}
console.log(`${manifest.version} → ${next}

Next:
  1. Add a "## ${next}" section to CHANGELOG.md
  2. git commit -am "Release v${next}"
  3. git tag v${next} && git push && git push --tags
GitHub Actions then builds the zip and publishes the release.`);
