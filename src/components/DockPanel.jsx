/**
 * DockPanel.jsx
 * VS Code-style resizable bottom dock with three tabs:
 *   - Output  : console.* + errors intercepted from the sandbox iframe
 *   - Problems: runtime errors parsed into actionable, file/line entries
 *   - Terminal: a simulated shell operating on the virtual workspace
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  TerminalSquare,
  ListChecks,
  ScrollText,
  Trash2,
  AlertTriangle,
  ChevronUp,
  X,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext.jsx';

const LEVEL_STYLES = {
  log: 'text-zinc-300',
  info: 'text-sky-300',
  debug: 'text-zinc-500',
  warn: 'text-amber-300',
  error: 'text-rose-300',
};

/* ----------------------------- Output ----------------------------- */

function OutputTab() {
  const { logs, clearLogs } = useWorkspace();
  const endRef = useRef(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [logs.length]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 h-7 border-b border-line/60 shrink-0">
        <span className="text-2xs uppercase tracking-[0.15em] text-zinc-600">
          {logs.length} entries
        </span>
        <button
          onClick={clearLogs}
          className="flex items-center gap-1 text-2xs text-zinc-600 hover:text-zinc-300 transition-colors"
        >
          <Trash2 size={11} /> Clear
        </button>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin font-mono text-xs leading-relaxed px-3 py-2">
        {logs.length === 0 ? (
          <p className="text-zinc-700 text-2xs">
            Console output from the sandbox appears here. Try a{' '}
            <code className="text-zinc-500">console.log()</code> in your code.
          </p>
        ) : (
          logs.map((l) => (
            <div key={l.id} className="flex gap-2 py-0.5 border-b border-line/30">
              <span className="text-zinc-700 shrink-0 tabular-nums">
                {new Date(l.time).toLocaleTimeString([], {
                  hour12: false,
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </span>
              <span
                className={`shrink-0 uppercase text-[10px] mt-0.5 ${
                  LEVEL_STYLES[l.level] || 'text-zinc-400'
                }`}
              >
                {l.level}
              </span>
              <pre
                className={`whitespace-pre-wrap break-words flex-1 ${
                  LEVEL_STYLES[l.level] || 'text-zinc-300'
                }`}
              >
                {l.message}
              </pre>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}

/* ----------------------------- Problems ---------------------------- */

function ProblemsTab() {
  const { problems, openFile, filePaths } = useWorkspace();
  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin px-2 py-2">
      {problems.length === 0 ? (
        <div className="flex items-center gap-2 px-2 py-2 text-2xs text-zinc-600">
          <ListChecks size={13} className="text-emerald-400/70" /> No problems detected.
        </div>
      ) : (
        problems.map((p) => {
          const target =
            p.file && filePaths.find((fp) => fp.endsWith(p.file.split('/').pop()));
          return (
            <button
              key={p.id}
              onClick={() => target && openFile(target)}
              className="group w-full text-left flex items-start gap-2 px-2 py-1.5 rounded hover:bg-white/[0.03] transition-colors"
            >
              <AlertTriangle
                size={13}
                className="text-rose-400 shrink-0 mt-0.5"
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-zinc-300 truncate group-hover:text-zinc-100">
                  {p.message}
                </p>
                <p className="text-2xs text-zinc-600 font-mono">
                  {target || p.file || 'sandbox'}
                  {p.line ? `:${p.line}${p.col ? ':' + p.col : ''}` : ''}
                </p>
              </div>
            </button>
          );
        })
      )}
    </div>
  );
}

/* ----------------------------- Terminal ---------------------------- */

function useTerminalEngine() {
  const ws = useWorkspace();

  return (raw) => {
    const cmd = raw.trim();
    if (!cmd) return [];
    const [bin, ...args] = cmd.split(/\s+/);
    const echo = { type: 'cmd', text: `$ ${cmd}` };

    const out = (lines) => [echo, ...lines.map((t) => ({ type: 'out', text: t }))];
    const err = (lines) => [echo, ...lines.map((t) => ({ type: 'err', text: t }))];

    switch (bin) {
      case 'help':
        return out([
          'Available commands:',
          '  help              show this help',
          '  ls [path]         list files / folders',
          '  tree              print the workspace tree',
          '  cat <path>        print a file',
          '  pwd               print working directory',
          '  echo <text>       print text',
          '  npm install       simulate dependency install',
          '  npm run dev       (re)build & refresh the preview',
          '  run               refresh the sandbox preview',
          '  clear             clear the terminal',
        ]);

      case 'pwd':
        return out(['/workspace']);

      case 'echo':
        return out([args.join(' ')]);

      case 'ls': {
        const prefix = args[0] ? args[0].replace(/\/$/, '') + '/' : '';
        const set = new Set();
        ws.filePaths.forEach((p) => {
          if (!p.startsWith(prefix)) return;
          const rest = p.slice(prefix.length).split('/');
          set.add(rest.length > 1 ? rest[0] + '/' : rest[0]);
        });
        const items = [...set].sort();
        return items.length ? out(items) : err([`ls: ${args[0] || '.'}: empty`]);
      }

      case 'tree': {
        const lines = ['workspace/'];
        const sorted = [...ws.filePaths].sort();
        sorted.forEach((p, i) => {
          const last = i === sorted.length - 1;
          lines.push(`${last ? '└─ ' : '├─ '}${p}`);
        });
        return out(lines);
      }

      case 'cat': {
        if (!args[0]) return err(['cat: missing file operand']);
        const c = ws.readFile(args[0]);
        if (c == null) return err([`cat: ${args[0]}: No such file`]);
        return out(c.split('\n'));
      }

      case 'clear':
        ws.clearTerminal();
        return [];

      case 'run':
        ws.refreshPreview();
        return out(['↻ rebuilding sandbox…', '✓ preview refreshed']);

      case 'npm': {
        if (args[0] === 'install' || args[0] === 'i') {
          return out([
            'npm install',
            '⠙ resolving packages…',
            'added 134 packages in 1.2s',
            '✓ dependencies linked (simulated)',
          ]);
        }
        if (args[0] === 'run' && args[1] === 'dev') {
          ws.refreshPreview();
          return out([
            '> vite',
            '',
            '  VITE ready in 312 ms',
            '  ➜  Local:  sandbox://preview',
            '✓ preview refreshed',
          ]);
        }
        if (args[0] === 'run' && args[1] === 'build') {
          return out(['> vite build', `✓ built ${ws.stats.files} modules (simulated)`]);
        }
        return err([`npm: unknown command "${args.join(' ')}"`]);
      }

      default:
        return err([`command not found: ${bin} — type "help"`]);
    }
  };
}

function TerminalTab() {
  const { terminal, appendTerminal } = useWorkspace();
  const run = useTerminalEngine();
  const [input, setInput] = useState('');
  const [history, setHistory] = useState([]);
  const [hIndex, setHIndex] = useState(-1);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [terminal.length]);

  const submit = () => {
    const cmd = input;
    const lines = run(cmd);
    if (lines.length) appendTerminal(lines);
    if (cmd.trim()) setHistory((h) => [...h, cmd]);
    setInput('');
    setHIndex(-1);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter') submit();
    else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHIndex((i) => {
        const ni = i < 0 ? history.length - 1 : Math.max(0, i - 1);
        if (history[ni] != null) setInput(history[ni]);
        return ni;
      });
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHIndex((i) => {
        const ni = i + 1;
        if (ni >= history.length) {
          setInput('');
          return -1;
        }
        setInput(history[ni]);
        return ni;
      });
    }
  };

  return (
    <div
      className="flex flex-col h-full font-mono text-xs"
      onClick={() => inputRef.current?.focus()}
    >
      <div className="flex-1 overflow-y-auto scrollbar-thin px-3 py-2 leading-relaxed">
        {terminal.map((l, i) => (
          <pre
            key={i}
            className={`whitespace-pre-wrap break-words ${
              l.type === 'cmd'
                ? 'text-emerald-300'
                : l.type === 'err'
                ? 'text-rose-300'
                : l.type === 'system'
                ? 'text-zinc-600'
                : 'text-zinc-400'
            }`}
          >
            {l.text}
          </pre>
        ))}
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-emerald-400 shrink-0">$</span>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            spellCheck={false}
            autoComplete="off"
            className="flex-1 bg-transparent outline-none text-zinc-200 caret-emerald-400"
            placeholder="type a command…"
          />
        </div>
        <div ref={endRef} />
      </div>
    </div>
  );
}

/* ----------------------------- Dock shell -------------------------- */

const TABS = [
  { id: 'output', label: 'Output', icon: ScrollText },
  { id: 'problems', label: 'Problems', icon: ListChecks },
  { id: 'terminal', label: 'Terminal', icon: TerminalSquare },
];

export default function DockPanel({ height, setHeight, collapsed, setCollapsed }) {
  const { problems, logs } = useWorkspace();
  const [tab, setTab] = useState('terminal');
  const dragging = useRef(false);

  // Auto-focus the Problems tab when a new error arrives.
  const prevProblems = useRef(0);
  useEffect(() => {
    if (problems.length > prevProblems.current && collapsed) setCollapsed(false);
    prevProblems.current = problems.length;
  }, [problems.length, collapsed, setCollapsed]);

  useEffect(() => {
    const onMove = (e) => {
      if (!dragging.current) return;
      const h = window.innerHeight - e.clientY;
      setHeight(Math.min(Math.max(h, 120), window.innerHeight - 200));
    };
    const onUp = () => (dragging.current = false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [setHeight]);

  const counts = {
    output: logs.length,
    problems: problems.length,
    terminal: null,
  };

  return (
    <div
      className="flex flex-col bg-ink-900 border-t border-line shrink-0"
      style={{ height: collapsed ? 36 : height }}
    >
      {!collapsed && (
        <div
          onMouseDown={() => (dragging.current = true)}
          className="h-1 cursor-row-resize hover:bg-accent-indigo/40 transition-colors -mt-px"
        />
      )}
      <div className="flex items-center justify-between h-9 px-1 border-b border-line shrink-0">
        <div className="flex items-stretch h-full">
          {TABS.map((t) => {
            const active = tab === t.id && !collapsed;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => {
                  setTab(t.id);
                  setCollapsed(false);
                }}
                className={`relative flex items-center gap-1.5 px-3 text-2xs uppercase tracking-[0.12em] transition-colors ${
                  active
                    ? 'text-zinc-100'
                    : 'text-zinc-600 hover:text-zinc-300'
                }`}
              >
                {active && (
                  <span className="absolute left-2 right-2 bottom-0 h-0.5 bg-accent-indigo rounded-full" />
                )}
                <Icon size={13} />
                {t.label}
                {counts[t.id] != null && counts[t.id] > 0 && (
                  <span
                    className={`ml-0.5 rounded-full px-1.5 text-[10px] tabular-nums ${
                      t.id === 'problems'
                        ? 'bg-rose-500/15 text-rose-300'
                        : 'bg-white/5 text-zinc-400'
                    }`}
                  >
                    {counts[t.id]}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="p-1.5 rounded text-zinc-600 hover:text-zinc-200 hover:bg-white/[0.04] transition-colors"
          title={collapsed ? 'Expand panel' : 'Collapse panel'}
        >
          {collapsed ? <ChevronUp size={14} /> : <X size={14} />}
        </button>
      </div>

      {!collapsed && (
        <div className="flex-1 min-h-0">
          {tab === 'output' && <OutputTab />}
          {tab === 'problems' && <ProblemsTab />}
          {tab === 'terminal' && <TerminalTab />}
        </div>
      )}
    </div>
  );
}
