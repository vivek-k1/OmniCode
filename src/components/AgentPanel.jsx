/**
 * AgentPanel.jsx
 * The AI column: a premium provider/model selector, a clean chat transcript,
 * and an input composer. Assistant replies are parsed for [FILE: ...] blocks
 * which are written into the workspace; the prose is shown in the bubble.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles,
  ChevronDown,
  ArrowUp,
  Square,
  Check,
  FileCode2,
  CircleAlert,
  Trash2,
  Bot,
  User,
  ImagePlus,
  X,
} from 'lucide-react';
import { useWorkspace, getApiKey } from '../context/WorkspaceContext.jsx';
import {
  PROVIDER_LIST,
  PROVIDERS,
  providerForModel,
  callModel,
  maxTokensForModel,
} from '../lib/providers.js';
import { buildSystemPrompt } from '../lib/systemPrompt.js';
import { stripFileBlocks } from '../lib/parser.js';
import { flattenFiles } from '../lib/fileTree.js';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB per image
const MAX_ATTACHMENTS = 5;

/** Read an image File into { id, name, mimeType, data(base64), url }. */
function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result; // data:<mime>;base64,<data>
      const comma = String(url).indexOf(',');
      resolve({
        id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: file.name || 'pasted-image',
        mimeType: file.type || 'image/png',
        data: String(url).slice(comma + 1),
        url,
      });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/* ----------------------- Model selector dropdown ------------------- */

function ModelSelector() {
  const { model, setModel } = useWorkspace();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const meta = providerForModel(model);
  const current = meta?.models.find((m) => m.id === model);

  useEffect(() => {
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const hasKey = (pid) => Boolean(getApiKey(pid));

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 h-8 pl-2.5 pr-2 rounded-md border border-line bg-ink-850 hover:border-zinc-600 text-2xs text-zinc-200 transition-all duration-200"
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            hasKey(meta?.id) ? 'bg-accent-emerald' : 'bg-zinc-600'
          }`}
        />
        <span className="tracking-tight">{current?.label || 'Select model'}</span>
        <ChevronDown
          size={13}
          className={`text-zinc-500 transition-transform duration-150 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-1.5 w-64 rounded-lg border border-line bg-ink-850 shadow-2xl shadow-black/60 overflow-hidden animate-fade-in">
          {PROVIDER_LIST.map((p) => (
            <div key={p.id} className="py-1">
              <div className="flex items-center justify-between px-3 py-1">
                <span className="text-[10px] uppercase tracking-[0.16em] text-zinc-600">
                  {p.label}
                </span>
                <span
                  className={`text-[10px] ${
                    hasKey(p.id) ? 'text-emerald-400/80' : 'text-zinc-700'
                  }`}
                >
                  {hasKey(p.id) ? 'key set' : 'no key'}
                </span>
              </div>
              {p.models.map((m) => {
                const active = m.id === model;
                return (
                  <button
                    key={m.id}
                    onClick={() => {
                      setModel(m.id);
                      setOpen(false);
                    }}
                    className={`relative w-full flex items-center justify-between px-3 h-8 text-xs transition-colors ${
                      active
                        ? 'bg-white/[0.05] text-zinc-100'
                        : 'text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-200'
                    }`}
                  >
                    {active && (
                      <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-accent-indigo" />
                    )}
                    <span className="tracking-tight">{m.label}</span>
                    {active && <Check size={13} className="text-accent-indigo" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ----------------------------- Message ----------------------------- */

function Message({ msg, onOpenFile }) {
  const isUser = msg.role === 'user';
  return (
    <div className="flex gap-2.5 animate-fade-in">
      <div
        className={`shrink-0 h-6 w-6 rounded-md flex items-center justify-center border ${
          isUser
            ? 'border-line bg-ink-850 text-zinc-400'
            : 'border-emerald-500/20 bg-emerald-500/10 text-accent-emerald'
        }`}
      >
        {isUser ? <User size={13} /> : <Bot size={13} />}
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-2xs font-medium tracking-tight text-zinc-300">
            {isUser ? 'You' : msg.modelLabel || 'Agent'}
          </span>
          {msg.pending && (
            <span className="text-2xs text-zinc-600 animate-pulse-soft">
              thinking…
            </span>
          )}
        </div>

        {msg.images && msg.images.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {msg.images.map((im) => (
              <img
                key={im.id}
                src={im.url || `data:${im.mimeType};base64,${im.data}`}
                alt={im.name}
                className="h-20 w-20 object-cover rounded-md border border-line"
              />
            ))}
          </div>
        )}

        {msg.error ? (
          <div className="flex items-start gap-2 rounded-md border border-rose-500/20 bg-rose-500/[0.06] px-3 py-2 text-xs text-rose-200">
            <CircleAlert size={14} className="shrink-0 mt-0.5" />
            <pre className="whitespace-pre-wrap break-words font-sans">
              {msg.content}
            </pre>
          </div>
        ) : (
          msg.content && (
            <p className="text-xs leading-relaxed text-zinc-300 whitespace-pre-wrap break-words">
              {msg.content}
            </p>
          )
        )}

        {msg.files && msg.files.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {msg.files.map((f) => (
              <button
                key={f}
                onClick={() => onOpenFile(f)}
                className="group flex items-center gap-1.5 rounded-md border border-line bg-ink-850 pl-2 pr-2.5 h-6 text-2xs text-zinc-400 hover:text-zinc-100 hover:border-emerald-500/30 transition-all duration-200"
              >
                <FileCode2 size={11} className="text-emerald-400/70" />
                <span className="font-mono tracking-tight">{f}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ----------------------------- Panel ------------------------------- */

const WELCOME = {
  id: 'welcome',
  role: 'assistant',
  content:
    "I'm your coding agent. Describe what to build and I'll write files directly into the workspace — nested folders included. Set an API key (bottom-left) and pick a model above to begin.",
};

export default function AgentPanel() {
  const ws = useWorkspace();
  const { model, tree, applyAgentOutput, openFile } = ws;
  const [messages, setMessages] = useState([WELCOME]);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef(null);
  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);

  const addImageFiles = async (fileList) => {
    const files = Array.from(fileList || []).filter((f) =>
      f.type.startsWith('image/')
    );
    if (!files.length) return;
    const next = [];
    for (const f of files) {
      if (f.size > MAX_IMAGE_BYTES) {
        window.alert(`"${f.name}" is larger than 5 MB and was skipped.`);
        continue;
      }
      try {
        next.push(await readImageFile(f));
      } catch {
        /* skip unreadable file */
      }
    }
    setAttachments((prev) => [...prev, ...next].slice(0, MAX_ATTACHMENTS));
  };

  const removeAttachment = (id) =>
    setAttachments((prev) => prev.filter((a) => a.id !== id));

  const onPaste = (e) => {
    const imageItems = Array.from(e.clipboardData?.items || []).filter((i) =>
      i.type.startsWith('image/')
    );
    if (imageItems.length) {
      e.preventDefault();
      addImageFiles(imageItems.map((i) => i.getAsFile()).filter(Boolean));
    }
  };

  const meta = providerForModel(model);
  const modelLabel = meta?.models.find((m) => m.id === model)?.label;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const conversation = useMemo(
    () =>
      messages
        .filter((m) => m.id !== 'welcome' && !m.error && (m.content || m.images?.length))
        .map((m) => ({
          role: m.role,
          content: m.rawContent || m.content,
          ...(m.images?.length
            ? { images: m.images.map((im) => ({ mimeType: im.mimeType, data: im.data })) }
            : {}),
        })),
    [messages]
  );

  const send = async () => {
    const text = input.trim();
    const imgs = attachments;
    if ((!text && imgs.length === 0) || busy) return;

    const provider = providerForModel(model);
    const apiKey = getApiKey(provider?.id);

    const userMsg = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
      images: imgs.length ? imgs : undefined,
    };
    const pendingId = `a-${Date.now()}`;
    setMessages((m) => [
      ...m,
      userMsg,
      { id: pendingId, role: 'assistant', content: '', pending: true, modelLabel },
    ]);
    setInput('');
    setAttachments([]);
    setBusy(true);

    if (!apiKey) {
      setMessages((m) =>
        m.map((x) =>
          x.id === pendingId
            ? {
                ...x,
                pending: false,
                error: true,
                content: `No API key set for ${
                  provider?.label || 'this provider'
                }. Open the API Keys drawer (bottom-left) and add one.`,
              }
            : x
        )
      );
      setBusy(false);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const system = buildSystemPrompt(flattenFiles(tree));
      const priorMessages = [
        ...conversation,
        {
          role: 'user',
          content: text,
          ...(imgs.length
            ? { images: imgs.map((im) => ({ mimeType: im.mimeType, data: im.data })) }
            : {}),
        },
      ];
      const raw = await callModel({
        providerId: provider.id,
        model,
        apiKey,
        system,
        messages: priorMessages,
        maxTokens: maxTokensForModel(model),
        signal: controller.signal,
      });

      const result = applyAgentOutput(raw);
      const prose =
        stripFileBlocks(raw) ||
        (result.written.length
          ? `Updated ${result.written.length} file${
              result.written.length > 1 ? 's' : ''
            }.`
          : raw.trim() || '(empty response)');

      setMessages((m) =>
        m.map((x) =>
          x.id === pendingId
            ? {
                ...x,
                pending: false,
                content: prose,
                rawContent: raw,
                files: result.written,
                modelLabel,
              }
            : x
        )
      );
    } catch (err) {
      const aborted = err?.name === 'AbortError';
      setMessages((m) =>
        m.map((x) =>
          x.id === pendingId
            ? {
                ...x,
                pending: false,
                error: !aborted,
                content: aborted ? '(stopped)' : err.message || String(err),
              }
            : x
        )
      );
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const stop = () => {
    abortRef.current?.abort();
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="flex flex-col h-full bg-ink-900 border-l border-line">
      <div className="flex items-center justify-between h-10 px-3 border-b border-line shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles size={15} className="text-accent-indigo" />
          <span className="text-xs font-semibold tracking-tight text-zinc-200">
            Agent
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            title="Clear chat"
            onClick={() => setMessages([WELCOME])}
            className="p-1.5 rounded text-zinc-600 hover:text-zinc-200 hover:bg-white/[0.04] transition-colors"
          >
            <Trash2 size={13} />
          </button>
          <ModelSelector />
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto scrollbar-thin px-3 py-4 space-y-5"
      >
        {messages.map((m) => (
          <Message key={m.id} msg={m} onOpenFile={openFile} />
        ))}
      </div>

      <div className="p-3 border-t border-line shrink-0">
        <div className="rounded-lg border border-line bg-ink-850 focus-within:border-zinc-600 transition-colors">
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 px-2.5 pt-2.5">
              {attachments.map((a) => (
                <div key={a.id} className="relative group">
                  <img
                    src={a.url}
                    alt={a.name}
                    className="h-14 w-14 object-cover rounded-md border border-line"
                  />
                  <button
                    onClick={() => removeAttachment(a.id)}
                    title="Remove image"
                    className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-ink-950 border border-line flex items-center justify-center text-zinc-400 hover:text-rose-400 hover:border-rose-500/40 transition-colors"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            rows={2}
            placeholder="Ask the agent to build or edit files… (paste or attach images)"
            className="w-full resize-none bg-transparent outline-none px-3 py-2.5 text-xs leading-relaxed text-zinc-200 placeholder:text-zinc-600 scrollbar-thin"
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              addImageFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <div className="flex items-center justify-between px-2.5 pb-2">
            <div className="flex items-center gap-1.5">
              <button
                title="Attach image"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center h-6 w-6 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05] transition-colors"
              >
                <ImagePlus size={14} />
              </button>
              <span className="text-2xs text-zinc-600 tracking-tight">
                {meta?.label} · Enter to send
              </span>
            </div>
            {busy ? (
              <button
                onClick={stop}
                className="flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-rose-500/30 text-rose-300 text-2xs hover:bg-rose-500/10 transition-all duration-200"
              >
                <Square size={11} /> Stop
              </button>
            ) : (
              <button
                onClick={send}
                disabled={!input.trim() && attachments.length === 0}
                className="flex items-center gap-1 h-7 px-2.5 rounded-md bg-zinc-100 text-ink-950 text-2xs font-medium hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200"
              >
                Send <ArrowUp size={12} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
