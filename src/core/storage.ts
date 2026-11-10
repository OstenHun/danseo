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
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new DanseoError('EDIT_BUSY', '다른 저장이 진행 중입니다. 잠시 뒤 다시 시도하세요. 잠금 파일이 남았다면 다른 Danseo 프로세스를 종료하고 원본을 확인한 뒤 workspace.json.danseo-lock만 제거하세요.');
    throw error;
  }
  return async () => { await file.close(); await unlink(path); };
}

export async function writableFile(workspace: string, file: string) {
  const root = await realpath(workspace), path = await realpath(file), rel = relative(root, path);
  const info = await lstat(file);
  if (!rel || isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`) ||
      path !== resolve(file) || !info.isFile() || info.isSymbolicLink() || info.nlink !== 1) {
    throw new DanseoError('EDIT_PATH', 'workspace 안의 일반 파일만 저장할 수 있습니다. 외부 경로·링크 파일은 기존 편집기를 사용하세요.');
  }
  return path;
}
