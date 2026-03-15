import fs from 'node:fs';
import path from 'node:path';

const standaloneNodeModules = path.join(process.cwd(), '.next', 'standalone', 'node_modules', '@next');
const standaloneReleaseDir = path.join(process.cwd(), '.next', 'standalone', 'release');

if (!fs.existsSync(standaloneNodeModules)) {
  if (fs.existsSync(standaloneReleaseDir)) {
    fs.rmSync(standaloneReleaseDir, { recursive: true, force: true });
  }
  process.exit(0);
}

for (const entry of fs.readdirSync(standaloneNodeModules)) {
  if (entry.startsWith('swc-')) {
    fs.rmSync(path.join(standaloneNodeModules, entry), { recursive: true, force: true });
  }
}

if (fs.existsSync(standaloneReleaseDir)) {
  fs.rmSync(standaloneReleaseDir, { recursive: true, force: true });
}
