/**
 * fileTree.js
 * Pure, immutable helpers for manipulating a recursive virtual workspace.
 *
 * A workspace is represented as an array of WorkspaceNode at the root level:
 *   interface WorkspaceNode {
 *     name: string;
 *     type: 'file' | 'folder';
 *     children?: WorkspaceNode[];
 *     content?: string;
 *   }
 *
 * All mutating helpers return a NEW tree (structural sharing where practical)
 * so they can be used safely with React state.
 */

/** Normalize a path into clean segments, dropping empty/`.` parts. */
export function splitPath(path) {
  if (!path) return [];
  return String(path)
    .replace(/\\/g, '/')
    .split('/')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== '.');
}

/** Join segments back into a canonical posix path. */
export function joinPath(...segments) {
  return segments
    .flatMap((s) => splitPath(s))
    .join('/');
}

/** Sort: folders first, then files, each alphabetically (stable, case-insensitive). */
export function sortNodes(nodes) {
  return [...nodes].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

/**
 * Insert or overwrite a file at `path`, recursively creating any missing
 * parent folders. Returns a new tree. If a path segment collides with an
 * existing file, that file is promoted into a folder (defensive behaviour).
 */
export function upsertFile(tree, path, content = '') {
  const segments = splitPath(path);
  if (segments.length === 0) return tree;

  const recurse = (nodes, depth) => {
    const name = segments[depth];
    const isLeaf = depth === segments.length - 1;
    const next = [...nodes];
    const idx = next.findIndex((n) => n.name === name);

    if (isLeaf) {
      const fileNode = { name, type: 'file', content };
      if (idx === -1) next.push(fileNode);
      else next[idx] = { ...next[idx], type: 'file', content, children: undefined };
      return sortNodes(next);
    }

    // Folder segment
    if (idx === -1) {
      next.push({
        name,
        type: 'folder',
        children: recurse([], depth + 1),
      });
    } else {
      const existing = next[idx];
      const children = existing.type === 'folder' ? existing.children || [] : [];
      next[idx] = {
        ...existing,
        type: 'folder',
        content: undefined,
        children: recurse(children, depth + 1),
      };
    }
    return sortNodes(next);
  };

  return recurse(tree, 0);
}

/** Create an empty folder at `path` (recursively). Returns a new tree. */
export function createFolder(tree, path) {
  const segments = splitPath(path);
  if (segments.length === 0) return tree;

  const recurse = (nodes, depth) => {
    const name = segments[depth];
    const isLeaf = depth === segments.length - 1;
    const next = [...nodes];
    const idx = next.findIndex((n) => n.name === name);

    if (idx === -1) {
      next.push({
        name,
        type: 'folder',
        children: isLeaf ? [] : recurse([], depth + 1),
      });
    } else if (!isLeaf) {
      const existing = next[idx];
      next[idx] = {
        ...existing,
        type: 'folder',
        children: recurse(existing.children || [], depth + 1),
      };
    }
    return sortNodes(next);
  };

  return recurse(tree, 0);
}

/** Return the node at `path`, or null if it does not exist. */
export function getNode(tree, path) {
  const segments = splitPath(path);
  let nodes = tree;
  let node = null;
  for (const seg of segments) {
    node = (nodes || []).find((n) => n.name === seg) || null;
    if (!node) return null;
    nodes = node.children;
  }
  return node;
}

/** Read file content at `path`, or undefined if missing / not a file. */
export function readFile(tree, path) {
  const node = getNode(tree, path);
  return node && node.type === 'file' ? node.content ?? '' : undefined;
}

/** Delete the node at `path`. Returns a new tree. */
export function deleteNode(tree, path) {
  const segments = splitPath(path);
  if (segments.length === 0) return tree;

  const recurse = (nodes, depth) => {
    const name = segments[depth];
    const isLeaf = depth === segments.length - 1;
    if (isLeaf) return nodes.filter((n) => n.name !== name);
    return nodes.map((n) =>
      n.name === name && n.type === 'folder'
        ? { ...n, children: recurse(n.children || [], depth + 1) }
        : n
    );
  };

  return recurse(tree, 0);
}

/** Rename the leaf node at `path` to `newName`. Returns a new tree. */
export function renameNode(tree, path, newName) {
  const clean = newName.trim();
  if (!clean) return tree;
  const segments = splitPath(path);
  if (segments.length === 0) return tree;

  const recurse = (nodes, depth) => {
    const name = segments[depth];
    const isLeaf = depth === segments.length - 1;
    return sortNodes(
      nodes.map((n) => {
        if (n.name !== name) return n;
        if (isLeaf) return { ...n, name: clean };
        return { ...n, children: recurse(n.children || [], depth + 1) };
      })
    );
  };

  return recurse(tree, 0);
}

/**
 * Flatten the tree into a map of `{ 'full/path': content }` for every file.
 */
export function flattenFiles(tree, prefix = '') {
  const out = {};
  for (const node of tree || []) {
    const full = prefix ? `${prefix}/${node.name}` : node.name;
    if (node.type === 'file') {
      out[full] = node.content ?? '';
    } else if (node.children) {
      Object.assign(out, flattenFiles(node.children, full));
    }
  }
  return out;
}

/** Return a flat, sorted list of all file paths in the tree. */
export function listFilePaths(tree) {
  return Object.keys(flattenFiles(tree)).sort();
}

/** Count files and folders in the tree. */
export function countNodes(tree) {
  let files = 0;
  let folders = 0;
  const walk = (nodes) => {
    for (const n of nodes || []) {
      if (n.type === 'file') files += 1;
      else {
        folders += 1;
        walk(n.children);
      }
    }
  };
  walk(tree);
  return { files, folders };
}
