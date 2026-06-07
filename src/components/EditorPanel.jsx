/**
 * EditorPanel.jsx
 * Tabbed code editor: open-file tabs with active indicator bars, a nested-path
 * breadcrumb header, and a line-numbered textarea bound to the active file.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, X, FileCode2, CornerDownLeft } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext.jsx';

function Tabs() {
  const { openTabs, activePath, setActive, closeTab } = useWorkspace();
  if (openTabs.length === 0) return null;
  return (
    <div className="flex items-stretch h-9 bg-ink-900 border-b border-line overflow-x-auto scrollbar-none shrink-0">
      {openTabs.map((path) => {
        const name = path.split('/').pop();
        const active = path === activePath;
        return (
          <div
            key={path}
            onClick={() => setActive(path)}
            className={`group relative flex items-center gap-2 pl-3 pr-2 max-w-[200px] cursor-pointer border-r border-line text-2xs transition-colors ${
              active
                ? 'bg-ink-850 text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.02]'
            }`}
          >
            {active && (
              <span className="absolute left-0 right-0 top-0 h-0.5 bg-accent-emerald" />
            )}
            <FileCode2 size={12} className="shrink-0 text-amber-400/70" />
            <span className="truncate tracking-tight">{name}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeTab(path);
              }}
              className={`shrink-0 rounded p-0.5 hover:bg-white/10 ${
                active ? 'text-zinc-400' : 'text-transparent group-hover:text-zinc-500'
              }`}
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function Breadcrumbs({ path }) {
  if (!path) return null;
  const segments = path.split('/');
  return (
    <div className="flex items-center gap-1 h-8 px-3 border-b border-line bg-ink-850 text-2xs text-zinc-500 shrink-0 overflow-x-auto scrollbar-none">
      {segments.map((seg, i) => {
        const last = i === segments.length - 1;
        return (
          <span key={i} className="flex items-center gap-1 whitespace-nowrap">
            <span className={last ? 'text-zinc-200 tracking-tight' : 'tracking-tight'}>
              {seg}
            </span>
            {!last && <ChevronRight size={11} className="text-zinc-700" />}
          </span>
        );
      })}
    </div>
  );
}

export default function EditorPanel() {
  const { activePath, readFile, writeActive } = useWorkspace();
  const content = activePath ? readFile(activePath) ?? '' : '';
  const taRef = useRef(null);
  const gutterRef = useRef(null);
  const [cursor, setCursor] = useState({ line: 1, col: 1 });

  const lineCount = useMemo(() => Math.max(content.split('\n').length, 1), [content]);

  // Sync gutter scroll with textarea.
  const onScroll = () => {
    if (gutterRef.current && taRef.current) {
      gutterRef.current.scrollTop = taRef.current.scrollTop;
    }
  };

  const updateCursor = () => {
    const el = taRef.current;
    if (!el) return;
    const upto = el.value.slice(0, el.selectionStart);
    const lines = upto.split('\n');
    setCursor({ line: lines.length, col: lines[lines.length - 1].length + 1 });
  };

  const onKeyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const el = e.target;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const next = content.slice(0, start) + '  ' + content.slice(end);
      writeActive(next);
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = start + 2;
      });
    }
  };

  useEffect(() => {
    updateCursor();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePath]);

  if (!activePath) {
    return (
      <div className="flex flex-col h-full bg-ink-850">
        <div className="flex-1 flex items-center justify-center text-zinc-600">
          <div className="text-center">
            <FileCode2 size={28} className="mx-auto mb-3 text-zinc-700" />
            <p className="text-xs tracking-tight">No file open</p>
            <p className="text-2xs text-zinc-700 mt-1">
              Pick a file in the explorer to start editing
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-ink-850 min-h-0">
      <Tabs />
      <Breadcrumbs path={activePath} />
      <div className="relative flex-1 min-h-0 flex overflow-hidden">
        <div
          ref={gutterRef}
          className="select-none overflow-hidden py-3 pl-3 pr-2 text-right bg-ink-900/40 border-r border-line text-2xs leading-[1.6] font-mono text-zinc-700"
          aria-hidden
        >
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <textarea
          ref={taRef}
          value={content}
          spellCheck={false}
          onChange={(e) => writeActive(e.target.value)}
          onScroll={onScroll}
          onKeyDown={onKeyDown}
          onKeyUp={updateCursor}
          onClick={updateCursor}
          className="flex-1 resize-none outline-none bg-transparent py-3 px-4 text-xs leading-[1.6] font-mono text-zinc-200 scrollbar-thin caret-emerald-400 whitespace-pre"
          wrap="off"
        />
      </div>
      <div className="flex items-center justify-between h-6 px-3 border-t border-line bg-ink-900 text-2xs text-zinc-600 shrink-0">
        <span className="flex items-center gap-1.5 tracking-tight">
          <CornerDownLeft size={11} /> {activePath.split('.').pop()?.toUpperCase()}
        </span>
        <span className="tabular-nums">
          Ln {cursor.line}, Col {cursor.col} · {lineCount} lines
        </span>
      </div>
    </div>
  );
}
