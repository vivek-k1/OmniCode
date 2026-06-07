/**
 * WorkspaceContext.jsx
 * The single source of truth for the IDE: recursive file tree, active file,
 * open tabs, sandbox logs/problems, terminal history, and the chosen AI model
 * + API keys. Keys live in localStorage; the tree/model selection persist too.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import {
  upsertFile,
  createFolder,
  deleteNode,
  renameNode,
  readFile,
  listFilePaths,
  countNodes,
} from '../lib/fileTree.js';
import { applyLLMOutput } from '../lib/parser.js';
import { bundle } from '../lib/bundler.js';
import {
  fsSupported,
  pickDirectory,
  readDirectoryToTree,
  ensurePermission,
  syncTreeToDir,
  deletePathFromDir,
  saveHandle,
  loadHandle,
  clearHandle,
} from '../lib/fileSystem.js';
import {
  PROVIDERS,
  DEFAULT_PROVIDER,
  DEFAULT_MODEL,
  providerForModel,
} from '../lib/providers.js';
import { STARTER_TREE } from '../lib/starterTemplate.js';

const WorkspaceContext = createContext(null);

const LS_TREE = 'byok_workspace_tree';
const LS_MODEL = 'byok_model';
const LS_PROVIDER = 'byok_provider';

/* ------------------------------------------------------------------ */
/* Persistence helpers                                                 */
/* ------------------------------------------------------------------ */

function loadTree() {
  try {
    const raw = localStorage.getItem(LS_TREE);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    /* ignore */
  }
  return STARTER_TREE;
}

function loadModelSettings() {
  let provider = DEFAULT_PROVIDER;
  let model = DEFAULT_MODEL;
  try {
    const m = localStorage.getItem(LS_MODEL);
    const p = localStorage.getItem(LS_PROVIDER);
    if (m && p && providerForModel(m)) {
      model = m;
      provider = p;
    }
  } catch {
    /* ignore */
  }
  return { provider, model };
}

/* ------------------------------------------------------------------ */
/* Reducer                                                             */
/* ------------------------------------------------------------------ */

const MAX_LOGS = 500;

function reducer(state, action) {
  switch (action.type) {
    case 'SET_TREE':
      return { ...state, tree: action.tree };

    case 'UPSERT_FILE': {
      const tree = upsertFile(state.tree, action.path, action.content);
      return { ...state, tree };
    }

    case 'WRITE_ACTIVE': {
      if (!state.activePath) return state;
      const tree = upsertFile(state.tree, state.activePath, action.content);
      return { ...state, tree };
    }

    case 'CREATE_FOLDER':
      return { ...state, tree: createFolder(state.tree, action.path) };

    case 'DELETE_NODE': {
      const tree = deleteNode(state.tree, action.path);
      const openTabs = state.openTabs.filter(
        (p) => p !== action.path && !p.startsWith(action.path + '/')
      );
      const activePath =
        state.activePath === action.path ||
        state.activePath?.startsWith(action.path + '/')
          ? openTabs[openTabs.length - 1] || null
          : state.activePath;
      return { ...state, tree, openTabs, activePath };
    }

    case 'RENAME_NODE':
      return { ...state, tree: renameNode(state.tree, action.path, action.newName) };

    case 'OPEN_FILE': {
      const openTabs = state.openTabs.includes(action.path)
        ? state.openTabs
        : [...state.openTabs, action.path];
      return { ...state, activePath: action.path, openTabs };
    }

    case 'CLOSE_TAB': {
      const openTabs = state.openTabs.filter((p) => p !== action.path);
      let activePath = state.activePath;
      if (state.activePath === action.path) {
        const idx = state.openTabs.indexOf(action.path);
        activePath = openTabs[idx] || openTabs[idx - 1] || openTabs[0] || null;
      }
      return { ...state, openTabs, activePath };
    }

    case 'SET_ACTIVE':
      return { ...state, activePath: action.path };

    case 'TOGGLE_FOLDER': {
      const collapsed = new Set(state.collapsed);
      if (collapsed.has(action.path)) collapsed.delete(action.path);
      else collapsed.add(action.path);
      return { ...state, collapsed };
    }

    case 'APPEND_LOG': {
      const logs = [...state.logs, action.log].slice(-MAX_LOGS);
      return { ...state, logs };
    }

    case 'CLEAR_LOGS':
      return { ...state, logs: [] };

    case 'SET_PROBLEMS':
      return { ...state, problems: action.problems };

    case 'APPEND_TERMINAL':
      return { ...state, terminal: [...state.terminal, ...action.lines].slice(-400) };

    case 'CLEAR_TERMINAL':
      return { ...state, terminal: [] };

    case 'SET_MODEL': {
      const provider = providerForModel(action.model)?.id || state.provider;
      return { ...state, model: action.model, provider };
    }

    case 'BUMP_PREVIEW':
      return { ...state, previewNonce: state.previewNonce + 1 };

    case 'SET_DIR':
      return {
        ...state,
        dirHandle: action.handle,
        dirName: action.name || null,
        syncStatus: action.handle ? 'idle' : 'off',
        fsError: null,
      };

    case 'SET_SYNC':
      return { ...state, syncStatus: action.status, fsError: action.error ?? null };

    default:
      return state;
  }
}

function init() {
  const { provider, model } = loadModelSettings();
  return {
    tree: loadTree(),
    activePath: 'src/App.jsx',
    openTabs: ['src/App.jsx'],
    collapsed: new Set(),
    logs: [],
    problems: [],
    terminal: [
      { type: 'system', text: 'OmniCode terminal · type `help` for commands' },
    ],
    provider,
    model,
    previewNonce: 0,
    // Local folder sync (File System Access API)
    dirHandle: null,
    dirName: null,
    syncStatus: 'off', // 'off' | 'idle' | 'saving' | 'saved' | 'error'
    fsError: null,
  };
}

/* ------------------------------------------------------------------ */
/* Provider                                                            */
/* ------------------------------------------------------------------ */

export function WorkspaceProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, init);
  const debounceRef = useRef(null);
  const syncRef = useRef(null);
  const dirHandleRef = useRef(null);
  // Skip the very first disk-sync triggered by importing a folder.
  const skipNextSync = useRef(false);

  // Keep a ref to the handle for use inside non-reactive callbacks.
  dirHandleRef.current = state.dirHandle;

  // Persist tree (debounced) + model selection.
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      try {
        localStorage.setItem(LS_TREE, JSON.stringify(state.tree));
      } catch {
        /* quota */
      }
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [state.tree]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_MODEL, state.model);
      localStorage.setItem(LS_PROVIDER, state.provider);
    } catch {
      /* ignore */
    }
  }, [state.model, state.provider]);

  // Auto-persist the tree to the connected local folder (debounced).
  useEffect(() => {
    if (!state.dirHandle) return undefined;
    if (skipNextSync.current) {
      skipNextSync.current = false;
      return undefined;
    }
    clearTimeout(syncRef.current);
    syncRef.current = setTimeout(async () => {
      dispatch({ type: 'SET_SYNC', status: 'saving' });
      try {
        const ok = await ensurePermission(state.dirHandle);
        if (!ok) throw new Error('Write permission denied for the folder.');
        const { errors } = await syncTreeToDir(state.dirHandle, state.tree);
        if (errors.length) {
          dispatch({ type: 'SET_SYNC', status: 'error', error: errors[0] });
        } else {
          dispatch({ type: 'SET_SYNC', status: 'saved' });
        }
      } catch (e) {
        dispatch({ type: 'SET_SYNC', status: 'error', error: e.message || String(e) });
      }
    }, 700);
    return () => clearTimeout(syncRef.current);
  }, [state.tree, state.dirHandle]);

  // Attempt to silently reconnect a previously opened folder on load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!fsSupported()) return;
      const handle = await loadHandle();
      if (!handle || cancelled) return;
      try {
        const granted =
          (await handle.queryPermission({ mode: 'readwrite' })) === 'granted';
        // Don't auto-prompt; only reconnect if permission already persists.
        if (granted && !cancelled) {
          const { tree } = await readDirectoryToTree(handle);
          skipNextSync.current = true;
          dispatch({ type: 'SET_TREE', tree });
          dispatch({ type: 'SET_DIR', handle, name: handle.name });
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Capture console/error messages forwarded from the sandbox iframe.
  useEffect(() => {
    const onMessage = (event) => {
      const d = event.data;
      if (!d || d.__byok !== true) return;
      if (d.kind === 'log' || d.kind === 'error') {
        dispatch({
          type: 'APPEND_LOG',
          log: {
            id: `${d.time}-${Math.random().toString(36).slice(2, 7)}`,
            level: d.level || 'log',
            kind: d.kind,
            message: d.message || '',
            source: d.source,
            line: d.line,
            time: d.time,
          },
        });
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Recompute the runtime problems list from error logs.
  useEffect(() => {
    const problems = state.logs
      .filter((l) => l.kind === 'error')
      .map((l) => {
        const loc = parseStackLocation(l.message);
        return {
          id: l.id,
          message: firstLine(l.message),
          detail: l.message,
          file: loc.file,
          line: loc.line,
          col: loc.col,
        };
      });
    dispatch({ type: 'SET_PROBLEMS', problems });
  }, [state.logs]);

  /* ---- Derived: compiled sandbox document ---- */
  const built = useMemo(() => {
    try {
      return bundle(state.tree);
    } catch (err) {
      return {
        srcDoc: `<pre style="color:#fca5a5;font-family:monospace;padding:16px">Bundler crashed:\n${
          err?.stack || err
        }</pre>`,
        entry: null,
        mode: 'empty',
        cssCount: 0,
      };
    }
  }, [state.tree, state.previewNonce]);

  const filePaths = useMemo(() => listFilePaths(state.tree), [state.tree]);
  const stats = useMemo(() => countNodes(state.tree), [state.tree]);

  /* ---- Actions ---- */
  const actions = useMemo(
    () => ({
      openFile: (path) => dispatch({ type: 'OPEN_FILE', path }),
      setActive: (path) => dispatch({ type: 'SET_ACTIVE', path }),
      closeTab: (path) => dispatch({ type: 'CLOSE_TAB', path }),
      toggleFolder: (path) => dispatch({ type: 'TOGGLE_FOLDER', path }),
      writeActive: (content) => dispatch({ type: 'WRITE_ACTIVE', content }),
      upsertFile: (path, content) => dispatch({ type: 'UPSERT_FILE', path, content }),
      createFolder: (path) => dispatch({ type: 'CREATE_FOLDER', path }),
      deleteNode: (path) => {
        dispatch({ type: 'DELETE_NODE', path });
        // Mirror the deletion to disk if a folder is connected.
        const handle = dirHandleRef.current;
        if (handle) {
          deletePathFromDir(handle, path).catch(() => {
            /* file may not exist on disk yet */
          });
        }
      },
      renameNode: (path, newName) => dispatch({ type: 'RENAME_NODE', path, newName }),
      readFile: (path) => readFile(state.tree, path),
      clearLogs: () => dispatch({ type: 'CLEAR_LOGS' }),
      appendTerminal: (lines) => dispatch({ type: 'APPEND_TERMINAL', lines }),
      clearTerminal: () => dispatch({ type: 'CLEAR_TERMINAL' }),
      setModel: (model) => dispatch({ type: 'SET_MODEL', model }),
      refreshPreview: () => dispatch({ type: 'BUMP_PREVIEW' }),
      setTree: (tree) => dispatch({ type: 'SET_TREE', tree }),

      // ---- Local folder (File System Access API) ----
      fsSupported: fsSupported(),
      openLocalFolder: async () => {
        const handle = await pickDirectory(); // throws on cancel/unsupported
        const { tree, skipped } = await readDirectoryToTree(handle);
        skipNextSync.current = true; // don't immediately rewrite what we read
        dispatch({ type: 'SET_TREE', tree });
        dispatch({ type: 'SET_DIR', handle, name: handle.name });
        await saveHandle(handle);
        const firstFile = listFilePaths(tree)[0];
        if (firstFile) dispatch({ type: 'OPEN_FILE', path: firstFile });
        return { name: handle.name, skipped };
      },
      disconnectFolder: async () => {
        await clearHandle();
        dispatch({ type: 'SET_DIR', handle: null });
      },
      saveToDiskNow: async () => {
        const handle = dirHandleRef.current;
        if (!handle) return { written: 0, errors: ['No folder connected'] };
        dispatch({ type: 'SET_SYNC', status: 'saving' });
        try {
          const ok = await ensurePermission(handle);
          if (!ok) throw new Error('Write permission denied.');
          const res = await syncTreeToDir(handle, state.tree);
          dispatch({
            type: 'SET_SYNC',
            status: res.errors.length ? 'error' : 'saved',
            error: res.errors[0],
          });
          return res;
        } catch (e) {
          dispatch({ type: 'SET_SYNC', status: 'error', error: e.message });
          return { written: 0, errors: [e.message] };
        }
      },
      // Apply raw LLM output to the tree; returns the written paths.
      applyAgentOutput: (raw) => {
        const result = applyLLMOutput(state.tree, raw);
        dispatch({ type: 'SET_TREE', tree: result.tree });
        if (result.written.length) {
          dispatch({ type: 'OPEN_FILE', path: result.written[0] });
        }
        return result;
      },
    }),
    [state.tree]
  );

  const value = useMemo(
    () => ({
      ...state,
      ...actions,
      built,
      filePaths,
      stats,
      providerMeta: PROVIDERS[state.provider],
    }),
    [state, actions, built, filePaths, stats]
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return ctx;
}

/* ------------------------------------------------------------------ */
/* Stack-trace helpers (used for the Problems tab)                     */
/* ------------------------------------------------------------------ */

function firstLine(s) {
  return String(s || '').split('\n')[0].slice(0, 200);
}

function parseStackLocation(stack) {
  const m =
    /(?:blob:)?https?:\/\/[^\s)]+?:(\d+):(\d+)/.exec(stack || '') ||
    /([\w./-]+\.[jt]sx?):(\d+):(\d+)/.exec(stack || '');
  if (!m) return { file: null, line: null, col: null };
  if (m.length === 4) return { file: m[1], line: Number(m[2]), col: Number(m[3]) };
  return { file: null, line: Number(m[1]), col: Number(m[2]) };
}

// Re-export the API keys helper so components share one implementation.
export function getApiKey(providerId) {
  const meta = PROVIDERS[providerId];
  if (!meta) return '';
  try {
    return localStorage.getItem(meta.storageKey) || '';
  } catch {
    return '';
  }
}

export function setApiKey(providerId, value) {
  const meta = PROVIDERS[providerId];
  if (!meta) return;
  try {
    if (value) localStorage.setItem(meta.storageKey, value);
    else localStorage.removeItem(meta.storageKey);
  } catch {
    /* ignore */
  }
}
