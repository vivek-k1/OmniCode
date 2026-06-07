/**
 * Sidebar.jsx
 * Recursive file explorer with collapsible folders, per-node actions, and a
 * slide-down API keys drawer for the three providers.
 */

import React, { useState } from 'react';
import {
  ChevronRight,
  File,
  FileCode2,
  FileJson,
  Folder,
  FolderOpen,
  FilePlus2,
  FolderPlus,
  Trash2,
  Pencil,
  KeyRound,
  Check,
  ExternalLink,
  Eye,
  EyeOff,
  Boxes,
  HardDriveDownload,
  HardDrive,
  Loader2,
  Save,
  Unplug,
  CircleAlert,
} from 'lucide-react';
import { useWorkspace, getApiKey, setApiKey } from '../context/WorkspaceContext.jsx';
import { PROVIDER_LIST } from '../lib/providers.js';

function fileIcon(name) {
  const ext = name.split('.').pop()?.toLowerCase();
  if (['jsx', 'tsx', 'js', 'ts', 'mjs'].includes(ext))
    return <FileCode2 size={14} className="text-amber-400/80 shrink-0" />;
  if (['json'].includes(ext))
    return <FileJson size={14} className="text-yellow-500/70 shrink-0" />;
  if (['css', 'scss'].includes(ext))
    return <FileCode2 size={14} className="text-sky-400/80 shrink-0" />;
  if (['html'].includes(ext))
    return <FileCode2 size={14} className="text-orange-400/80 shrink-0" />;
  return <File size={14} className="text-zinc-500 shrink-0" />;
}

function TreeNode({ node, parentPath, depth }) {
  const {
    activePath,
    collapsed,
    openFile,
    toggleFolder,
    deleteNode,
    renameNode,
    upsertFile,
    createFolder,
  } = useWorkspace();

  const path = parentPath ? `${parentPath}/${node.name}` : node.name;
  const indent = { paddingLeft: `${depth * 12 + 8}px` };

  if (node.type === 'folder') {
    const isCollapsed = collapsed.has(path);
    return (
      <div>
        <div
          className="group flex items-center gap-1.5 h-7 pr-2 text-2xs text-zinc-300 hover:bg-white/[0.03] cursor-pointer select-none transition-colors"
          style={indent}
          onClick={() => toggleFolder(path)}
        >
          <ChevronRight
            size={13}
            className={`shrink-0 text-zinc-500 transition-transform duration-150 ${
              isCollapsed ? '' : 'rotate-90'
            }`}
          />
          {isCollapsed ? (
            <Folder size={14} className="text-indigo-300/70 shrink-0" />
          ) : (
            <FolderOpen size={14} className="text-indigo-300/70 shrink-0" />
          )}
          <span className="truncate flex-1 tracking-tight">{node.name}</span>
          <span className="hidden group-hover:flex items-center gap-1">
            <button
              title="New file"
              className="text-zinc-500 hover:text-emerald-300"
              onClick={(e) => {
                e.stopPropagation();
                const n = window.prompt(`New file in ${path}/`, 'file.jsx');
                if (n) upsertFile(`${path}/${n}`, '');
              }}
            >
              <FilePlus2 size={12} />
            </button>
            <button
              title="New folder"
              className="text-zinc-500 hover:text-indigo-300"
              onClick={(e) => {
                e.stopPropagation();
                const n = window.prompt(`New folder in ${path}/`, 'folder');
                if (n) createFolder(`${path}/${n}`);
              }}
            >
              <FolderPlus size={12} />
            </button>
            <button
              title="Delete folder"
              className="text-zinc-500 hover:text-rose-400"
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm(`Delete folder "${path}" and its contents?`))
                  deleteNode(path);
              }}
            >
              <Trash2 size={12} />
            </button>
          </span>
        </div>
        {!isCollapsed && (
          <div className="animate-fade-in">
            {(node.children || []).map((child) => (
              <TreeNode
                key={child.name + child.type}
                node={child}
                parentPath={path}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const isActive = activePath === path;
  return (
    <div
      className={`group relative flex items-center gap-1.5 h-7 pr-2 cursor-pointer select-none transition-colors text-2xs ${
        isActive ? 'bg-white/[0.05] text-zinc-100' : 'text-zinc-400 hover:bg-white/[0.03]'
      }`}
      style={indent}
      onClick={() => openFile(path)}
    >
      {isActive && (
        <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full bg-accent-emerald" />
      )}
      <span style={{ width: 13 }} className="shrink-0" />
      {fileIcon(node.name)}
      <span className="truncate flex-1 tracking-tight">{node.name}</span>
      <span className="hidden group-hover:flex items-center gap-1">
        <button
          title="Rename"
          className="text-zinc-500 hover:text-zinc-200"
          onClick={(e) => {
            e.stopPropagation();
            const n = window.prompt('Rename file', node.name);
            if (n) renameNode(path, n);
          }}
        >
          <Pencil size={11} />
        </button>
        <button
          title="Delete"
          className="text-zinc-500 hover:text-rose-400"
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm(`Delete "${path}"?`)) deleteNode(path);
          }}
        >
          <Trash2 size={11} />
        </button>
      </span>
    </div>
  );
}

function KeysDrawer({ onClose }) {
  const [reveal, setReveal] = useState({});
  const [values, setValues] = useState(() =>
    Object.fromEntries(PROVIDER_LIST.map((p) => [p.id, getApiKey(p.id)]))
  );
  const [saved, setSaved] = useState(null);

  const save = (id) => {
    setApiKey(id, values[id].trim());
    setSaved(id);
    setTimeout(() => setSaved((s) => (s === id ? null : s)), 1400);
  };

  return (
    <div className="border-t border-line bg-ink-900 animate-fade-in">
      <div className="flex items-center justify-between px-3 h-9 border-b border-line">
        <div className="flex items-center gap-2 text-2xs uppercase tracking-[0.15em] text-zinc-500">
          <KeyRound size={12} /> API Keys
        </div>
        <button
          onClick={onClose}
          className="text-2xs text-zinc-500 hover:text-zinc-200 transition-colors"
        >
          Done
        </button>
      </div>
      <div className="p-3 space-y-3 max-h-72 overflow-y-auto scrollbar-thin">
        {PROVIDER_LIST.map((p) => (
          <div key={p.id} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-300 tracking-tight">{p.label}</span>
              <a
                href={p.docsUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-2xs text-zinc-600 hover:text-indigo-300 transition-colors"
              >
                get key <ExternalLink size={10} />
              </a>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <input
                  type={reveal[p.id] ? 'text' : 'password'}
                  value={values[p.id]}
                  spellCheck={false}
                  placeholder={p.keyHint}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [p.id]: e.target.value }))
                  }
                  className="w-full h-8 pl-2.5 pr-8 rounded-md bg-ink-850 border border-line focus:border-zinc-600 outline-none text-xs font-mono text-zinc-200 placeholder:text-zinc-700 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setReveal((r) => ({ ...r, [p.id]: !r[p.id] }))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-300"
                >
                  {reveal[p.id] ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
              <button
                onClick={() => save(p.id)}
                className={`h-8 px-2.5 rounded-md border text-2xs transition-all duration-200 ${
                  saved === p.id
                    ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10'
                    : 'border-line text-zinc-400 hover:text-zinc-100 hover:border-zinc-600'
                }`}
              >
                {saved === p.id ? <Check size={13} /> : 'Save'}
              </button>
            </div>
          </div>
        ))}
        <p className="text-2xs text-zinc-600 leading-relaxed pt-1">
          Keys are stored only in this browser's localStorage and sent directly to
          each provider. They never touch a server.
        </p>
      </div>
    </div>
  );
}

function SyncBadge({ status }) {
  const map = {
    saving: { icon: Loader2, cls: 'text-indigo-300', spin: true, label: 'Saving…' },
    saved: { icon: Check, cls: 'text-emerald-300', label: 'Saved to disk' },
    idle: { icon: HardDrive, cls: 'text-zinc-500', label: 'Synced' },
    error: { icon: CircleAlert, cls: 'text-rose-400', label: 'Sync error' },
  };
  const m = map[status] || map.idle;
  const Icon = m.icon;
  return (
    <span className={`flex items-center gap-1 ${m.cls}`}>
      <Icon size={11} className={m.spin ? 'animate-spin' : ''} />
      {m.label}
    </span>
  );
}

function FolderBar() {
  const {
    fsSupported,
    dirHandle,
    dirName,
    syncStatus,
    fsError,
    openLocalFolder,
    disconnectFolder,
    saveToDiskNow,
  } = useWorkspace();
  const [busy, setBusy] = useState(false);

  const open = async () => {
    setBusy(true);
    try {
      await openLocalFolder();
    } catch (e) {
      if (e?.name !== 'AbortError') window.alert(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!fsSupported) return null;

  if (!dirHandle) {
    return (
      <button
        onClick={open}
        disabled={busy}
        className="flex items-center gap-2 w-full h-9 px-3 border-b border-line text-2xs text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.02] transition-colors disabled:opacity-50"
      >
        {busy ? (
          <Loader2 size={12} className="animate-spin" />
        ) : (
          <HardDriveDownload size={12} />
        )}
        Open local folder…
      </button>
    );
  }

  return (
    <div className="border-b border-line">
      <div className="flex items-center justify-between h-9 px-3">
        <span className="flex items-center gap-1.5 text-2xs text-zinc-300 truncate">
          <HardDrive size={12} className="text-accent-emerald shrink-0" />
          <span className="truncate font-mono tracking-tight">{dirName}</span>
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            title="Save all to disk now"
            onClick={() => saveToDiskNow()}
            className="p-1 rounded text-zinc-500 hover:text-emerald-300 hover:bg-white/[0.04] transition-colors"
          >
            <Save size={13} />
          </button>
          <button
            title="Open a different folder"
            onClick={open}
            className="p-1 rounded text-zinc-500 hover:text-indigo-300 hover:bg-white/[0.04] transition-colors"
          >
            <HardDriveDownload size={13} />
          </button>
          <button
            title="Disconnect folder"
            onClick={() => disconnectFolder()}
            className="p-1 rounded text-zinc-500 hover:text-rose-400 hover:bg-white/[0.04] transition-colors"
          >
            <Unplug size={13} />
          </button>
        </div>
      </div>
      <div className="flex items-center justify-between px-3 pb-1.5 text-[10px]">
        <SyncBadge status={syncStatus} />
        {syncStatus === 'error' && fsError && (
          <span className="text-rose-400/80 truncate max-w-[140px]" title={fsError}>
            {fsError}
          </span>
        )}
      </div>
    </div>
  );
}

export default function Sidebar() {
  const { tree, upsertFile, createFolder, stats } = useWorkspace();
  const [keysOpen, setKeysOpen] = useState(false);

  return (
    <aside className="flex flex-col h-full bg-ink-900 border-r border-line">
      <div className="flex items-center justify-between h-10 px-3 border-b border-line shrink-0">
        <div className="flex items-center gap-2">
          <Boxes size={15} className="text-accent-emerald" />
          <span className="text-xs font-semibold tracking-tight text-zinc-200">
            Explorer
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            title="New file at root"
            className="p-1 rounded text-zinc-500 hover:text-emerald-300 hover:bg-white/[0.04] transition-colors"
            onClick={() => {
              const n = window.prompt('New file path', 'src/NewFile.jsx');
              if (n) upsertFile(n, '');
            }}
          >
            <FilePlus2 size={14} />
          </button>
          <button
            title="New folder at root"
            className="p-1 rounded text-zinc-500 hover:text-indigo-300 hover:bg-white/[0.04] transition-colors"
            onClick={() => {
              const n = window.prompt('New folder path', 'src/components');
              if (n) createFolder(n);
            }}
          >
            <FolderPlus size={14} />
          </button>
        </div>
      </div>

      <FolderBar />

      <div className="flex-1 overflow-y-auto scrollbar-thin py-1">
        {tree.length === 0 ? (
          <p className="px-3 py-6 text-2xs text-zinc-600 text-center">
            Empty workspace. Create a file or ask the agent to scaffold one.
          </p>
        ) : (
          tree.map((node) => (
            <TreeNode
              key={node.name + node.type}
              node={node}
              parentPath=""
              depth={0}
            />
          ))
        )}
      </div>

      <div className="shrink-0">
        {keysOpen && <KeysDrawer onClose={() => setKeysOpen(false)} />}
        <button
          onClick={() => setKeysOpen((v) => !v)}
          className="flex items-center justify-between w-full h-9 px-3 border-t border-line text-2xs text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.02] transition-colors"
        >
          <span className="flex items-center gap-2">
            <KeyRound size={12} /> API Keys
          </span>
          <span className="text-zinc-600">
            {stats.files} files · {stats.folders} folders
          </span>
        </button>
      </div>
    </aside>
  );
}
