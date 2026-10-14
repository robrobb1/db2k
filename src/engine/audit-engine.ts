import { ext, resolve, norm } from './project-engine.ts';

const TEXT_EXTENSIONS = new Set([
  'html', 'htm', 'css', 'js', 'mjs', 'cjs', 'jsx', 'tsx', 'ts', 'json',
  'txt', 'md', 'xml', 'svg', 'py', 'php', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'sql'
]);
const CODE_EXTENSIONS = new Set(['js', 'mjs', 'cjs', 'jsx', 'tsx', 'ts']);
const SCORE_WEIGHT = { critical: 18, error: 10, warning: 4, info: 0 } as const;
const CONFIDENCE_FACTOR = { high: 1, medium: 0.5, low: 0 } as const;
const EXTERNAL_REF = /^(?:[a-z]+:|#|\/\/)/i;

function lineOf(text: string, index: number): number {
  return text.slice(0, Math.max(0, index || 0)).split('\n').length;
}

function escapeRegExp(value: string): string {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanRef(value: string): string {
  return String(value || '').split('#')[0].split('?')[0];
}

function makeId(): string {
  return (globalThis as any).crypto?.randomUUID?.() ||
    `audit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function commentsOnly(text: string) {
  return [...String(text || '').matchAll(/<!--[\s\S]*?-->|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g)].map(m => ({
    text: m[0],
    index: m.index || 0
  }));
}

function stripJsStringsComments(text: string): string {
  const source = String(text || '');
  const chars = [...source];
  let quote = '';
  let lineComment = false;
  let blockComment = false;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];
    if (lineComment) {
      if (ch === '\n') lineComment = false;
      else chars[i] = ' ';
      continue;
    }
    if (blockComment) {
      chars[i] = ch === '\n' ? '\n' : ' ';
      if (ch === '*' && next === '/') {
        chars[i + 1] = ' ';
        blockComment = false;
        i++;
      }
      continue;
    }
    if (quote) {
      chars[i] = ch === '\n' ? '\n' : ' ';
      if (ch === '\\') {
        if (i + 1 < chars.length) {
          chars[i + 1] = source[i + 1] === '\n' ? '\n' : ' ';
          i++;
        }
        continue;
      }
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '/' && next === '/') {
      chars[i] = chars[i + 1] = ' ';
      lineComment = true;
      i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      chars[i] = chars[i + 1] = ' ';
      blockComment = true;
      i++;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      chars[i] = ' ';
      quote = ch;
      continue;
    }
  }
  return chars.join('');
}

export interface Finding {
  checkId: string;
  severity: 'critical' | 'error' | 'warning' | 'info';
  confidence: 'high' | 'medium' | 'low';
  title: string;
  plain: string;
  technical: string;
  file: string;
  line: number | null;
  scoreImpact: boolean;
  count?: number;
  lines?: number[];
  extraTechnical?: string[];
}

interface AuditContext {
  findings: Finding[];
  keys: Map<string, Finding>;
  good: Set<string>;
  ranChecks: Set<string>;
  failedChecks: Set<string>;
  reviewChecks: Set<string>;
}

function addFinding(ctx: AuditContext, item: Finding) {
  const key = `${item.checkId}|${item.file}|${item.title}|${item.scoreImpact === false ? 'review' : 'issue'}`;
  const existing = ctx.keys.get(key);
  if (existing) {
    existing.count = (existing.count || 1) + 1;
    existing.lines = existing.lines || [];
    if (item.line && !existing.lines.includes(item.line)) existing.lines.push(item.line);
    if (item.technical && item.technical !== existing.technical) {
      existing.extraTechnical = existing.extraTechnical || [];
      if (!existing.extraTechnical.includes(item.technical) && existing.extraTechnical.length < 8) {
        existing.extraTechnical.push(item.technical);
      }
    }
    return;
  }
  item.count = 1;
  item.lines = item.line ? [item.line] : [];
  ctx.keys.set(key, item);
  ctx.findings.push(item);
  ctx.failedChecks.add(item.checkId);
  if (item.confidence === 'low' || item.scoreImpact === false) {
    ctx.reviewChecks.add(item.checkId);
  }
}

function ran(ctx: AuditContext, id: string) { ctx.ranChecks.add(id); }
function good(ctx: AuditContext, id: string, message: string) {
  ran(ctx, id);
  if (message && !ctx.failedChecks.has(id)) ctx.good.add(message);
}
function issue(
  ctx: AuditContext,
  id: string,
  severity: 'critical' | 'error' | 'warning' | 'info',
  confidence: 'high' | 'medium' | 'low',
  title: string,
  plain: string,
  technical: string,
  file = '',
  line: number | null = null,
  scoreImpact = true
) {
  ran(ctx, id);
  addFinding(ctx, { checkId: id, severity, confidence, title, plain, technical, file, line, scoreImpact });
}

function localReference(value: string): boolean {
  return !!value && !EXTERNAL_REF.test(value) && !/^\s*$/.test(value);
}

function pathCandidates(path: string): string[] {
  const clean = norm(cleanRef(path));
  if (!clean) return [];
  const e = ext(clean);
  if (e) return [clean];
  return [
    clean,
    `${clean}.js`, `${clean}.mjs`, `${clean}.cjs`, `${clean}.jsx`, `${clean}.ts`, `${clean}.tsx`, `${clean}.json`, `${clean}.css`,
    `${clean}/index.js`, `${clean}/index.mjs`, `${clean}/index.jsx`, `${clean}/index.ts`, `${clean}/index.tsx`, `${clean}/index.json`
  ];
}

function findPath(files: Map<string, File>, path: string) {
  const names = [...files.keys()];
  const lower = new Map(names.map(n => [norm(n).toLowerCase(), n]));
  for (const candidate of pathCandidates(path)) {
    if (files.has(candidate)) return { found: true, name: candidate, caseMismatch: false };
    const actual = lower.get(candidate.toLowerCase());
    if (actual) return { found: true, name: actual, caseMismatch: actual !== candidate };
  }
  return { found: false, name: '', caseMismatch: false };
}

function visibleTextFromHtml(text: string): string {
  try {
    const doc = new DOMParser().parseFromString(text, 'text/html');
    doc.querySelectorAll('script,style,template,noscript').forEach(x => x.remove());
    return (doc.body?.textContent || '').replace(/\s+/g, ' ').trim();
  } catch {
    return '';
  }
}

function auditGeneral(name: string, text: string, ctx: AuditContext) {
  const executable = CODE_EXTENSIONS.has(ext(name)) ? stripJsStringsComments(text) : text;
  ran(ctx, 'general.empty-file');
  if (!text.trim()) {
    issue(ctx, 'general.empty-file', 'warning', 'high', 'This file is empty', 'There is nothing inside this file. If the app needs it, that part cannot work.', 'The file contains no non-whitespace text.', name, 1);
  }

  ran(ctx, 'general.merge-marker');
  const merge = text.match(/^(<<<<<<<|=======|>>>>>>>)(?:\s|$)/m);
  if (merge) {
    issue(ctx, 'general.merge-marker', 'critical', 'high', 'A code merge was left unfinished', 'Two versions of the code were combined, but the conflict was never cleaned up. The app may not even start.', 'Unresolved source-control conflict marker detected.', name, lineOf(text, merge.index || 0));
  }

  ran(ctx, 'general.debugger');
  const dbg = executable.match(/^\s*debugger\s*;?\s*$/m);
  if (dbg) {
    issue(ctx, 'general.debugger', 'warning', 'high', 'A developer pause command is still in the code', 'This command can suddenly stop the app when developer tools are open. It should not be left in finished code.', 'Standalone debugger statement detected.', name, lineOf(text, dbg.index || 0));
  }

  ran(ctx, 'general.console-log');
  const logs = [...executable.matchAll(/(^|[^.\w])console\.log\s*\(/gm)];
  if (logs.length) {
    issue(ctx, 'general.console-log', 'info', 'medium', 'Some developer log messages are still in the code', `I found ${logs.length} console.log message${logs.length === 1 ? '' : 's'}. These are usually harmless, but finished code is cleaner without leftover test messages.`, `${logs.length} console.log call(s) detected.`, name, lineOf(text, logs[0].index || 0), false);
  }

  ran(ctx, 'general.alert');
  const alerts = [...executable.matchAll(/(^|[^.\w])alert\s*\(/gm)];
  if (alerts.length) {
    issue(ctx, 'general.alert', 'info', 'low', 'The code uses a browser pop-up message', `I found ${alerts.length} alert pop-up${alerts.length === 1 ? '' : 's'}. This may be intentional, so I am only pointing it out for review.`, `${alerts.length} alert() call(s) detected.`, name, lineOf(text, alerts[0].index || 0), false);
  }

  ran(ctx, 'general.placeholder');
  const placeholders = [];
  for (const m of commentsOnly(text)) {
    if (/\b(TODO|FIXME|XXX|HACK|PLACEHOLDER)\b|lorem\s+ipsum|test123|asdf/i.test(m.text)) placeholders.push(m);
  }
  if (placeholders.length) {
    issue(ctx, 'general.placeholder', 'info', 'low', 'A note says some work may still be unfinished', 'I found a developer note such as TODO, FIXME, or placeholder text. It may be intentional, so it does not lower the score.', 'Developer placeholder marker found in a comment.', name, lineOf(text, placeholders[0].index), false);
  }

  ran(ctx, 'general.known-secret');
  const secretPatterns = [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bAIza[0-9A-Za-z_-]{30,}\b/,
    /\bgh[pousr]_[0-9A-Za-z]{30,}\b/,
    /\bgithub_pat_[0-9A-Za-z_]{30,}\b/,
    /\bxox[baprs]-[0-9A-Za-z-]{20,}\b/,
    /\bsk-(?:proj-)?[0-9A-Za-z_-]{20,}\b/
  ];
  const secret = secretPatterns.map(re => text.match(re)).find(Boolean);
  if (secret) {
    issue(ctx, 'general.known-secret', 'critical', 'high', 'A private key or secret may be inside the project', 'This looks like a real secret key. Anyone who receives the project could possibly use it. Move secrets out of the front-end files and replace the exposed key.', 'Recognized credential pattern detected in source text.', name, lineOf(text, secret.index || 0));
  }

  ran(ctx, 'general.localhost');
  const local = text.match(/https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/i);
  if (local) {
    issue(ctx, 'general.localhost', 'info', 'low', 'The code points to this computer only', 'I found a localhost address. That works only on the same computer unless the app replaces it for production. I am not calling it broken automatically.', 'Local development URL detected.', name, lineOf(text, local.index || 0), false);
  }
}

function parseHtml(text: string): Document | null {
  try { return new DOMParser().parseFromString(text, 'text/html'); } catch { return null; }
}

function auditHtml(name: string, text: string, ctx: AuditContext) {
  const doc = parseHtml(text);
  const lower = text.toLowerCase();

  ran(ctx, 'html.doctype');
  if (!/^\s*<!doctype\s+html/i.test(text)) {
    issue(ctx, 'html.doctype', 'info', 'medium', 'This page does not start with the normal HTML document line', 'Most modern web pages start with <!doctype html>. Without it, browsers can use an older layout mode.', 'Missing HTML5 doctype.', name, 1, false);
  }

  ran(ctx, 'html.lang');
  if (doc && !doc.documentElement.getAttribute('lang')) {
    issue(ctx, 'html.lang', 'info', 'medium', 'The page does not say what language it uses', 'Screen readers and translation tools work better when the page says its language, such as lang="en".', 'Missing lang attribute on <html>.', name, lineOf(text, lower.indexOf('<html')), false);
  }

  ran(ctx, 'html.charset');
  if (!/<meta\b[^>]*charset\s*=/i.test(text)) {
    issue(ctx, 'html.charset', 'warning', 'medium', 'The page does not clearly set its text character format', 'Without a charset setting, unusual letters and symbols can display incorrectly in some situations.', 'No <meta charset> declaration found.', name, 1);
  }

  ran(ctx, 'html.viewport');
  if (!/<meta\b[^>]*name\s*=\s*["']viewport["']/i.test(text)) {
    issue(ctx, 'html.viewport', 'warning', 'medium', 'This page may not size correctly on phones', 'The page is missing the normal mobile viewport setting, so a phone may show it zoomed out or at the wrong width.', 'Missing viewport meta tag.', name, 1);
  }

  ran(ctx, 'html.title');
  const title = (doc?.querySelector('title')?.textContent || text.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').trim();
  if (!title) {
    issue(ctx, 'html.title', 'info', 'medium', 'The browser tab has no page name', 'The page does not have a useful <title>. The site can still run, but the browser tab will be unclear.', 'Missing or empty <title>.', name, 1, false);
  }

  ran(ctx, 'html.duplicate-id');
  const ids = new Map<string, number[]>();
  if (doc) {
    for (const el of doc.querySelectorAll('[id]')) {
      const id = el.id;
      if (!id) continue;
      const pos = text.search(new RegExp(`\\bid\\s*=\\s*["']${escapeRegExp(id)}["']`, 'i'));
      ids.set(id, (ids.get(id) || []).concat(lineOf(text, pos)));
    }
  }
  const duplicateIds = [...ids.entries()].filter(([, lines]) => lines.length > 1);
  if (duplicateIds.length) {
    const [id, lines] = duplicateIds[0];
    issue(ctx, 'html.duplicate-id', 'error', 'high', 'Two parts of the page use the same ID', `The ID "${id}" is used more than once. A button or script can grab the wrong part of the page because IDs are supposed to be unique.`, duplicateIds.slice(0, 12).map(([val, list]) => `${val}: ${list.length} times`).join('\n'), name, lines[0]);
  }

  ran(ctx, 'html.missing-alt');
  const imgs = doc ? [...doc.querySelectorAll('img')] : [];
  const missingAlt = imgs.filter(img => !img.hasAttribute('alt'));
  if (missingAlt.length) {
    const src = missingAlt[0].getAttribute('src') || '';
    const idx = src ? text.indexOf(src) : text.search(/<img\b/i);
    issue(ctx, 'html.missing-alt', 'warning', 'high', 'Some pictures have no text description', `${missingAlt.length} picture${missingAlt.length === 1 ? ' has' : 's have'} no alt description. People using screen readers may not know what the picture is.`, `${missingAlt.length} <img> element(s) without an alt attribute.`, name, lineOf(text, idx));
  }

  ran(ctx, 'html.empty-src');
  const emptySrc = doc ? [...doc.querySelectorAll('[src]')].filter(el => !String(el.getAttribute('src') || '').trim()) : [];
  if (emptySrc.length) {
    issue(ctx, 'html.empty-src', 'warning', 'high', 'Something on the page has an empty file address', 'A picture, script, frame, or other item says src="". The browser may request the current page again instead of the file you expected.', 'Element with an empty src attribute detected.', name, lineOf(text, text.search(/\bsrc\s*=\s*["']\s*["']/i)));
  }

  ran(ctx, 'html.visible-placeholder');
  const visible = visibleTextFromHtml(text);
  if (/lorem\s+ipsum|\btest123\b|\bplaceholder\s+text\b/i.test(visible)) {
    issue(ctx, 'html.visible-placeholder', 'warning', 'medium', 'Test text may still be visible on the page', 'The page contains text that looks like a temporary placeholder. Check that a user is supposed to see it.', 'Placeholder-like text detected in rendered HTML text.', name, 1);
  }
}

function extractCssBlocks(text: string) {
  const blocks: Array<{ selector: string; body: string; index: number }> = [];
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf('{', i);
    if (open < 0) break;
    let start = open - 1;
    while (start >= 0 && text[start] !== '}' && text[start] !== ';' && text[start] !== '{') start--;
    const selector = text.slice(start + 1, open).trim();
    let depth = 1;
    let j = open + 1;
    let quote = '';
    let comment = false;
    for (; j < text.length && depth > 0; j++) {
      const ch = text[j];
      const next = text[j + 1];
      if (comment) {
        if (ch === '*' && next === '/') { comment = false; j++; }
        continue;
      }
      if (!quote && ch === '/' && next === '*') { comment = true; j++; continue; }
      if (quote) {
        if (ch === '\\') { j++; continue; }
        if (ch === quote) quote = '';
        continue;
      }
      if (ch === '"' || ch === "'") { quote = ch; continue; }
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
    }
    if (depth === 0 && selector && !selector.startsWith('@')) {
      blocks.push({ selector, body: text.slice(open + 1, j - 1), index: start + 1 });
    }
    i = Math.max(j, open + 1);
  }
  return blocks;
}

function auditCss(name: string, text: string, ctx: AuditContext) {
  ran(ctx, 'css.brace-balance');
  const clean = text.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const opens = (clean.match(/\{/g) || []).length;
  const closes = (clean.match(/\}/g) || []).length;
  if (opens !== closes) {
    issue(ctx, 'css.brace-balance', 'critical', 'high', 'The design code has a missing or extra bracket', 'A { or } bracket does not have its partner. Styles after that point can stop working or land in the wrong rule.', `${opens} opening brace(s) and ${closes} closing brace(s).`, name, 1);
  }

  ran(ctx, 'css.comment-balance');
  const openComments = (text.match(/\/\*/g) || []).length;
  const closeComments = (text.match(/\*\//g) || []).length;
  if (openComments !== closeComments) {
    issue(ctx, 'css.comment-balance', 'critical', 'high', 'A design-code comment was not closed', 'A /* comment starts but does not have the matching */ ending, or there is an extra ending. The browser can ignore a large part of the CSS after it.', `${openComments} comment start(s), ${closeComments} comment end(s).`, name, 1);
  }
}

function babelAst(name: string, text: string) {
  const Babel = (globalThis as any).Babel;
  if (typeof Babel === 'undefined') return { ast: null, error: null, unavailable: true };
  const e = ext(name);
  const presets: any[] = [];
  if (e === 'ts' || e === 'tsx') presets.push(['typescript', { allExtensions: true, isTSX: e === 'tsx' }]);
  if (e === 'jsx' || e === 'tsx') presets.push(['react', { runtime: 'automatic' }]);
  try {
    const result = Babel.transform(text, {
      filename: name,
      ast: true,
      code: false,
      sourceType: 'unambiguous',
      presets,
      parserOpts: {
        allowReturnOutsideFunction: true,
        plugins: (e === 'js' || e === 'mjs' || e === 'cjs') ? ['jsx'] : []
      }
    });
    return { ast: result.ast, error: null, unavailable: false };
  } catch (error) {
    return { ast: null, error, unavailable: false };
  }
}

function auditJs(name: string, text: string, ctx: AuditContext) {
  const executable = stripJsStringsComments(text);
  const parsed = babelAst(name, text);

  ran(ctx, 'js.syntax');
  if (parsed.error) {
    const message = String((parsed.error as any)?.message || parsed.error).replace(/^.*:\s*/, '');
    const line = (parsed.error as any)?.loc?.line || null;
    issue(ctx, 'js.syntax', 'critical', 'high', 'The browser cannot read one of the code files', 'This file has a real JavaScript or TypeScript syntax error. Code in this file cannot run until the syntax is fixed.', message, name, line);
  }

  ran(ctx, 'js.eval');
  const evalCall = executable.match(/\beval\s*\(|\bnew\s+Function\s*\(/);
  if (evalCall) {
    issue(ctx, 'js.eval', 'warning', 'high', 'The app builds code from text while it is running', 'eval() or new Function() can create security problems and makes code much harder to inspect safely.', 'Dynamic code execution detected.', name, lineOf(text, evalCall.index || 0));
  }
}

function auditJson(name: string, text: string, ctx: AuditContext) {
  ran(ctx, 'json.syntax');
  try {
    JSON.parse(text);
  } catch (error: any) {
    issue(ctx, 'json.syntax', 'critical', 'high', 'A JSON file is not valid', 'The app cannot reliably read this settings/data file because its commas, quotes, brackets, or other JSON syntax are broken.', String(error?.message || error), name, 1);
  }
}

function auditCrossProject(files: Map<string, File>, texts: Map<string, string>, ctx: AuditContext) {
  const htmlEntries = [...texts].filter(([name]) => /\.html?$/i.test(name));
  const codeEntries = [...texts].filter(([name]) => CODE_EXTENSIONS.has(ext(name)));
  const cssEntries = [...texts].filter(([name]) => ext(name) === 'css');

  ran(ctx, 'project.case-collision');
  const byLower = new Map<string, string[]>();
  for (const name of files.keys()) {
    const key = norm(name).toLowerCase();
    if (!byLower.has(key)) byLower.set(key, []);
    byLower.get(key)!.push(name);
  }
  const collisions = [...byLower.values()].filter(group => new Set(group).size > 1);
  if (collisions.length) {
    issue(ctx, 'project.case-collision', 'warning', 'high', 'Two files have names that differ only by capital letters', 'Some computers treat these as different files and others do not. That can make a build work on one computer and fail on another.', collisions.slice(0, 12).map(g => g.join(' <> ')).join('\n'), collisions[0][0], 1);
  }

  ran(ctx, 'project.zero-byte-file');
  const emptyBinary = [...files].filter(([name, file]) => (file.size || 0) === 0 && !TEXT_EXTENSIONS.has(ext(name))).map(([name]) => name);
  if (emptyBinary.length) {
    issue(ctx, 'project.zero-byte-file', 'warning', 'high', 'A non-text project file is completely empty', 'An image, font, PDF, ZIP, or other binary file has zero bytes. If the app uses it, there is nothing inside for the browser to load.', emptyBinary.slice(0, 15).join('\n'), emptyBinary[0], 1);
  }

  ran(ctx, 'project.html-reference');
  for (const [name, text] of htmlEntries) {
    for (const m of text.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
      const ref = cleanRef(m[1]);
      if (!localReference(ref) || ref === '' || ref.startsWith('#')) continue;
      const target = resolve(name, ref);
      const found = findPath(files, target);
      if (!found.found) {
        issue(ctx, 'project.html-reference', 'error', 'high', 'A page points to a local file that is missing', `The page asks for "${ref}", but that file is not in the project. A picture, stylesheet, script, or page link can fail because of this.`, `Missing local reference: ${name} -> ${ref} (resolved as ${target})`, name, lineOf(text, m.index || 0));
      }
    }
  }

  ran(ctx, 'project.css-reference');
  for (const [name, text] of cssEntries) {
    for (const m of text.matchAll(/url\(\s*["']?([^'")\s]+)["']?\s*\)/gi)) {
      const ref = cleanRef(m[1]);
      if (!localReference(ref) || ref.startsWith('#')) continue;
      const target = resolve(name, ref);
      const found = findPath(files, target);
      if (!found.found) {
        issue(ctx, 'project.css-reference', 'warning', 'high', 'A design file points to an image or font that is missing', `The CSS asks for "${ref}", but that local file is not in the project. The page may lose an image, icon, or font.`, `Missing CSS url(): ${name} -> ${ref} (resolved as ${target})`, name, lineOf(text, m.index || 0));
      }
    }
  }
}

function mergeRuntime(
  ctx: AuditContext,
  runtimeErrors: any[] = [],
  compileErrors: any[] = [],
  liveFindings: any[] = [],
  liveCheckIds: string[] = []
) {
  for (const id of liveCheckIds || []) if (id) ran(ctx, id);

  ran(ctx, 'runtime.javascript-error');
  for (const x of runtimeErrors || []) {
    const kind = x.kind || 'javascript-error';
    const message = String(x.message || 'Unknown JavaScript error');
    const source = x.file || x.filename || 'running page';
    const line = x.line || null;

    if (kind === 'resource-error') {
      issue(ctx, 'runtime.resource-error', x.local ? 'error' : 'info', x.local ? 'high' : 'low', x.local ? 'The running page could not load one of its own files' : 'An outside file did not load in the preview', x.local ? 'The page tried to load a local script, stylesheet, image, or other project file and the browser reported that it failed.' : 'The preview could not load a file from an outside website. Network rules, CORS, or the sandbox can cause this, so it does not lower the score.', message, source, line, x.local !== false);
      continue;
    }
    if (kind === 'console-error') {
      issue(ctx, 'runtime.console-error', 'info', 'low', 'The running page wrote an error message to the browser console', 'The app itself called console.error while it was running. Some projects use this for diagnostics, so I show it for review but do not lower the score unless the browser also reports a real runtime failure.', message, source, line, false);
      continue;
    }
    if (kind === 'network-error') {
      issue(ctx, 'runtime.network-error', x.local ? 'error' : 'info', x.local ? 'high' : 'low', x.local ? 'A local request failed while the page was running' : 'An outside internet request failed in the preview', x.local ? 'The app tried to reach one of its own local files or routes and the request failed.' : 'The page could not reach an outside service in this preview. Sandboxes, missing login, CORS, or no internet can cause this, so it does not lower the score automatically.', message, source, line, x.local);
      continue;
    }
    issue(ctx, 'runtime.javascript-error', 'error', 'high', kind === 'unhandled-promise-rejection' ? 'A background JavaScript task failed without being handled' : 'JavaScript crashed while the page was running', `The page opened, but the browser reported a real error: "${message}". A feature that depends on this code may stop working.`, message, source, line);
  }
  if (!runtimeErrors.length) {
    good(ctx, 'runtime.javascript-error', 'The running page did not report a JavaScript crash during this audit.');
  }

  ran(ctx, 'compile.error');
  for (const x of compileErrors || []) {
    issue(ctx, 'compile.error', 'critical', 'high', 'A source file could not be compiled', 'The viewer could not turn one of the source files into browser code. The preview may be incomplete until this compile error is fixed.', String(x.message || 'Compile error'), x.file || 'unknown', x.line || null);
  }
  if (!compileErrors.length) {
    good(ctx, 'compile.error', 'The files that needed browser compilation did not report a compile error.');
  }

  for (const x of liveFindings || []) {
    if (!x?.checkId) continue;
    issue(ctx, x.checkId, x.severity || 'info', x.confidence || 'low', x.title || 'Live page check', x.plain || '', x.technical || '', x.file || '', x.line || null, x.scoreImpact !== false);
  }
}

function calculateScore(ctx: AuditContext): number {
  const byCheck = new Map<string, number>();
  for (const item of ctx.findings) {
    if (item.scoreImpact === false) continue;
    const factor = CONFIDENCE_FACTOR[item.confidence] ?? 0;
    if (!factor) continue;
    const points = Math.ceil((SCORE_WEIGHT[item.severity] || 0) * factor);
    byCheck.set(item.checkId, Math.max(byCheck.get(item.checkId) || 0, points));
  }
  const penalty = [...byCheck.values()].reduce((sum, n) => sum + n, 0);
  return Math.max(0, Math.min(100, 100 - penalty));
}

export async function auditProject(
  files: Map<string, File>,
  meta: any,
  runtimeErrors: any[] = [],
  compileErrors: any[] = [],
  liveFindings: any[] = [],
  liveCheckIds: string[] = []
) {
  const ctx: AuditContext = {
    findings: [],
    keys: new Map(),
    good: new Set(),
    ranChecks: new Set(),
    failedChecks: new Set(),
    reviewChecks: new Set()
  };
  const texts = new Map<string, string>();
  let codeFiles = 0;
  let totalBytes = 0;

  for (const [name, file] of files) {
    totalBytes += file.size || 0;
    const e = ext(name);
    if (!TEXT_EXTENSIONS.has(e)) continue;
    codeFiles++;
    let text = '';
    try {
      text = await file.text();
    } catch {
      continue;
    }
    texts.set(name, text);
    auditGeneral(name, text, ctx);
    if (e === 'html' || e === 'htm') auditHtml(name, text, ctx);
    if (e === 'css') auditCss(name, text, ctx);
    if (CODE_EXTENSIONS.has(e)) auditJs(name, text, ctx);
    if (e === 'json') auditJson(name, text, ctx);
  }

  auditCrossProject(files, texts, ctx);

  // Server-only project detection
  ran(ctx, 'project.server-only');
  if (meta.isServerOnly) {
    issue(
      ctx,
      'project.server-only',
      'warning',
      'high',
      'Project contains server-only / backend code',
      'This project includes backend code (such as Node/Express server, server-side APIs, or Python scripts). The static front-end components can be previewed and tested here, but server-side execution requires a separate backend environment.',
      (meta.serverReasons || ['Server entry point detected']).join('\n'),
      meta.serverReasons?.[0] || 'server',
      1,
      false // Review note; does not artificially lower code quality score
    );
  }

  mergeRuntime(ctx, runtimeErrors, compileErrors, liveFindings, liveCheckIds);

  const score = calculateScore(ctx);
  const hardProblems = ctx.findings.filter(x => x.scoreImpact !== false && (CONFIDENCE_FACTOR[x.confidence] || 0) > 0);
  const reviewItems = ctx.findings.filter(x => x.scoreImpact === false || x.confidence === 'low');
  const verdict = hardProblems.some(x => x.severity === 'critical')
    ? 'I found an important problem that needs fixing'
    : score >= 95
      ? 'Good news — I did not find clear breakage'
      : score >= 85
        ? 'Mostly healthy — I found a few real problems'
        : score >= 70
          ? 'I found several problems worth fixing'
          : 'I found important problems that need attention';

  const passedChecks = [...ctx.ranChecks].filter(id => !ctx.failedChecks.has(id));

  return {
    id: makeId(),
    createdAt: new Date().toISOString(),
    meta: { ...meta, codeFiles, totalBytes },
    score,
    verdict,
    findings: ctx.findings,
    good: [...ctx.good],
    runtimeErrors,
    checkStats: {
      run: ctx.ranChecks.size,
      passed: passedChecks.length,
      issues: new Set(hardProblems.map(x => x.checkId)).size,
      review: new Set(reviewItems.map(x => x.checkId)).size
    },
    hardProblemCount: hardProblems.length,
    reviewCount: reviewItems.length
  };
}

export function compareAudits(previous: any, current: any) {
  if (!previous || !current) return null;
  const key = (f: Finding) => `${f.checkId || f.title}|${f.file}|${f.line || ''}|${f.title}`;
  const prevKeys = new Set((previous.findings || []).map(key));
  const curKeys = new Set((current.findings || []).map(key));
  const fixed = [...prevKeys].filter(k => !curKeys.has(k));
  const added = [...curKeys].filter(k => !prevKeys.has(k));
  const delta = (current.score || 0) - (previous.score || 0);

  let recommendation = 'These two audits are very close. The problem list matters more than the small score difference.';
  if (fixed.length && !added.length) {
    recommendation = `This version removed ${fixed.length} item${fixed.length === 1 ? '' : 's'} from the earlier audit.`;
  } else if (added.length && !fixed.length) {
    recommendation = `This version has ${added.length} new item${added.length === 1 ? '' : 's'} to review.`;
  } else if (delta > 0) {
    recommendation = `This version scored ${delta} point${delta === 1 ? '' : 's'} higher and removed ${fixed.length} earlier item${fixed.length === 1 ? '' : 's'}.`;
  } else if (delta < 0) {
    recommendation = `This version scored ${Math.abs(delta)} point${Math.abs(delta) === 1 ? '' : 's'} lower. Check the ${added.length} new item${added.length === 1 ? '' : 's'} before deciding whether it is worse.`;
  }

  return {
    delta,
    fixedCount: fixed.length,
    newIssueCount: added.length,
    recommendation,
    previousScore: previous.score,
    currentScore: current.score
  };
}
