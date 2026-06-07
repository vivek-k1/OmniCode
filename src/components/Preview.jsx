/**
 * Preview.jsx
 * Renders the bundled sandbox document inside an isolated iframe and exposes a
 * refresh control. The iframe is sandboxed but allowed to run scripts so the
 * compiled React app can execute and post console messages to the parent.
 */

import React, { useMemo } from 'react';
import { RotateCw, Globe, Boxes, FileWarning } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext.jsx';

const MODE_META = {
  react: { label: 'React', icon: Boxes, tint: 'text-sky-300' },
  html: { label: 'HTML', icon: Globe, tint: 'text-orange-300' },
  empty: { label: 'No entry', icon: FileWarning, tint: 'text-zinc-500' },
};

export default function Preview() {
  const { built, previewNonce, refreshPreview } = useWorkspace();
  const mode = MODE_META[built.mode] || MODE_META.empty;
  const ModeIcon = mode.icon;

  // Re-key on nonce + entry so manual refresh forces a clean reload.
  const frameKey = useMemo(
    () => `${previewNonce}:${built.entry || 'none'}`,
    [previewNonce, built.entry]
  );

  return (
    <div className="flex flex-col h-full bg-ink-850 border-l border-line min-w-0">
      <div className="flex items-center justify-between h-8 px-3 border-b border-line bg-ink-900 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <ModeIcon size={13} className={mode.tint} />
          <span className="text-2xs uppercase tracking-[0.14em] text-zinc-500">
            Preview
          </span>
          {built.entry && (
            <span className="text-2xs font-mono text-zinc-600 truncate">
              · {built.entry}
            </span>
          )}
        </div>
        <button
          onClick={refreshPreview}
          title="Refresh preview"
          className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04] transition-colors"
        >
          <RotateCw size={13} />
        </button>
      </div>
      <div className="flex-1 min-h-0 bg-white">
        <iframe
          key={frameKey}
          title="sandbox"
          srcDoc={built.srcDoc}
          sandbox="allow-scripts allow-modals allow-forms allow-popups allow-same-origin"
          className="w-full h-full border-0 bg-white"
        />
      </div>
    </div>
  );
}
