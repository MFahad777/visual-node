import { spawn } from 'child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const docsWorktreePath = path.resolve(repoRoot, '..', 'node-blueprint-docs');

/**
 * Refresh the documentation preview bundle:
 * 1. Build the preview harness
 * 2. Ensure docs worktree exists
 * 3. Sync preview bundle to docs static dir
 */

console.log('🔨 Building preview bundle...');

// Step 1: Build preview bundle
await new Promise((resolve, reject) => {
  const isWindows = process.platform === 'win32';
  const proc = spawn(
    isWindows ? 'pnpm.cmd' : 'pnpm',
    ['--filter', '@visual-node/editor-ui', 'run', 'build:preview'],
    {
      cwd: repoRoot,
      stdio: 'inherit',
      shell: isWindows,
    }
  );

  proc.on('exit', (code) => {
    if (code === 0) {
      resolve();
    } else {
      reject(new Error(`Preview build failed with exit code ${code}`));
    }
  });

  proc.on('error', reject);
});

console.log('✅ Preview bundle built');

// Step 2: Ensure worktree exists
console.log('\n📂 Checking docs worktree...');

try {
  await fs.access(docsWorktreePath);
  console.log(`✅ Worktree already exists at ${docsWorktreePath}`);
} catch {
  console.log(`Creating new worktree at ${docsWorktreePath}...`);
  await new Promise((resolve, reject) => {
    const isWindows = process.platform === 'win32';
    const proc = spawn(
      'git',
      ['worktree', 'add', docsWorktreePath, 'documentation'],
      {
        cwd: repoRoot,
        stdio: 'inherit',
        shell: isWindows,
      }
    );

    proc.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`git worktree add failed with exit code ${code}`));
      }
    });

    proc.on('error', reject);
  });
  console.log('✅ Worktree created');
}

// Step 3: Sync preview bundle to docs static dir
console.log('\n📋 Syncing preview bundle to docs...');

const distPreviewPath = path.resolve(repoRoot, 'packages', 'editor-ui', 'dist-preview');
const docsStaticPreviewPath = path.resolve(docsWorktreePath, 'static', 'node-preview');

try {
  await fs.mkdir(docsStaticPreviewPath, { recursive: true });
  console.log(`Created ${docsStaticPreviewPath}`);
} catch (err) {
  console.error(`Failed to create directory: ${err.message}`);
  process.exit(1);
}

// Copy files recursively
async function copyDir(src, dest) {
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await fs.mkdir(destPath, { recursive: true });
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

try {
  await copyDir(distPreviewPath, docsStaticPreviewPath);
  console.log(`✅ Copied ${distPreviewPath} → ${docsStaticPreviewPath}`);
} catch (err) {
  console.error(`Failed to copy files: ${err.message}`);
  process.exit(1);
}

// Step 4: Print next steps
console.log('\n✨ Done! Next steps:');
console.log(`\n  cd ${docsWorktreePath}`);
console.log('  git add .');
console.log('  git commit -m "Update preview bundle"');
console.log('  git push origin documentation\n');
console.log('💡 Tip: To test locally, run:');
console.log(`  cd ${docsWorktreePath} && pnpm install && pnpm start\n`);
