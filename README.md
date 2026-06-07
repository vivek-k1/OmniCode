# OmniCode · AI Coding Workspace & Web Sandbox

A premium, bring-your-own-key web IDE and AI coding agent — a Cursor / Bolt.new-style
sandbox that runs entirely in the browser. Generate nested React projects with an AI
agent, edit them in a tabbed editor, and run them live in an isolated iframe with full
console + error interception.

## Features

- **Multi-provider agent** — OpenAI, Anthropic, and Google Gemini. Switch models from a
  premium dropdown; payloads are formatted per each vendor's API contract.
- **Recursive virtual file tree** — arbitrary nested folders, created/edited by the AI
  via a `[FILE: path] ... [END_FILE]` protocol that the parser resolves into the tree.
- **Client-side bundler** — resolves ES `import` graphs across your virtual files,
  transpiles JSX/TS in-iframe, wires modules together via blob URLs, and loads npm
  packages (e.g. `react`, `lucide-react`) from a CDN.
- **VS Code-style dock** — resizable bottom panel with **Output** (intercepted
  `console.*` + errors), **Problems** (parsed runtime stack traces), and a simulated
  **Terminal**.
- **Live preview** — sandboxed `<iframe>` that postMessages logs back to the app.

## Getting started

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build into dist/
```

## Bring your own key

Open the **API Keys** drawer (bottom-left of the explorer) and paste a key for any
provider. Keys are stored only in this browser's `localStorage`
(`byok_openai_key`, `byok_anthropic_key`, `byok_gemini_key`) and are sent directly to the
provider — never to any server.

> Note: provider APIs are called directly from the browser. Anthropic requires the
> `anthropic-dangerous-direct-browser-access` header (already set). Some providers may
> require a CORS-friendly setup depending on their current policy.

## Architecture

| File | Responsibility |
| --- | --- |
| `src/context/WorkspaceContext.jsx` | Unified state: file tree, tabs, logs, problems, model settings |
| `src/lib/fileTree.js` | Immutable recursive tree CRUD helpers |
| `src/lib/parser.js` | Parses `[FILE: ...]` directives (deep paths) and writes them into the tree |
| `src/lib/bundler.js` | Dependency-graph resolver → self-contained sandbox HTML |
| `src/lib/providers.js` | Provider/model registry + unified `callModel` |
| `src/lib/systemPrompt.js` | Agent instructions for the file-write protocol |
| `src/components/Sidebar.jsx` | File explorer + API keys drawer |
| `src/components/EditorPanel.jsx` | Tabbed editor with line numbers + breadcrumbs |
| `src/components/Preview.jsx` | Sandboxed iframe preview |
| `src/components/DockPanel.jsx` | Terminal / Problems / Output dock |
| `src/components/AgentPanel.jsx` | Chat + model selector |
| `src/App.jsx` | Layout shell |

## The agent file protocol

The agent is instructed to emit full files like this:

```
[FILE: src/components/Button.jsx]
export default function Button() { return <button>Hi</button>; }
[END_FILE]
```

The parser splits the path, recursively creates parent folders, and writes/overwrites the
target file. Truncated/streamed responses degrade gracefully.
```
