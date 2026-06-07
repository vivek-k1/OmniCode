/**
 * bundler.js
 * A lightweight client-side "bundler" that turns the recursive virtual
 * workspace into a single self-contained HTML document for the sandbox iframe.
 *
 * Strategy
 * --------
 * 1. Flatten the tree into a { path: content } map.
 * 2. Pick an entry module (src/main.jsx, index.jsx, App.jsx, ...).
 * 3. Walk ES `import`/`export ... from`/dynamic-import statements to build a
 *    dependency graph, resolving relative specifiers against the virtual files
 *    (with extension + index resolution).
 * 4. Topologically order the modules and emit a runtime loader that:
 *      - transpiles each module with in-iframe Babel (JSX/TS),
 *      - rewrites relative specifiers to blob: URLs of already-built deps,
 *      - rewrites bare specifiers (react, etc.) to esm.sh ESM URLs,
 *      - dynamically imports the entry blob.
 * 5. Inject a console/error interception bridge that postMessages logs to the
 *    parent React app.
 *
 * If no JS entry exists but an index.html does, fall back to a vanilla HTML
 * preview with local <script>/<link> assets inlined.
 */

import { flattenFiles } from './fileTree.js';

const JS_EXT = ['.jsx', '.js', '.ts', '.tsx', '.mjs'];
const ENTRY_CANDIDATES = [
  'src/main.jsx',
  'src/main.js',
  'src/main.tsx',
  'src/index.jsx',
  'src/index.js',
  'src/index.tsx',
  'main.jsx',
  'main.js',
  'index.jsx',
  'index.js',
  'src/App.jsx',
  'src/App.js',
  'App.jsx',
  'App.js',
];

/** Matches the quoted specifier of import / export-from / dynamic import. */
const SPECIFIER_RE = /(\bfrom\s*|\bimport\s*|\bimport\(\s*)(['"])([^'"]+)(\2)/g;

/* ------------------------------------------------------------------ */
/* Module resolution                                                   */
/* ------------------------------------------------------------------ */

function dirname(path) {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}

function normalize(path) {
  const parts = [];
  for (const seg of path.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
}

/**
 * Resolve a relative specifier from `importer` against the file map.
 * Returns the matched path or null.
 */
export function resolveSpecifier(importer, specifier, files) {
  if (!specifier.startsWith('.') && !specifier.startsWith('/')) return null; // bare
  const base = specifier.startsWith('/')
    ? normalize(specifier.slice(1))
    : normalize(`${dirname(importer)}/${specifier}`);

  const candidates = [
    base,
    ...JS_EXT.map((e) => base + e),
    ...JS_EXT.map((e) => `${base}/index${e}`),
    `${base}.css`,
    `${base}.json`,
  ];
  for (const c of candidates) {
    if (Object.prototype.hasOwnProperty.call(files, c)) return c;
  }
  return null;
}

function extractSpecifiers(code) {
  const specs = [];
  SPECIFIER_RE.lastIndex = 0;
  let m;
  while ((m = SPECIFIER_RE.exec(code)) !== null) specs.push(m[3]);
  return specs;
}

/** Pick the most likely entry module from the file map. */
export function findEntry(files) {
  for (const cand of ENTRY_CANDIDATES) {
    if (Object.prototype.hasOwnProperty.call(files, cand)) return cand;
  }
  // First .jsx/.js file as a last resort.
  const js = Object.keys(files)
    .filter((p) => JS_EXT.some((e) => p.endsWith(e)))
    .sort();
  return js[0] || null;
}

/**
 * Build a dependency graph starting from `entry`.
 * @returns {{ order: string[], resolved: Record<string, Record<string,string>>, css: string[] }}
 */
export function buildGraph(entry, files) {
  const resolved = {};
  const visited = new Set();
  const order = [];
  const css = new Set();

  const visit = (path) => {
    if (visited.has(path)) return;
    visited.add(path);
    const code = files[path] ?? '';
    resolved[path] = {};

    for (const spec of extractSpecifiers(code)) {
      const target = resolveSpecifier(path, spec, files);
      if (!target) continue; // bare import -> handled at runtime via esm.sh
      if (target.endsWith('.css')) {
        css.add(target);
        continue;
      }
      resolved[path][spec] = target;
      visit(target);
    }
    order.push(path); // post-order => dependencies first
  };

  visit(entry);
  return { order, resolved, css: [...css] };
}

/* ------------------------------------------------------------------ */
/* Iframe document generation                                          */
/* ------------------------------------------------------------------ */

const CONSOLE_BRIDGE = `
(function () {
  var post = function (level, args) {
    try {
      var serialized = Array.prototype.map.call(args, function (a) {
        if (a instanceof Error) return a.stack || (a.name + ': ' + a.message);
        if (typeof a === 'object') {
          try { return JSON.stringify(a, null, 2); } catch (e) { return String(a); }
        }
        return String(a);
      });
      window.parent.postMessage(
        { __byok: true, kind: 'log', level: level, message: serialized.join(' '), time: Date.now() },
        '*'
      );
    } catch (e) { /* swallow */ }
  };
  ['log', 'info', 'warn', 'error', 'debug'].forEach(function (level) {
    var original = console[level] ? console[level].bind(console) : function () {};
    console[level] = function () { post(level, arguments); original.apply(console, arguments); };
  });
  window.onerror = function (message, source, line, col, error) {
    window.parent.postMessage(
      { __byok: true, kind: 'error', level: 'error',
        message: (error && error.stack) ? error.stack : String(message),
        source: source || '', line: line || 0, col: col || 0, time: Date.now() },
      '*'
    );
    return false;
  };
  window.addEventListener('unhandledrejection', function (e) {
    var reason = e.reason;
    window.parent.postMessage(
      { __byok: true, kind: 'error', level: 'error',
        message: 'Unhandled promise rejection: ' + ((reason && reason.stack) ? reason.stack : String(reason)),
        time: Date.now() },
      '*'
    );
  });
  window.parent.postMessage({ __byok: true, kind: 'ready', time: Date.now() }, '*');
})();
`;

const REACT_VERSION = '18.3.1';

function esmUrlHelper() {
  return `
    function __esm(spec) {
      if (spec === 'react') return 'https://esm.sh/react@${REACT_VERSION}';
      if (spec === 'react-dom') return 'https://esm.sh/react-dom@${REACT_VERSION}';
      if (spec === 'react-dom/client') return 'https://esm.sh/react-dom@${REACT_VERSION}/client';
      if (spec === 'react/jsx-runtime') return 'https://esm.sh/react@${REACT_VERSION}/jsx-runtime';
      if (spec.indexOf('react') === 0) return 'https://esm.sh/' + spec + '?deps=react@${REACT_VERSION},react-dom@${REACT_VERSION}';
      return 'https://esm.sh/' + spec;
    }
  `;
}

function escapeForScript(str) {
  // Keep code intact inside a <script type="application/json"> block.
  return String(str).replace(/<\/script>/gi, '<\\/script>');
}

/**
 * Generate the full HTML document for the iframe.
 * @returns {{ srcDoc: string, entry: string|null, mode: 'react'|'html'|'empty', cssCount: number }}
 */
export function bundle(tree) {
  const files = flattenFiles(tree);
  const entry = findEntry(files);

  // ----- No JS entry: try vanilla HTML -----
  if (!entry) {
    const htmlPath = Object.keys(files).find((p) => p.endsWith('.html'));
    if (htmlPath) {
      return {
        srcDoc: buildHtmlDoc(files, htmlPath),
        entry: htmlPath,
        mode: 'html',
        cssCount: Object.keys(files).filter((p) => p.endsWith('.css')).length,
      };
    }
    return { srcDoc: emptyDoc(), entry: null, mode: 'empty', cssCount: 0 };
  }

  // ----- JS / React module graph -----
  const { order, resolved, css } = buildGraph(entry, files);

  const moduleMap = {};
  for (const p of order) moduleMap[p] = files[p] ?? '';

  const cssBlocks = css
    .map((p) => `<style data-src="${p}">\n${files[p] || ''}\n</style>`)
    .join('\n');

  const payload = escapeForScript(
    JSON.stringify({ entry, order, resolved, files: moduleMap })
  );

  const srcDoc = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  html, body { margin: 0; background: #0c0c0e; color: #e4e4e7;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
  #root { min-height: 100vh; }
  #__byok_fatal { padding: 16px; font-family: 'JetBrains Mono', monospace;
    color: #fca5a5; white-space: pre-wrap; font-size: 13px; line-height: 1.6; }
</style>
${cssBlocks}
<script>${CONSOLE_BRIDGE}</script>
<script src="https://unpkg.com/@babel/standalone@7.25.6/babel.min.js"></script>
</head>
<body>
<div id="root"></div>
<script type="application/json" id="__byok_payload">${payload}</script>
<script>
(function () {
  ${esmUrlHelper()}
  var SPEC_RE = /(\\bfrom\\s*|\\bimport\\s*|\\bimport\\(\\s*)(['"])([^'"]+)(\\2)/g;

  function fatal(err) {
    var el = document.createElement('pre');
    el.id = '__byok_fatal';
    el.textContent = 'Sandbox build error:\\n\\n' + ((err && err.stack) ? err.stack : String(err));
    document.body.appendChild(el);
    try {
      window.parent.postMessage({ __byok: true, kind: 'error', level: 'error',
        message: 'Build error: ' + ((err && err.stack) ? err.stack : String(err)), time: Date.now() }, '*');
    } catch (e) {}
  }

  try {
    var data = JSON.parse(document.getElementById('__byok_payload').textContent);
    var blobs = {};

    function rewrite(path, code) {
      var map = data.resolved[path] || {};
      // Drop CSS imports (already injected as <style>).
      code = code.replace(/^\\s*import\\s+['"][^'"]+\\.css['"]\\s*;?\\s*$/gm, '');
      return code.replace(SPEC_RE, function (full, kw, q, spec) {
        if (Object.prototype.hasOwnProperty.call(map, spec) && blobs[map[spec]]) {
          return kw + q + blobs[map[spec]] + q;
        }
        if (spec.charAt(0) === '.' || spec.charAt(0) === '/') return full; // unresolved local
        return kw + q + __esm(spec) + q; // bare -> CDN ESM
      });
    }

    for (var i = 0; i < data.order.length; i++) {
      var path = data.order[i];
      var src = data.files[path] || '';
      var out;
      try {
        out = Babel.transform(src, {
          presets: [['react'], ['typescript', { allExtensions: true, isTSX: true }]],
          filename: path
        }).code;
      } catch (e) {
        throw new Error('Failed to compile ' + path + ':\\n' + (e.message || e));
      }
      out = rewrite(path, out);
      blobs[path] = URL.createObjectURL(new Blob([out], { type: 'text/javascript' }));
    }

    import(blobs[data.entry]).catch(fatal);
  } catch (e) {
    fatal(e);
  }
})();
</script>
</body>
</html>`;

  return { srcDoc, entry, mode: 'react', cssCount: css.length };
}

/* ------------------------------------------------------------------ */
/* Vanilla HTML fallback                                               */
/* ------------------------------------------------------------------ */

function buildHtmlDoc(files, htmlPath) {
  let html = files[htmlPath] || '';
  const baseDir = dirname(htmlPath);

  // Inline local <link rel="stylesheet" href="...">
  html = html.replace(
    /<link[^>]*href=["']([^"']+)["'][^>]*>/gi,
    (full, href) => {
      const p = normalize(`${baseDir}/${href}`.replace(/^\//, ''));
      const css = files[p] ?? files[href.replace(/^\.?\//, '')];
      return css != null ? `<style data-src="${p}">\n${css}\n</style>` : full;
    }
  );

  // Inline local <script src="...">
  html = html.replace(
    /<script[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi,
    (full, src) => {
      const p = normalize(`${baseDir}/${src}`.replace(/^\//, ''));
      const js = files[p] ?? files[src.replace(/^\.?\//, '')];
      return js != null ? `<script>\n${js}\n</script>` : full;
    }
  );

  const bridge = `<script>${CONSOLE_BRIDGE}</script>`;
  if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/<head[^>]*>/i, (m) => `${m}\n${bridge}`);
  } else if (/<html[^>]*>/i.test(html)) {
    html = html.replace(/<html[^>]*>/i, (m) => `${m}\n${bridge}`);
  } else {
    html = `${bridge}\n${html}`;
  }
  return html;
}

function emptyDoc() {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>
  html,body{height:100%;margin:0;display:flex;align-items:center;justify-content:center;
    background:#0c0c0e;color:#52525b;font-family:'JetBrains Mono',monospace;}
  .box{text-align:center;font-size:13px;letter-spacing:0.02em;}
  .box span{display:block;color:#3f3f46;margin-top:6px;font-size:11px;}
</style></head>
<body><div class="box">No runnable entry found
<span>Create src/main.jsx or index.html to preview</span></div>
<script>${CONSOLE_BRIDGE}</script></body></html>`;
}
