import { open, lstat, realpath, unlink } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute, sep } from 'node:path';
import { DanseoError } from './index.js';

export async function exists(path: string) {
  try { await lstat(path); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}

export async function workspaceLock(root: string) {
  const path = join(root, 'workspace.json.danseo-lock');
  let file;
  try { file = await open(path, 'wx', 0o600); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new DanseoError('EDIT_BUSY', 'Another write is in progress. Retry shortly. If a lock remains, stop other Danseo processes, inspect the originals, then remove only workspace.json.danseo-lock.');
    throw error;
  }
  return async () => { await file.close(); await unlink(path); };
}

export async function writableFile(workspace: string, file: string) {
  const root = await realpath(workspace), path = await realpath(file), rel = relative(root, path);
  const info = await lstat(file);
  if (!rel || isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`) ||
      path !== resolve(file) || !info.isFile() || info.isSymbolicLink() || info.nlink !== 1) {
    throw new DanseoError('EDIT_PATH', 'Only regular files inside the workspace can be written. Use your existing editor for external paths or linked files.');
  }
  return path;
}
