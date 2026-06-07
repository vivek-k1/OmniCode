/**
 * App.jsx
 * Top-level layout: title bar, a resizable 4-region work surface
 * (Explorer · Editor · Preview · Agent) and a resizable bottom dock.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Boxes, Code2, Eye, Columns2, RotateCw } from 'lucide-react';
import Sidebar from './components/Sidebar.jsx';
import EditorPanel from './components/EditorPanel.jsx';
import Preview from './components/Preview.jsx';
import DockPanel from './components/DockPanel.jsx';
import AgentPanel from './components/AgentPanel.jsx';
import { useWorkspace } from './context/WorkspaceContext.jsx';

const VIEWS = [
  { id: 'code', label: 'Code', icon: Code2 },
  { id: 'split', label: 'Split', icon: Columns2 },
  { id: 'preview', label: 'Preview', icon: Eye },
];

/** Generic drag handle for resizing a neighbouring panel. */
function VResizer({ onDrag }) {
  const active = useRef(false);
  useEffect(() => {
    const move = (e) => active.current && onDrag(e.clientX);
    const up = () => (active.current = false);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, [onDrag]);
  return (
    <div
      onMouseDown={() => (active.current = true)}
      className="w-1 cursor-col-resize bg-transparent hover:bg-accent-indigo/40 transition-colors shrink-0"
    />
  );
}

function TopBar({ view, setView }) {
  const { model, refreshPreview, providerMeta } = useWorkspace();
  return (
    <header className="flex items-center justify-between h-11 px-3 bg-ink-950 border-b border-line shrink-0">
      <div className="flex items-center gap-2.5">
        <div className="flex items-center gap-2">
          <Boxes size={17} className="text-accent-emerald" />
          <span className="text-sm font-semibold tracking-tight text-zinc-100">
            BYOK
          </span>
          <span className="text-2xs text-zinc-600 tracking-[0.18em] uppercase mt-0.5">
            Workspace
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1 rounded-lg border border-line bg-ink-900 p-0.5">
        {VIEWS.map((v) => {
          const Icon = v.icon;
          const active = view === v.id;
          return (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={`relative flex items-center gap-1.5 h-7 px-2.5 rounded-md text-2xs tracking-tight transition-all duration-200 ${
                active
                  ? 'bg-ink-800 text-zinc-100'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Icon size={13} />
              {v.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <span className="hidden sm:flex items-center gap-1.5 text-2xs text-zinc-500">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-indigo" />
          {providerMeta?.label}
        </span>
        <button
          onClick={refreshPreview}
          className="flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-line text-2xs text-zinc-400 hover:text-zinc-100 hover:border-zinc-600 transition-all duration-200"
        >
          <RotateCw size={12} /> Run
        </button>
      </div>
    </header>
  );
}

export default function App() {
  const [view, setView] = useState('split');
  const [sidebarW, setSidebarW] = useState(240);
  const [agentW, setAgentW] = useState(384);
  const [dockH, setDockH] = useState(220);
  const [dockCollapsed, setDockCollapsed] = useState(false);

  const onSidebarDrag = useCallback((x) => {
    setSidebarW(Math.min(Math.max(x, 160), 420));
  }, []);
  const onAgentDrag = useCallback((x) => {
    setAgentW(Math.min(Math.max(window.innerWidth - x, 300), 640));
  }, []);

  const showCode = view !== 'preview';
  const showPreview = view !== 'code';

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-ink-950 text-zinc-200">
      <TopBar view={view} setView={setView} />

      <div className="flex flex-1 min-h-0">
        {/* Explorer */}
        <div style={{ width: sidebarW }} className="shrink-0 min-w-0">
          <Sidebar />
        </div>
        <VResizer onDrag={onSidebarDrag} />

        {/* Center: editor / preview + dock */}
        <div className="flex flex-col flex-1 min-w-0 min-h-0">
          <div className="flex flex-1 min-h-0 min-w-0">
            {showCode && (
              <div className={`min-w-0 min-h-0 ${showPreview ? 'flex-1' : 'flex-1'}`}>
                <EditorPanel />
              </div>
            )}
            {showPreview && (
              <div className={`min-w-0 min-h-0 ${showCode ? 'flex-1' : 'flex-1'}`}>
                <Preview />
              </div>
            )}
          </div>
          <DockPanel
            height={dockH}
            setHeight={setDockH}
            collapsed={dockCollapsed}
            setCollapsed={setDockCollapsed}
          />
        </div>

        {/* Agent */}
        <VResizer onDrag={onAgentDrag} />
        <div style={{ width: agentW }} className="shrink-0 min-w-0">
          <AgentPanel />
        </div>
      </div>
    </div>
  );
}
