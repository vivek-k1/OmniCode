/**
 * fileSystem.js
 * Thin wrapper around the browser File System Access API so the workspace can
 * open a real local folder and persist creates/edits/deletes back to disk.
 *
 * Only available in Chromium-based browsers over https/localhost. Callers must
 * check `fsSupported()` and degrade gracefully when it returns false.
 */

import { splitPath, flattenFiles, sortNodes } from './fileTree.js';

/** Folders we never import (noise / huge / generated). */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.svn',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.cache',
  '.turbo',
  '.parcel-cache',
  '.vscode',
  '.idea',
  'coverage',
]);

/** Extensions we treat as binary and skip when importing. */
const BINARY_EXT = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'ico', 'icns',
  'mp4', 'webm', 'mov', 'avi', 'mkv', 'mp3', 'wav', 'ogg', 'flac',
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  'zip', 'gz', 'tar', 'rar', '7z', 'pdf', 'wasm',
  'exe', 'dll', 'so', 'dylib', 'bin', 'dat',
  'sqlite', 'db', 'lock',
]);

const MAX_FILE_BYTES = 1024 * 1024; // 1 MB cap per text file

export function fsSupported() {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

function extOf(name) {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i + 1).toLowerCase();
}

/** Prompt the user to choose a local directory (readwrite). */
export async function pickDirectory() {
  if (!fsSupported()) {
    throw new Error(
      'This browser does not support opening local folders. Try Chrome, Edge, or another Chromium browser.'
    );
  }
  return window.showDirectoryPicker({ mode: 'readwrite' });
}

/**
 * Recursively read a directory handle into a WorkspaceNode[] tree.
 * Skips noisy folders, binary files, and oversized files.
 */
export async function readDirectoryToTree(dirHandle) {
  const skipped = [];

  const readDir = async (handle) => {
    const children = [];
    for await (const entry of handle.values()) {
      if (entry.kind === 'directory') {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) {
          if (SKIP_DIRS.has(entry.name)) skipped.push(entry.name + '/');
          continue;
        }
        children.push({
          name: entry.name,
          type: 'folder',
          children: await readDir(entry),
        });
      } else {
        if (BINARY_EXT.has(extOf(entry.name))) {
          skipped.push(entry.name);
          continue;
        }
        let file;
        try {
          file = await entry.getFile();
        } catch {
          continue;
        }
        if (file.size > MAX_FILE_BYTES) {
          skipped.push(`${entry.name} (too large)`);
          continue;
        }
        let content = '';
        try {
          content = await file.text();
        } catch {
          continue;
        }
        children.push({ name: entry.name, type: 'file', content });
      }
    }
    return sortNodes(children);
  };

  const tree = await readDir(dirHandle);
  return { tree, skipped };
}

/** Re-check / re-request readwrite permission on a stored handle. */
export async function ensurePermission(dirHandle) {
  if (!dirHandle) return false;
  const opts = { mode: 'readwrite' };
  if ((await dirHandle.queryPermission(opts)) === 'granted') return true;
  return (await dirHandle.requestPermission(opts)) === 'granted';
}

/** Write a single file (creating parent dirs) into the directory handle. */
export async function writeFileToDir(dirHandle, path, content) {
  const segs = splitPath(path);
  if (!segs.length) return;
  let dir = dirHandle;
  for (let i = 0; i < segs.length - 1; i++) {
    dir = await dir.getDirectoryHandle(segs[i], { create: true });
  }
  const fileHandle = await dir.getFileHandle(segs[segs.length - 1], {
    create: true,
  });
  const writable = await fileHandle.createWritable();
  await writable.write(content ?? '');
  await writable.close();
}

/** Delete a file or folder (recursively) from the directory handle. */
export async function deletePathFromDir(dirHandle, path) {
  const segs = splitPath(path);
  if (!segs.length) return;
  let dir = dirHandle;
  for (let i = 0; i < segs.length - 1; i++) {
    dir = await dir.getDirectoryHandle(segs[i]);
  }
  await dir.removeEntry(segs[segs.length - 1], { recursive: true });
}

/** Create an (empty) directory path inside the handle. */
export async function createDirInHandle(dirHandle, path) {
  const segs = splitPath(path);
  let dir = dirHandle;
  for (const seg of segs) {
    dir = await dir.getDirectoryHandle(seg, { create: true });
  }
}

/* ------------------------------------------------------------------ */
/* Handle persistence (IndexedDB) so a folder reconnects across reloads */
/* ------------------------------------------------------------------ */

const IDB_NAME = 'byok-fs';
const IDB_STORE = 'handles';
const HANDLE_KEY = 'rootDir';

function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveHandle(handle) {
  try {
    const db = await idb();
    await new Promise((res, rej) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(handle, HANDLE_KEY);
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
  } catch {
    /* ignore */
  }
}

export async function loadHandle() {
  try {
    const db = await idb();
    return await new Promise((res, rej) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(HANDLE_KEY);
      req.onsuccess = () => res(req.result || null);
      req.onerror = () => rej(req.error);
    });
  } catch {
    return null;
  }
}

export async function clearHandle() {
  try {
    const db = await idb();
    await new Promise((res) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(HANDLE_KEY);
      tx.oncomplete = res;
      tx.onerror = res;
    });
  } catch {
    /* ignore */
  }
}

/**
 * Persist every file in the tree to disk (create/overwrite only — never
 * deletes disk files that are absent from the tree, to stay non-destructive).
 * @returns {{ written: number, errors: string[] }}
 */
export async function syncTreeToDir(dirHandle, tree) {
  const files = flattenFiles(tree);
  const errors = [];
  let written = 0;
  for (const [path, content] of Object.entries(files)) {
    try {
      await writeFileToDir(dirHandle, path, content);
      written += 1;
    } catch (e) {
      errors.push(`${path}: ${e.message || e}`);
    }
  }
  return { written, errors };
}
