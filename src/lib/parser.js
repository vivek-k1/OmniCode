/**
 * parser.js
 * Extracts file-write directives from raw LLM output and applies them to the
 * recursive virtual workspace.
 *
 * Directive syntax the agent is instructed to emit:
 *
 *   [FILE: src/components/Button.jsx]
 *   ...code content...
 *   [END_FILE]
 *
 * The parser is intentionally forgiving so that partial / streaming / truncated
 * model responses degrade gracefully instead of throwing:
 *   - A trailing block missing its [END_FILE] is still captured (and flagged).
 *   - Code fences (``` ... ```) wrapping the block content are stripped.
 *   - Whitespace and casing around the directives are tolerated.
 */

import { upsertFile, splitPath } from './fileTree.js';

const FILE_OPEN = /\[FILE:\s*([^\]\n]+?)\s*\]/gi;
const FILE_END = /\[END_FILE\]/i;

/**
 * Parse raw text into an ordered list of file blocks.
 * @returns {Array<{ path: string, content: string, complete: boolean }>}
 */
export function parseFileBlocks(raw) {
  if (!raw || typeof raw !== 'string') return [];

  const blocks = [];
  FILE_OPEN.lastIndex = 0;
  let match;

  while ((match = FILE_OPEN.exec(raw)) !== null) {
    const rawPath = match[1];
    const path = sanitizePath(rawPath);
    if (!path) continue;

    const contentStart = match.index + match[0].length;
    // Find the next END_FILE after this opening tag.
    const rest = raw.slice(contentStart);
    const endMatch = FILE_END.exec(rest);

    let content;
    let complete;
    if (endMatch) {
      content = rest.slice(0, endMatch.index);
      complete = true;
      // Advance the outer regex past this block to avoid nested re-parsing.
      FILE_OPEN.lastIndex = contentStart + endMatch.index + endMatch[0].length;
    } else {
      // No closing tag — capture everything that remains (truncated stream).
      // Stop if another [FILE: appears (defensive against malformed output).
      const nextOpen = /\[FILE:\s*[^\]\n]+\]/i.exec(rest);
      content = nextOpen ? rest.slice(0, nextOpen.index) : rest;
      complete = false;
    }

    blocks.push({
      path,
      content: cleanContent(content),
      complete,
    });
  }

  return dedupeByPath(blocks);
}

/** Keep only the last block per path (later writes win), preserving order. */
function dedupeByPath(blocks) {
  const lastIndex = new Map();
  blocks.forEach((b, i) => lastIndex.set(b.path, i));
  return blocks.filter((b, i) => lastIndex.get(b.path) === i);
}

/** Normalize and harden a model-provided path. */
export function sanitizePath(rawPath) {
  if (!rawPath) return '';
  let p = String(rawPath).trim();
  // Strip surrounding quotes / backticks the model may add.
  p = p.replace(/^["'`]+|["'`]+$/g, '');
  // Strip a leading ./ or /
  p = p.replace(/^\.?\//, '');
  // Block path traversal.
  const segments = splitPath(p).filter((s) => s !== '..');
  return segments.join('/');
}

/** Strip a wrapping code fence and trim leading/trailing blank lines. */
function cleanContent(content) {
  if (!content) return '';
  let c = content.replace(/^\r?\n/, '').replace(/\r?\n\s*$/, '');

  // Remove a single wrapping fenced code block: ```lang ... ```
  const fence = /^\s*```[^\n]*\n([\s\S]*?)\n?```\s*$/;
  const m = fence.exec(c);
  if (m) c = m[1];

  return c.replace(/\r\n/g, '\n');
}

/**
 * Apply parsed blocks onto a tree, recursively creating parent folders.
 * @returns {{ tree, written: string[], skipped: string[] }}
 */
export function applyBlocksToTree(tree, blocks) {
  let next = tree;
  const written = [];
  const skipped = [];

  for (const block of blocks) {
    if (!block.path) {
      skipped.push(block.path);
      continue;
    }
    next = upsertFile(next, block.path, block.content);
    written.push(block.path);
  }

  return { tree: next, written, skipped };
}

/**
 * Convenience: parse raw text and apply directly to a tree.
 * @returns {{ tree, written: string[], blocks }}
 */
export function applyLLMOutput(tree, raw) {
  const blocks = parseFileBlocks(raw);
  const { tree: next, written } = applyBlocksToTree(tree, blocks);
  return { tree: next, written, blocks };
}

/**
 * Remove file directives from raw text, leaving the model's prose so the chat
 * bubble shows a clean explanation instead of dumping code twice.
 */
export function stripFileBlocks(raw) {
  if (!raw) return '';
  let out = '';
  FILE_OPEN.lastIndex = 0;
  let lastEnd = 0;
  let match;

  while ((match = FILE_OPEN.exec(raw)) !== null) {
    out += raw.slice(lastEnd, match.index);
    const contentStart = match.index + match[0].length;
    const rest = raw.slice(contentStart);
    const endMatch = FILE_END.exec(rest);
    if (endMatch) {
      lastEnd = contentStart + endMatch.index + endMatch[0].length;
      FILE_OPEN.lastIndex = lastEnd;
    } else {
      lastEnd = raw.length;
      break;
    }
  }
  out += raw.slice(lastEnd);
  return out.replace(/\n{3,}/g, '\n\n').trim();
}
