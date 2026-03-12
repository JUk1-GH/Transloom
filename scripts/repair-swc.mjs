import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const swcBinary = path.join(process.cwd(), 'node_modules', '@next', 'swc-darwin-arm64', 'next-swc.darwin-arm64.node');

if (process.platform !== 'darwin' || !fs.existsSync(swcBinary)) {
  process.exit(0);
}

spawnSync('xattr', ['-dr', 'com.apple.quarantine', swcBinary], { stdio: 'ignore' });
spawnSync('codesign', ['--force', '--sign', '-', swcBinary], { stdio: 'inherit' });
