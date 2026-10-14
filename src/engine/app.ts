import { ProjectRuntime, norm, ext, classify, resolve, mime } from './project-engine.ts';
import { DEVICES, type DeviceMode } from './device-engine.ts';
import { auditProject, compareAudits, type Finding } from './audit-engine.ts';
import { Storage } from './storage.ts';

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const runtime = new ProjectRuntime();

const isMobileHost = () =>
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
  (matchMedia('(pointer:coarse)').matches && Math.min(screen.width || innerWidth, screen.height || innerHeight) <= 900);

const state = {
  current: null as string | null,
  mode: 'desktop' as DeviceMode,
  scale: 1,
  runtimeErrors: [] as any[],
  auditRuntimeErrors: [] as any[],
  runtimeErrorKeys: new Set<string>(),
  auditRuntimeErrorKeys: new Set<string>(),
  liveFindings: [] as any[],
  liveTests: new Set<string>(),
  audit: null as any,
  compare: null as any,
  fitMode: 'width' as 'width' | 'page' | 'actual' | 'custom',
  desktopWidth: isMobileHost() ? 1200 : 1440,
  controlTests: [] as any[],
  screenshots: [] as any[],
  screenshotKeys: new Set<string>(),
  screenshotAttempts: 0,
  screenshotFailures: 0,
  shotIndex: 0,
  messageWaiters: new Map<string, (payload: any) => void>(),
  renderScore: null as any,
  liveChecksAttempted: false,
  liveChecksCompleted: false,
  controlsAttempted: false,
  controlsCompleted: false,
  controlsFound: 0,
  auditInProgress: false,
  auditToken: 0,
  autoLandscapeFull: false,
  editorKind: 'edit' as 'edit' | 'design',
  editorFile: null as string | null,
};

const frame = $('frame') as HTMLIFrameElement;
const auditFrame = $('auditFrame') as HTMLIFrameElement;
const stage = $('desktopStage') as HTMLElement;
const wrap = $('stageWrap') as HTMLElement;
const shell = $('viewerShell') as HTMLElement;
const main = document.querySelector('.main') as HTMLElement;

function esc(s: any): string {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]!));
}
function status(s: string) { $('statusBadge').textContent = s; }
function notice(s: string) { $('notice').textContent = s; $('notice').classList.toggle('hidden', !s); }
function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}
function clearRenderUrl() {
  for (const [k, u] of [...runtime.urls]) {
    if (k.startsWith('render:')) {
      URL.revokeObjectURL(u);
      runtime.urls.delete(k);
    }
  }
}

function setProjectUi(hasProject: boolean) {
  document.body.classList.toggle('empty-mode', !hasProject);
  $('emptyState').classList.toggle('hidden', hasProject);
  $('workspace').classList.toggle('hidden', !hasProject);
  $('mobileBar').classList.toggle('hidden', !hasProject);
  if (hasProject && isMobileHost()) showMobileSheet('preview');
  if (!hasProject) {
    document.body.classList.remove('sheet-left', 'sheet-right', 'left-collapsed', 'right-collapsed');
    $('leftRestoreBtn').classList.add('hidden');
    $('rightRestoreBtn').classList.add('hidden');
  }
}

function setPanelCollapsed(side: 'left' | 'right', collapsed: boolean) {
  const cls = side === 'left' ? 'left-collapsed' : 'right-collapsed';
  document.body.classList.toggle(cls, collapsed);
  $(side === 'left' ? 'leftRestoreBtn' : 'rightRestoreBtn').classList.toggle('hidden', !collapsed);
  requestAnimationFrame(applyFit);
}

function showMobileSheet(which: 'left' | 'preview' | 'right') {
  document.body.classList.toggle('sheet-left', which === 'left');
  document.body.classList.toggle('sheet-right', which === 'right');
  document.querySelectorAll('.mbtn').forEach(button => {
    (button as HTMLElement).classList.toggle('active', (button as HTMLElement).dataset.sheet === which);
  });
  if (which === 'preview') requestAnimationFrame(applyFit);
}

function fileDescription(name: string): string {
  const lower = name.toLowerCase();
  const base = lower.split('/').pop() || lower;
  const e = ext(name);
  if (/(^|\/)index\.html?$/.test(lower)) return 'This is the project’s front door. It is usually the first page the browser opens.';
  if (/audit[-_.]?engine\.(js|ts)$/.test(base)) return 'This is the part that reads the code and looks for problems. It separates confirmed problems from things that only need review.';
  if (/preview[-_.]?helper\.(js|ts)$/.test(base)) return 'This watches the live page while it runs. It notices crashes, checks the visible layout, safely tries harmless controls, and helps save useful page pictures.';
  if (/project[-_.]?engine\.(js|ts)$/.test(base)) return 'This is the project opener. It unpacks ZIPs, finds the starting file, connects the project pieces, and prepares React or Vite code so you can see the real screen.';
  if (/device[-_.]?engine\.(js|ts)$/.test(base)) return 'This changes the preview size so you can quickly see how the project looks on a desktop, iPad, or phone.';
  if (/storage\.(js|ts)$/.test(base)) return 'This keeps your recent audit history and saved project copies in this browser so you can come back to an earlier test.';
  if (/app\.(tsx|jsx|js|ts)$/.test(base)) return 'This is one of the main app files. Think of it as a coordinator that connects screens, buttons, data, and other pieces.';
  if (/main\.(tsx|jsx|js|ts|cjs|mjs)$/.test(base)) return 'This is a startup file. It is one of the first pieces the app uses to get everything running.';
  if (base === 'package.json') return 'This is the project’s instruction list. It tells the tools which packages the app needs and how the project normally starts or builds.';
  if (/vite\.config\./.test(base)) return 'This gives Vite its setup instructions for building and running the web app.';
  if (/next\.config\./.test(base)) return 'This tells Next.js how this web app should build and run.';
  if (/electron|(^|[-_.])main\.(c?js|mjs|ts)$/.test(base) && lower.includes('electron')) return 'This starts the desktop version of the app and can connect the screen to computer-only features.';
  if (/(?:^|\/)(pages?|routes?)\//.test(lower) || /\.page\.(tsx|jsx|ts|js)$/.test(base)) return 'This is one screen or page in the app. Opening its route should bring you to this part of the website.';
  if (/components?\//.test(lower) || /component/i.test(base)) return 'This is a reusable piece of the screen, such as a menu, panel, table, form, or button group.';
  if (/hooks?\//.test(lower) || /^use[A-Z]/.test(name.split('/').pop() || '')) return 'This is reusable behavior for a React app. Other screens can call it instead of repeating the same logic.';
  if (/api|service|client/.test(base) && CODE_EXTS_FOR_DESCRIPTION.has(e)) return 'This file talks to another part of the app or to an outside service, such as an API or server.';
  if (/store|state|reducer|context/.test(base) && CODE_EXTS_FOR_DESCRIPTION.has(e)) return 'This keeps shared app information so more than one screen can read or change the same data.';
  if (/util|helper|lib/.test(lower) && CODE_EXTS_FOR_DESCRIPTION.has(e)) return 'This contains small reusable tools that other files call when they need the same job done.';
  if (/test|spec/.test(base) && CODE_EXTS_FOR_DESCRIPTION.has(e)) return 'This is test code. It is used to check whether another part of the project behaves correctly.';
  if (e === 'css') return 'This controls how the page looks: colors, fonts, spacing, sizes, layout, and how the screen adjusts on different devices.';
  if (['js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx'].includes(e)) return 'This is working program code. It helps control what the app does when people click, type, load data, or move between screens.';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico'].includes(e)) return 'This is an image or icon used by the project.';
  if (['woff', 'woff2', 'ttf', 'otf'].includes(e)) return 'This is a font file. The project uses it to draw text in a particular typeface.';
  if (e === 'json') return 'This is structured information or settings that the app reads.';
  if (e === 'pdf') return 'This is a PDF document included in the project.';
  if (e === 'md' || /^readme/i.test(base)) return 'This is an instruction or notes file for people working with the project.';
  if (e === 'html' || e === 'htm') return 'This is a web page. You can open it to see that screen in the browser.';
  return 'This belongs to the project. Its name alone does not tell me enough to confidently say exactly what job it does, so I’m not going to guess.';
}
const CODE_EXTS_FOR_DESCRIPTION = new Set(['js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx']);

function simpleProject(meta: any): string {
  if (meta.isServerOnly) return 'This project includes backend / server-only components. Client pages are previewed and audited here, while backend APIs require a server.';
  if (meta.type === 'HTML website') return 'This is a regular website. I can open the real page here, check its files, try safe controls, and show you what needs attention.';
  if (meta.type === 'Multi-page website') return `This website has ${meta.pageCount} page files. I connect them so you can move around the site and see how the pages work together.`;
  if (meta.type === 'Vite web application' || meta.type === 'React/Node application' || meta.type === 'React-style source project') {
    return 'This is a React-style app. I put the source pieces together inside the browser so you can see and test the running screen without doing a normal local build first.';
  }
  if (meta.type === 'Electron application') return 'This is a desktop app. I can inspect and test the browser-style screen here, while computer-only features may still need the real desktop app.';
  if (meta.type === 'Python project') return 'This is a Python program. I can inspect its files, but some parts need Python running on a computer before I can show the full app.';
  return 'This project has several kinds of files. I sort them out and explain what each one is for.';
}

function cleanProjectToken(value: any): string {
  return String(value || '')
    .toLowerCase()
    .replace(/\.(zip|html?|json)$/g, '')
    .replace(/\([^)]*\)$/g, '')
    .replace(/\b(build|version|ver|release|rev|v)\s*[-_.]?\s*\d+(?:[._-]\d+)*\b/g, '')
    .replace(/\b20\d{2}[-_.]?\d{2}[-_.]?\d{2}\b/g, '')
    .replace(/\b\d+(?:[._-]\d+){1,3}\b/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function projectIdentity(meta: any): Promise<string> {
  const names = [...runtime.files.keys()];
  const pkgName = names.find(n => /(^|\/)package\.json$/i.test(n));
  if (pkgName) {
    try {
      const pkg = JSON.parse(await runtime.files.get(pkgName)!.text());
      if (pkg?.name) return `package:${cleanProjectToken(pkg.name)}`;
    } catch {}
  }
  const roots = names.map(n => n.split('/')[0]).filter(Boolean);
  const commonRoot = roots.length && roots.every(x => x === roots[0]) && names.some(n => n.includes('/')) ? roots[0] : '';
  const entry = runtime.entry() === '__synthesized_react__'
    ? (runtime.findReactEntry() || 'react-project')
    : (runtime.entry() || names[0] || meta.type);
  const label = commonRoot || entry.split('/').pop() || meta.type;
  return `${meta.type}:${cleanProjectToken(label) || cleanProjectToken(meta.type)}`;
}

function projectLabel(meta: any): string {
  const names = [...runtime.files.keys()];
  const roots = names.map(n => n.split('/')[0]).filter(Boolean);
  if (roots.length && roots.every(x => x === roots[0]) && names.some(n => n.includes('/'))) return roots[0];
  const entry = runtime.entry();
  return entry && entry !== '__synthesized_react__' ? entry.split('/').pop()! : meta.type;
}

function refreshFiles() {
  const el = $('fileList');
  el.innerHTML = '';
  const names = [...runtime.files.keys()].sort();
  $('fileCountLabel').textContent = `${names.length} file${names.length === 1 ? '' : 's'}`;
  if (!names.length) {
    el.innerHTML = '<div class="small">No files loaded yet.</div>';
    $('pageTabs').innerHTML = '';
    return;
  }
  const reactEntry = runtime.findReactEntry();
  for (const n of names) {
    const f = runtime.files.get(n)!;
    const b = document.createElement('button');
    const isActive = state.current === n || (state.current === '__synthesized_react__' && n === reactEntry);
    b.className = 'file-item' + (isActive ? ' active' : '');
    b.title = n;
    b.innerHTML = `<span class="file-path">${esc(n)}</span><span class="file-desc">${esc(fileDescription(n))}</span><span class="file-meta">${esc(f.type || mime(n))} • ${bytes(f.size)}</span>`;
    b.onclick = () => select(n);
    el.appendChild(b);
  }
  const pages = names.filter(n => /\.html?$/i.test(n));
  $('pageTabs').innerHTML = pages.length > 1
    ? pages.map(p => `<button class="tab ${state.current === p ? 'active' : ''}" data-page="${esc(p)}">${esc(p.split('/').pop())}</button>`).join('')
    : '';
  document.querySelectorAll('[data-page]').forEach(b => {
    (b as HTMLElement).onclick = () => select((b as HTMLElement).dataset.page!);
  });
  syncMobilePageSelect();
}

function renderProjectSummary(): any {
  const meta = classify(runtime.files);
  const entry = runtime.entry() === '__synthesized_react__'
    ? (runtime.findReactEntry() || 'Generated React preview')
    : (runtime.entry() || 'Not found');
  $('projectSummary').innerHTML = `<div class="headline">${esc(simpleProject(meta))}</div><dl class="facts"><dt>Type</dt><dd>${esc(meta.type)}</dd><dt>Starts here</dt><dd>${esc(entry)}</dd><dt>Files</dt><dd>${meta.fileCount}</dd>${meta.pageCount ? `<dt>Page files</dt><dd>${meta.pageCount}</dd>` : ''}</dl><details class="mini-details"><summary>Technical details</summary><div class="muted">Runs with: ${esc(meta.runtime)}</div>${meta.isServerOnly ? `<div class="muted" style="margin-top:4px;color:var(--amber-dark);font-weight:600">Backend note: Server APIs / execution are not run in the local browser.</div>` : ''}</details>`;
  return meta;
}

function waiterKey(type: string, target: HTMLIFrameElement): string {
  return `${type}:${target === auditFrame ? 'audit' : 'view'}`;
}

function waitFor(type: string, timeout = 10000, target: HTMLIFrameElement = frame): Promise<any> {
  return new Promise(resolve => {
    const key = waiterKey(type, target);
    const timer = setTimeout(() => {
      state.messageWaiters.delete(key);
      resolve(false);
    }, timeout);
    state.messageWaiters.set(key, payload => {
      clearTimeout(timer);
      state.messageWaiters.delete(key);
      resolve(payload || true);
    });
  });
}

function resetVisualEvidence() {
  state.screenshots = [];
  state.screenshotKeys = new Set();
  state.screenshotAttempts = 0;
  state.screenshotFailures = 0;
  state.shotIndex = 0;
  renderScreenshots();
}

function screenshotKey(shot: any): string {
  const data = String(shot?.data || '');
  return [shot?.page || '', shot?.device || '', data.length, data.slice(-180)].join('|');
}

function addScreenshot(shot: any): boolean {
  if (!shot?.data || !/^data:image\/(jpeg|png|webp);base64,/i.test(shot.data)) return false;
  const key = screenshotKey(shot);
  if (state.screenshotKeys.has(key)) return false;
  state.screenshotKeys.add(key);
  state.screenshots.push(shot);
  renderScreenshots();
  return true;
}

function renderScreenshots() {
  const count = state.screenshots.length;
  $('shotCount').textContent = String(count);
  if (!count) {
    $('shotGrid').innerHTML = '';
    $('shotStatus').textContent = state.screenshotFailures
      ? 'I tried to save page pictures, but this browser could not create a usable image. Your code score was not lowered because of that.'
      : 'I’ll save a few useful pictures after the page settles. I won’t spam you with before-and-after pictures for every button.';
  } else {
    $('shotGrid').innerHTML = state.screenshots.map((shot, index) =>
      `<button class="shot" data-shot-index="${index}" aria-label="Open picture: ${esc(shot.label)}"><img src="${shot.data}" alt="${esc(shot.label)}"><span class="shot-meta"><span class="shot-name">${esc(shot.label)}</span><span class="shot-reason">${esc(shot.device || 'Preview')} • ${esc(shot.reason || 'Page view')}</span></span></button>`
    ).join('');
    $('shotStatus').textContent = state.screenshotFailures
      ? `${count} useful picture${count === 1 ? '' : 's'} saved. ${state.screenshotFailures} picture attempt${state.screenshotFailures === 1 ? '' : 's'} could not be saved.`
      : `${count} useful picture${count === 1 ? '' : 's'} saved. These are evidence from the real preview, not a separate score.`;
  }
  const statusEl = $('visualEvidenceStatus');
  if (statusEl) {
    if (count && state.screenshotFailures === 0) {
      statusEl.className = 'visual-status good';
      statusEl.textContent = `Visual evidence ready • ${count} useful picture${count === 1 ? '' : 's'} saved.`;
    } else if (state.screenshotAttempts) {
      statusEl.className = 'visual-status warn';
      statusEl.textContent = count
        ? `Visual evidence partly complete • ${count} saved, ${state.screenshotFailures} unavailable.`
        : 'Visual evidence incomplete • the browser could not save a usable page picture.';
    } else {
      statusEl.className = 'visual-status neutral';
      statusEl.textContent = 'Pictures are checked during the audit.';
    }
  }
}

function showScreenshot(index: number) {
  if (!state.screenshots.length) return;
  state.shotIndex = (index + state.screenshots.length) % state.screenshots.length;
  const shot = state.screenshots[state.shotIndex];
  const img = $('shotImage') as HTMLImageElement;
  img.src = shot.data;
  img.alt = shot.label || 'Captured project preview';
  $('shotTitle').textContent = shot.label || 'Page picture';
  $('shotMeta').textContent = [shot.device, shot.reason].filter(Boolean).join(' • ');
  $('shotModal').classList.remove('hidden');
}

function closeScreenshot() {
  $('shotModal').classList.add('hidden');
  $('shotImage').removeAttribute('src');
}

export async function loadProject(list: File[] | FileList, { skipConfirm = false } = {}) {
  if (!list?.length) return;
  if (runtime.files.size && !skipConfirm && !confirm('Open this new project? Your older audits will stay saved so you can go back to them later.')) {
    return;
  }
  state.auditToken++;
  status('Opening…');
  notice('');
  state.runtimeErrors = [];
  state.auditRuntimeErrors = [];
  state.runtimeErrorKeys.clear();
  state.auditRuntimeErrorKeys.clear();
  state.liveFindings = [];
  state.liveTests.clear();
  state.audit = null;
  state.compare = null;
  state.current = null;
  state.controlTests = [];
  resetVisualEvidence();
  state.renderScore = null;
  state.liveChecksAttempted = false;
  state.liveChecksCompleted = false;
  state.controlsAttempted = false;
  state.controlsCompleted = false;
  state.controlsFound = 0;
  state.auditInProgress = false;
  renderControlTests();

  $('scoreBox').innerHTML = '<div class="score">—</div><div class="small">I’m getting the project ready. I’ll show the score only after the available checks finish.</div>';
  $('metrics').innerHTML = '';
  $('findings').innerHTML = '<div class="small">I’m opening the real page first. Clear problems will show here after the checks finish; uncertain notes stay separate.</div>';
  $('compareBox').classList.add('hidden');

  try {
    await runtime.addFiles(list);
    setProjectUi(true);
    refreshFiles();
    const meta = renderProjectSummary();
    status(`${meta.fileCount} files ready`);

    // Server-only warning banner if applicable
    if (meta.isServerOnly) {
      notice('This project contains server-only / backend code. Client interface is displayed; server API execution is not supported in the standalone browser.');
    }

    const entry = runtime.entry();
    if (entry) {
      if (entry === '__synthesized_react__') {
        notice('This React project does not have a normal starting page, so I am making one temporarily so you can see the app.');
      }
      await select(entry);
    }
    status('Ready');
    void runAudit();
  } catch (e: any) {
    status('I could not open that project');
    notice('Something stopped me from opening this project: ' + (e.message || String(e)) + ' Your original files were not changed.');
  }
}

export async function select(name: string) {
  const isSynthesized = name === '__synthesized_react__';
  if (isSynthesized) {
    const synth = runtime.synthesizeReactHtml();
    if (!synth) {
      notice('I could not find the file that normally starts this React app, so I could not open the screen.');
      return;
    }
    state.current = '__synthesized_react__';
    state.renderScore = null;
    refreshFiles();
    status('Building React app…');
    clearRenderUrl();
    try {
      const html = await runtime.htmlRewrite(synth, 'index.html');
      const u = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      runtime.urls.set('render:__synthesized_react__', u);
      frame.removeAttribute('srcdoc');
      const ready = waitFor('debooger-render-ready', 20000);
      await new Promise<void>(r => {
        const t = setTimeout(r, 3000);
        frame.onload = () => { clearTimeout(t); r(); };
        frame.src = u;
      });
      const result = await ready;
      if (result?.score) state.renderScore = result.score;
      if (runtime.compileErrors.length) {
        notice('I found code that the browser could not understand. Open the audit result to see which file needs fixing.');
      }
      status('Ready when you are');
      applyDevice();
    } catch (err: any) {
      status('Could not open screen');
      notice('I tried to open this screen, but something stopped it: ' + (err.message || String(err)));
      frame.srcdoc = `<pre style="white-space:pre-wrap;padding:16px">${esc(String(err))}</pre>`;
    }
    return;
  }

  const clean = norm(name);
  const f = runtime.files.get(clean);
  if (!f) return;
  state.current = clean;
  state.renderScore = null;
  refreshFiles();
  status('Building screen…');
  clearRenderUrl();
  const e = ext(clean);
  try {
    if (/html?/.test(e)) {
      const html = await runtime.htmlRewrite(await f.text(), clean);
      const u = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      runtime.urls.set('render:' + clean, u);
      frame.removeAttribute('srcdoc');
      const ready = waitFor('debooger-render-ready', 14000);
      await new Promise<void>(r => {
        const t = setTimeout(r, 2500);
        frame.onload = () => { clearTimeout(t); r(); };
        frame.src = u;
      });
      const result = await ready;
      if (result?.score) state.renderScore = result.score;
    } else if ((f.type || '').startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico'].includes(e)) {
      const u = runtime.objectUrl(clean);
      frame.srcdoc = `<!doctype html><html><body style="margin:0;background:white"><img src="${u}" style="max-width:100%;height:auto;display:block;margin:20px auto"></body></html>`;
    } else if (e === 'pdf') {
      frame.removeAttribute('srcdoc');
      frame.src = runtime.objectUrl(clean)!;
    } else {
      const t = await f.text();
      frame.srcdoc = `<!doctype html><html><body style="margin:0"><pre style="white-space:pre-wrap;word-break:break-word;margin:0;padding:16px;font:13px/1.5 ui-monospace;background:#101317;color:#e7edf3;min-height:100vh">${esc(t)}</pre></body></html>`;
    }
    status('Ready when you are');
    applyDevice();
  } catch (err: any) {
    status('Could not open screen');
    notice('I tried to open this screen, but something stopped it: ' + (err.message || String(err)));
    frame.srcdoc = `<pre style="white-space:pre-wrap;padding:16px">${esc(String(err))}</pre>`;
  }
}

function deviceSize() {
  return state.mode === 'desktop'
    ? { ...DEVICES.desktop, width: state.desktopWidth }
    : DEVICES[state.mode];
}

function syncViewerControls() {
  document.querySelectorAll('.device-btn').forEach(b => {
    (b as HTMLElement).classList.toggle('active', (b as HTMLElement).dataset.device === state.mode);
  });
  const dw = $('desktopWidth') as HTMLSelectElement;
  if (dw) {
    dw.value = String(state.desktopWidth);
    dw.disabled = state.mode !== 'desktop';
  }
  const mdw = $('mobileDesktopWidth') as HTMLSelectElement;
  if (mdw) {
    mdw.value = String(state.desktopWidth);
    mdw.disabled = state.mode !== 'desktop';
  }
  document.querySelectorAll('[data-fit]').forEach(b => {
    (b as HTMLElement).classList.toggle('active', (b as HTMLElement).dataset.fit === state.fitMode);
  });
  const z = $('zoomValue');
  if (z) z.textContent = Math.round(state.scale * 100) + '%';
}

export function applyDevice() {
  const d = deviceSize();
  stage.style.width = d.width + 'px';
  stage.style.height = d.height + 'px';
  frame.style.width = d.width + 'px';
  frame.style.height = d.height + 'px';
  syncViewerControls();
  applyFit();
}

export function applyFit() {
  requestAnimationFrame(() => {
    const d = deviceSize();
    const availableW = Math.max(260, shell.clientWidth - 4);
    const availableH = Math.max(260, shell.clientHeight - 4);
    if (state.fitMode === 'actual') {
      state.scale = 1;
    } else if (state.fitMode === 'page') {
      state.scale = Math.min(1, availableW / d.width, availableH / d.height);
    } else if (state.fitMode === 'width') {
      state.scale = Math.min(1, availableW / d.width);
    } else {
      state.scale = Math.max(0.2, Math.min(2, state.scale || 1));
    }
    stage.style.transform = `scale(${state.scale})`;
    wrap.style.width = (d.width * state.scale) + 'px';
    wrap.style.height = (d.height * state.scale) + 'px';
    syncViewerControls();
  });
}

export function setDevice(mode: DeviceMode) {
  state.mode = DEVICES[mode] ? mode : 'desktop';
  applyDevice();
}

export function setFit(mode: 'width' | 'page' | 'actual') {
  state.fitMode = ['width', 'page', 'actual'].includes(mode) ? mode : 'width';
  applyFit();
}

export function zoomBy(delta: number) {
  state.fitMode = 'custom';
  state.scale = Math.max(0.2, Math.min(2, (state.scale || 1) + delta));
  applyFit();
}

async function runCurrentLiveChecks(target: HTMLIFrameElement = auditFrame) {
  state.liveChecksAttempted = true;
  const waiting = waitFor('debooger-live-checks-finished', 6000, target);
  target.contentWindow?.postMessage({ type: 'debooger-run-live-checks' }, '*');
  const result = await waiting;
  if (result && Array.isArray(result.tests)) {
    result.tests.forEach((id: string) => state.liveTests.add(id));
  }
  return result;
}

async function testCurrentControls(target: HTMLIFrameElement = auditFrame) {
  state.controlsAttempted = true;
  const waiting = waitFor('debooger-controls-finished', 18000, target);
  target.contentWindow?.postMessage({ type: 'debooger-test-controls' }, '*');
  const result = await waiting;
  if (result) state.controlsFound += Number(result.count || 0);
  return result;
}

function auditDeviceSize(mode: DeviceMode) {
  return mode === 'desktop'
    ? { ...DEVICES.desktop, width: state.desktopWidth }
    : DEVICES[mode];
}

async function renderAuditPage(name: string, mode: DeviceMode = 'desktop'): Promise<boolean> {
  try {
    const d = auditDeviceSize(mode);
    auditFrame.style.width = d.width + 'px';
    auditFrame.style.height = d.height + 'px';
    let html = '';
    if (name === '__synthesized_react__') {
      const synth = runtime.synthesizeReactHtml();
      if (!synth) return false;
      html = await runtime.htmlRewrite(synth, 'index.html');
    } else {
      const f = runtime.files.get(name);
      if (!f || !/\.html?$/i.test(name)) return false;
      html = await runtime.htmlRewrite(await f.text(), name);
    }
    const ready = waitFor('debooger-render-ready', 9000, auditFrame);
    auditFrame.srcdoc = html;
    return !!(await ready);
  } catch (error: any) {
    pushRuntimeError({
      kind: 'audit-render-error',
      message: String(error?.message || error),
      file: name,
      local: true
    }, true);
    return false;
  }
}

async function captureAuditScreenshot(options: any = {}) {
  const waiting = waitFor('debooger-screenshot-finished', 7000, auditFrame);
  auditFrame.contentWindow?.postMessage({ type: 'debooger-capture-screenshot', options }, '*');
  return !!(await waiting);
}

// Background audit: completely preserves the user's visible frame!
async function runPageAuditChecks(): Promise<number> {
  state.controlTests = [];
  state.liveFindings = [];
  state.liveTests = new Set();
  state.auditRuntimeErrors = [];
  state.auditRuntimeErrorKeys = new Set();
  state.liveChecksAttempted = false;
  state.liveChecksCompleted = false;
  state.controlsAttempted = false;
  state.controlsCompleted = false;
  state.controlsFound = 0;
  resetVisualEvidence();
  renderControlTests();

  let pages = [...runtime.files.keys()].filter(name => /\.html?$/i.test(name));
  if (!pages.length && runtime.isReactSourceProject()) pages = ['__synthesized_react__'];
  if (!pages.length) return 0;

  let checked = 0;
  let liveComplete = true;
  let controlsComplete = true;

  for (let i = 0; i < pages.length; i++) {
    status(`Testing page ${i + 1}/${pages.length}…`);
    if (!(await renderAuditPage(pages[i], 'desktop'))) {
      liveComplete = false;
      controlsComplete = false;
      continue;
    }
    if (await runCurrentLiveChecks(auditFrame)) checked++;
    else liveComplete = false;

    await captureAuditScreenshot({
      label: pages[i] === '__synthesized_react__' ? 'Main React screen' : pages[i].split('/').pop(),
      reason: 'Page after it finished loading.',
      group: 'Page',
      device: 'Desktop'
    });
    if (!(await testCurrentControls(auditFrame))) controlsComplete = false;
  }

  const firstPage = pages[0];
  for (const mode of ['tablet', 'mobile'] as DeviceMode[]) {
    if (state.screenshots.length >= 12) break;
    if (!(await renderAuditPage(firstPage, mode))) continue;
    await captureAuditScreenshot({
      label: (firstPage === '__synthesized_react__' ? 'Main React screen' : firstPage.split('/').pop()) + ' — ' + (mode === 'tablet' ? 'iPad' : 'Mobile'),
      reason: 'Main screen at another device size.',
      group: 'Device',
      device: mode === 'tablet' ? 'iPad' : 'Mobile'
    });
  }

  state.liveChecksCompleted = liveComplete;
  state.controlsCompleted = controlsComplete;
  auditFrame.srcdoc = '<!doctype html><html><body></body></html>';
  return checked;
}

function renderAuditPending(meta: any) {
  $('scoreBox').innerHTML = '<div class="score-line"><div class="score">—</div><div class="muted">Testing in the background…</div></div><ul class="progress" id="auditProgress"><li>Files</li><li>Preview</li><li>Pages</li><li>Controls</li><li>Code</li><li>Pictures</li><li>Result</li></ul>';
  $('metrics').innerHTML = `<div class="metric"><b>${meta.fileCount}</b><span>Files to check</span></div><div class="metric"><b>—</b><span>Tests finished</span></div><div class="metric"><b>—</b><span>Real problems</span></div><div class="metric"><b>—</b><span>Check manually</span></div>`;
  $('findings').innerHTML = '<div class="muted">Checking real issues in the background.</div>';
  $('compareBox').classList.add('hidden');
  setAuditStep(0);
}

function setAuditStep(index: number) {
  const progress = $('auditProgress');
  if (!progress) return;
  [...progress.children].forEach((item, i) => {
    item.classList.toggle('done', i < index);
    item.classList.toggle('active', i === index);
  });
}

function finalizeAuditScore(audit: any, meta: any) {
  audit.sourceScore = audit.score;
  const needsPageTest = meta.pageCount > 0 || runtime.isReactSourceProject();
  audit.livePageChecksComplete = !needsPageTest || state.liveChecksCompleted;
  audit.controlsComplete = !state.controlsAttempted || state.controlsCompleted;
  audit.controlsFound = state.controlsFound;
  audit.controlFailures = state.controlTests.filter(item => item.status === 'FAIL').length;
  audit.controlUnclear = state.controlTests.filter(item => item.status === 'CHECK' || item.status === 'SKIP').length;
  audit.screenshotsSaved = state.screenshots.length;
  audit.screenshotAttempts = state.screenshotAttempts;
  audit.screenshotFailures = state.screenshotFailures;

  const notes: string[] = [];
  if (needsPageTest && !audit.livePageChecksComplete) {
    notes.push('The code checks finished, but the live-page check did not finish. I did not lower the score for an unfinished viewer check.');
  }
  if (state.controlsAttempted && !state.controlsCompleted) {
    notes.push('The safe-button check did not finish. I did not call those buttons broken or lower the score because of that.');
  }
  if (state.screenshotAttempts && state.screenshotFailures) {
    notes.push(state.screenshots.length
      ? `${state.screenshots.length} useful picture${state.screenshots.length === 1 ? ' was' : 's were'} saved, but ${state.screenshotFailures} picture attempt${state.screenshotFailures === 1 ? ' was' : 's were'} unavailable.`
      : 'This browser could not save a usable page picture. That does not lower the code score.');
  } else if (state.screenshots.length) {
    notes.push(`${state.screenshots.length} useful page picture${state.screenshots.length === 1 ? ' was' : 's were'} saved as visual evidence.`);
  }
  if (!notes.length) notes.push('The available checks finished cleanly.');
  audit.testNote = notes.join(' ');
  return audit;
}

export async function runAudit() {
  if (!runtime.files.size || state.auditInProgress) return;
  const token = ++state.auditToken;
  state.auditInProgress = true;
  status('Checking your project…');
  const meta = classify(runtime.files);
  meta.projectKey = await projectIdentity(meta);
  meta.projectLabel = projectLabel(meta);
  const previous = Storage.history().find((item: any) => item.meta?.projectKey === meta.projectKey) || null;

  renderAuditPending(meta);
  setAuditStep(1);
  state.runtimeErrors = [];
  state.liveFindings = [];
  runtime.compileErrors = [];

  try {
    setAuditStep(2);
    const livePagesChecked = await runPageAuditChecks();
    if (token !== state.auditToken) return;

    setAuditStep(4);
    status('Reading the code carefully…');
    const audit = await auditProject(
      runtime.files,
      meta,
      [...state.runtimeErrors, ...state.auditRuntimeErrors],
      runtime.compileErrors,
      state.liveFindings,
      [...state.liveTests]
    );
    (audit as any).livePagesChecked = livePagesChecked;
    finalizeAuditScore(audit, meta);
    state.audit = audit;
    state.compare = compareAudits(previous, audit);

    setAuditStep(5);
    status('Checking the visual evidence…');
    setAuditStep(6);
    status('Putting the result together…');

    await Storage.saveSnapshot(audit, runtime.files);
    const history = Storage.pushAudit(audit);
    await Storage.pruneSnapshots(history.slice(0, 6).map((item: any) => item.snapshotId));
    renderHistory();

    if (audit.livePageChecksComplete && audit.controlsComplete) {
      status('Audit complete');
      notice('');
    } else {
      status('Audit complete • checks partly finished');
    }
    renderAudit();
  } catch (error: any) {
    state.audit = null;
    status('Audit could not finish');
    notice('The audit stopped: ' + String(error?.message || error));
    $('scoreBox').innerHTML = '<div class="score">—</div><div class="small">I did not create a final score because the audit itself did not finish.</div>';
  } finally {
    if (token === state.auditToken) state.auditInProgress = false;
  }
}

function findingClass(item: Finding): string {
  if (item.scoreImpact === false || item.confidence === 'low') return 'review';
  if (item.severity === 'critical' || item.severity === 'error') return 'bad';
  if (item.severity === 'warning') return 'warn';
  return 'review';
}

function findingSeverity(item: Finding): { label: string; cls: string } {
  if (item.scoreImpact === false || item.confidence === 'low') return { label: 'Check manually', cls: 'review' };
  if (item.severity === 'critical') return { label: 'Critical', cls: 'error' };
  if (item.severity === 'error') return { label: 'Error', cls: 'error' };
  if (item.severity === 'warning') return { label: 'Warning', cls: 'warn' };
  return { label: 'Review', cls: 'review' };
}

function groupedFindings(items: Finding[]): Finding[] {
  const groups = new Map<string, Finding>();
  for (const item of items || []) {
    const key = `${item.checkId}|${item.file}|${item.title}|${item.scoreImpact === false ? 'review' : 'issue'}`;
    if (!groups.has(key)) {
      groups.set(key, {
        ...item,
        count: item.count || 1,
        lines: item.lines?.length ? [...item.lines] : (item.line ? [item.line] : []),
        extraTechnical: [item.technical, ...(item.extraTechnical || [])].filter(Boolean)
      });
    } else {
      const g = groups.get(key)!;
      g.count = (g.count || 1) + (item.count || 1);
      const incomingLines = item.lines?.length ? item.lines : (item.line ? [item.line] : []);
      for (const line of incomingLines) {
        if (line && !g.lines!.includes(line)) g.lines!.push(line);
      }
      for (const d of [item.technical, ...(item.extraTechnical || [])].filter(Boolean)) {
        if (!g.extraTechnical!.includes(d)) g.extraTechnical!.push(d);
      }
    }
  }
  return [...groups.values()].map(g => ({
    ...g,
    line: g.lines?.[0] || g.line,
    technical: g.extraTechnical?.slice(0, 3).join(' | ') || g.technical
  }));
}

function shortText(value: any, max = 155): string {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

function renderAudit() {
  const audit = state.audit;
  if (!audit) return;
  const cls = audit.score >= 95 ? 'good' : audit.score >= 80 ? 'warn' : 'bad';
  const testText = audit.testNote || '';
  $('scoreBox').innerHTML = `<div class="score-line"><div class="score ${cls}">${audit.score}<span class="score-denom">/100</span></div><div><div class="score-message">${esc(audit.verdict)}</div><div class="muted">${esc(testText)}</div></div></div>`;
  renderScreenshots();
  const stats = audit.checkStats || { run: 0, issues: 0, review: 0 };
  $('metrics').innerHTML = `<div class="metric"><b>${audit.meta.fileCount}</b><span>Files checked</span></div><div class="metric"><b>${stats.run}</b><span>Checks run</span></div><div class="metric"><b>${stats.issues}</b><span>Confirmed problem types</span></div><div class="metric"><b>${state.screenshots.length}</b><span>Useful pictures</span></div>`;

  const ordered = groupedFindings(audit.findings).sort((a, b) => {
    const ar = a.scoreImpact === false || a.confidence === 'low' ? 1 : 0;
    const br = b.scoreImpact === false || b.confidence === 'low' ? 1 : 0;
    if (ar !== br) return ar - br;
    const rank: Record<string, number> = { critical: 0, error: 1, warning: 2, info: 3 };
    return (rank[a.severity] ?? 4) - (rank[b.severity] ?? 4);
  });

  const LIMIT = 60;
  const top = ordered.slice(0, LIMIT);
  const hidden = ordered.length - top.length;

  $('findings').innerHTML = (top.length
    ? top.map(item => {
        const review = item.scoreImpact === false || item.confidence === 'low';
        const sev = findingSeverity(item);
        const note = review ? 'Review this manually. It did not lower the score.' : 'Confirmed problem. It affected the score.';
        const repeat = item.count && item.count > 1 ? ` — ${item.count} matches` : '';
        const where = item.file
          ? `${item.file}${item.lines?.length ? ` • line${item.lines.length === 1 ? '' : 's'} ${item.lines.slice(0, 10).join(', ')}` : ''}`
          : '';
        return `<details class="finding ${findingClass(item)}"><summary><span class="severity ${sev.cls}">${esc(sev.label)}</span><strong>${esc(item.title + repeat)}</strong><div class="simple-line">${esc(shortText(item.plain))}</div>${where ? `<div class="finding-where">${esc(where)}</div>` : ''}</summary><p>${esc(note)}${item.technical ? `<br><br>${esc(shortText(item.technical, 280))}` : ''}</p></details>`;
      }).join('')
    : '<div class="finding good"><div class="finding-success"><span class="severity pass">Passed</span><strong>Good news — I did not find a clear code problem</strong><div class="simple-line">The checks that can prove a problem came back clean.</div></div></div>') +
    (hidden > 0 ? `<div class="more-findings">${hidden} more in the saved report.</div>` : '');

  if (state.compare) {
    $('compareBox').classList.remove('hidden');
    $('compareBox').innerHTML = `<details class="finding ${state.compare.delta >= 0 ? 'good' : 'warn'}"><summary><strong>${esc(state.compare.recommendation)}</strong><div class="simple-line">Compare this audit with the last saved audit of the same project.</div></summary><p>Older score: ${state.compare.previousScore} • New score: ${state.compare.currentScore} • Earlier items gone: ${state.compare.fixedCount} • New items: ${state.compare.newIssueCount}</p></details>`;
  } else {
    $('compareBox').classList.add('hidden');
  }
}

function controlResultText(item: any): string {
  if (item.detail) return item.detail;
  if (item.status === 'PASS') return 'I pressed it, the screen changed, and no JavaScript crash appeared.';
  if (item.status === 'FAIL') return 'I pressed it and the page reported a real error.';
  if (item.status === 'SKIP') return 'I left this alone because pressing it could cause a real action.';
  return 'I pressed it, but I could not safely measure a visible change.';
}

function renderControlTests() {
  const unique = new Map<string, any>();
  for (const item of state.controlTests) {
    const key = `${item.file || ''}|${item.label}|${item.status}`;
    if (!unique.has(key)) unique.set(key, item);
  }
  const items = [...unique.values()];
  const tested = items.filter(item => item.status !== 'SKIP').length;
  $('controlCount').textContent = String(tested);
  $('controlList').innerHTML = items.length
    ? items.map(item =>
        `<div class="control-test ${item.status === 'FAIL' ? 'bad' : item.status === 'PASS' ? 'good' : 'neutral'}"><div class="control-status">${esc(item.status === 'CHECK' ? 'Check' : item.status)}</div><strong>${esc(item.label || 'Control')}</strong>${item.file ? `<div class="muted">${esc(item.file)}</div>` : ''}<div class="muted">${esc(shortText(controlResultText(item), 160))}</div></div>`
      ).join('')
    : '<div class="muted">Safe controls are tested without sending, deleting, saving, or downloading.</div>';
}

function renderHistory() {
  const h = Storage.history();
  $('history').innerHTML = h.length
    ? h.slice(0, 6).map((x: any) =>
        `<button class="history-item history-open" data-history-id="${esc(x.snapshotId || '')}" ${x.snapshotId ? '' : 'disabled'}><strong>${esc(x.meta?.projectLabel || simpleProject(x.meta))}</strong><div class="small">${new Date(x.createdAt).toLocaleString()} • Score ${x.score}${x.snapshotId ? ' • Tap to reopen saved ZIP' : ' • Older record only'}</div></button>`
      ).join('')
    : '<div class="small">No older audits saved on this device.</div>';
}

async function openHistorySnapshot(id: string) {
  if (!id) return;
  status('Opening saved project…');
  const saved = await Storage.getSnapshot(id);
  if (!saved?.blob) {
    status('Saved ZIP unavailable');
    notice('This older audit was saved before project ZIP history was added.');
    return;
  }
  const file = new File([saved.blob], saved.name || 'saved-project.zip', { type: 'application/zip' });
  await loadProject([file], { skipConfirm: true });
}

function buildReport(): string {
  const audit = state.audit;
  if (!audit) return 'No finished audit is available yet.';
  const stats = audit.checkStats || { run: 0, passed: 0, issues: 0, review: 0 };
  let report = `DEBOOGER2000 AUDIT\n\nWHAT THIS PROJECT IS\n${simpleProject(audit.meta)}\n${audit.meta.fileCount} files • ${audit.meta.pageCount} page files\n\nFINAL SCORE\n${audit.score}/100 — ${audit.verdict}\n${audit.testNote || ''}\n\nTESTS\n${stats.run} different test types run\n${stats.issues} real problem types\n${stats.review} manual-review types\n\nSAFE BUTTON TESTS\n`;
  report += state.controlTests.length
    ? state.controlTests.map((item: any) => `• ${item.label} — ${controlResultText(item)}`).join('\n')
    : '• No safe controls were available to press';
  report += `\n\nVISUAL EVIDENCE\n• ${state.screenshots.length} useful picture${state.screenshots.length === 1 ? '' : 's'} saved\n• ${state.screenshotFailures} picture attempt${state.screenshotFailures === 1 ? '' : 's'} unavailable\n\nWHAT NEEDS ATTENTION\n`;
  report += groupedFindings(audit.findings).map((item, index) => {
    const review = item.scoreImpact === false || item.confidence === 'low';
    return `${index + 1}. ${review ? 'CHECK MANUALLY: ' : 'PROBLEM: '}${item.title}${item.count && item.count > 1 ? ` (${item.count} matches)` : ''}\n${shortText(item.plain, 320)}${item.file ? `\nFile: ${item.file}${item.lines?.length ? ` • lines ${item.lines.slice(0, 12).join(', ')}` : ''}` : ''}${item.technical ? `\nDetail: ${shortText(item.technical, 420)}` : ''}`;
  }).join('\n\n') || 'No clear code problems were found.';

  if (state.compare) {
    report += `\n\nVERSION COMPARISON\n${state.compare.recommendation}\nOlder: ${state.compare.previousScore} | Current: ${state.compare.currentScore} | Earlier items gone: ${state.compare.fixedCount} | New items: ${state.compare.newIssueCount}`;
  }
  return report;
}

export async function copyReport(): Promise<boolean> {
  const report = buildReport();
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
    await navigator.clipboard.writeText(report);
    status('Copied');
    return true;
  } catch {}
  const ta = document.createElement('textarea');
  ta.value = report;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  let copied = false;
  try { copied = document.execCommand('copy') === true; } catch {}
  ta.remove();
  if (copied) { status('Copied'); return true; }
  status('Copy blocked');
  notice('Your browser blocked automatic copy. Press and hold the audit text to copy.');
  return false;
}

export async function downloadReport(): Promise<boolean> {
  const report = buildReport();
  let file: File;
  const JSZip = (globalThis as any).JSZip;
  if (state.screenshots.length && typeof JSZip === 'function') {
    const zip = new JSZip();
    zip.file('audit.txt', report);
    state.screenshots.forEach((shot, index) => {
      const match = String(shot.data || '').match(/^data:image\/(jpeg|png|webp);base64,(.+)$/i);
      if (!match) return;
      const extName = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
      const safe = String(shot.label || `picture-${index + 1}`).replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 70) || `picture-${index + 1}`;
      zip.file(`pictures/${String(index + 1).padStart(2, '0')}-${safe}.${extName}`, match[2], { base64: true });
    });
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    file = new File([blob], 'debooger2000-audit-report.zip', { type: 'application/zip' });
  } else {
    file = new File([report], 'debooger2000-audit.txt', { type: 'text/plain;charset=utf-8' });
  }
  const isiOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isiOS && navigator.share && (navigator as any).canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'debooger2000 audit' });
      status('Report is ready to save');
      return true;
    } catch (e: any) {
      if (e?.name === 'AbortError') return false;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  try {
    a.click();
    status('Report download started');
    return true;
  } catch {
    window.open(url, '_blank');
    status('Report opened in a new tab');
    return true;
  } finally {
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  }
}

export function clearProject() {
  if (runtime.files.size && !confirm('Trash this project? Your earlier audit history will stay.')) return;
  state.auditToken++;
  runtime.clear();
  state.current = null;
  state.runtimeErrors = [];
  state.auditRuntimeErrors = [];
  state.runtimeErrorKeys.clear();
  state.auditRuntimeErrorKeys.clear();
  state.liveFindings = [];
  state.liveTests.clear();
  state.audit = null;
  state.compare = null;
  state.controlTests = [];
  resetVisualEvidence();
  state.renderScore = null;
  state.liveChecksAttempted = false;
  state.liveChecksCompleted = false;
  state.controlsAttempted = false;
  state.controlsCompleted = false;
  state.controlsFound = 0;
  state.auditInProgress = false;

  refreshFiles();
  renderControlTests();
  setProjectUi(false);
  $('projectSummary').innerHTML = '<div class="muted">Open a project and I’ll explain what kind of project it is, which file starts it, and what I can test here.</div>';
  $('scoreBox').innerHTML = '<div class="score">—</div><div class="muted">I’ll keep the score blank until the available checks are finished.</div>';
  $('metrics').innerHTML = '';
  $('findings').innerHTML = '<div class="muted">Real problems show first. Anything uncertain stays clearly marked as a manual check and does not lower the score.</div>';
  $('compareBox').classList.add('hidden');
  frame.srcdoc = welcomeHtml();
  notice('');
  status('Ready when you are');
}

function welcomeHtml(): string {
  return '<!doctype html><html><body style="font-family:Inter,system-ui;padding:42px"><h1 style="font-size:24px">debooger2000</h1><p>Open a project and I’ll show you the real page, check what I can safely check, and explain anything that needs attention in simple words.</p></body></html>';
}

function invalidateRuntimeCaches() {
  for (const u of runtime.urls.values()) {
    if (String(u).startsWith('blob:')) URL.revokeObjectURL(u);
  }
  runtime.urls.clear();
  runtime.bundleCache.clear();
  runtime.compileErrors = [];
}

function editableFiles(kind: 'edit' | 'design'): string[] {
  const names = [...runtime.files.keys()].filter(n =>
    ['html', 'htm', 'css', 'js', 'mjs', 'cjs', 'jsx', 'tsx', 'ts', 'json', 'txt', 'md', 'svg'].includes(ext(n))
  );
  if (kind === 'design') {
    const design = names.filter(n => ['css', 'html', 'htm', 'svg'].includes(ext(n)));
    return design.length ? design : names;
  }
  return names;
}

async function loadEditorFile(name: string) {
  const f = runtime.files.get(name);
  if (!f) return;
  state.editorFile = name;
  ($('editorFileSelect') as HTMLSelectElement).value = name;
  ($('editorText') as HTMLTextAreaElement).value = await f.text();
}

export async function openEditor(kind: 'edit' | 'design' = 'edit') {
  closeMore();
  if (!runtime.files.size) { notice('Open a project first.'); return; }
  state.editorKind = kind;
  const files = editableFiles(kind);
  if (!files.length) { notice('No editable text file was found.'); return; }

  $('editorTitle').textContent = kind === 'design' ? 'Design' : 'Edit';
  $('editorFileSelect').innerHTML = files.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');

  let preferred = state.current === '__synthesized_react__' ? runtime.findReactEntry() : state.current;
  if (kind === 'design' && ext(preferred || '') !== 'css') {
    preferred = files.find(n => ext(n) === 'css') || preferred;
  }
  if (!preferred || !files.includes(preferred)) preferred = files[0];
  await loadEditorFile(preferred);
  $('editorModal').classList.remove('hidden');
}

export function closeEditor() {
  $('editorModal').classList.add('hidden');
}

export async function applyEditor() {
  const name = state.editorFile;
  if (!name || !runtime.files.has(name)) return;
  state.auditToken++;
  state.auditInProgress = false;
  const old = runtime.files.get(name)!;
  const text = ($('editorText') as HTMLTextAreaElement).value;
  runtime.files.set(name, new File([text], name, { type: old.type || mime(name) }));
  invalidateRuntimeCaches();
  refreshFiles();
  renderProjectSummary();
  if (state.current) await select(state.current);
  state.audit = null;
  state.compare = null;
  $('scoreBox').innerHTML = '<div class="score">—</div><div class="muted">Edited. Run Audit when ready.</div>';
  $('metrics').innerHTML = '';
  $('findings').innerHTML = '<div class="muted">Project changed. Run Audit for updated issues.</div>';
  status('Edit applied');
  closeEditor();
}

// Clean AI repair prompt: no excessive separators, clean paragraphs, groups repeated bugs
export function buildBugPrompt(): string {
  if (!state.audit) {
    return 'Review this project and fix confirmed bugs. Preserve the current design and working behavior. Do not add extra features or redesign anything.';
  }
  const grouped = groupedFindings(state.audit.findings);
  const items = grouped.filter(x => x.scoreImpact !== false && x.confidence !== 'low').slice(0, 30);
  const reviews = grouped.filter(x => x.scoreImpact === false || x.confidence === 'low').slice(0, 12);

  let text = 'Repair this project without changing the current visual design or working behavior. Keep one clean implementation for each feature. Fix confirmed bugs first. Test every changed function and then run a full regression.\n\n';

  if (items.length) {
    text += 'Confirmed bugs:\n' + items.map((x, i) =>
      `${i + 1}. ${x.title}. ${shortText(x.plain, 220)}${x.file ? ` (File: ${x.file}${x.lines?.length ? `, lines ${x.lines.slice(0, 8).join(', ')}` : ''})` : ''}`
    ).join('\n') + '\n\n';
  } else {
    text += 'No confirmed code bug was found in the last audit. Check carefully before changing anything.\n\n';
  }

  if (reviews.length) {
    text += 'Review without assuming these are broken:\n' + reviews.map((x, i) =>
      `${i + 1}. ${x.title}. ${shortText(x.plain, 170)}`
    ).join('\n') + '\n\n';
  }

  text += 'Do not use temporary patches, duplicate functions, fake controls, or hidden old code.';
  return text;
}

export function openBugs() {
  closeMore();
  if (!runtime.files.size) { notice('Open a project first.'); return; }
  const grouped = state.audit ? groupedFindings(state.audit.findings) : [];
  const confirmed = grouped.filter(x => x.scoreImpact !== false && x.confidence !== 'low').length;
  $('bugSummary').textContent = state.audit
    ? `${confirmed} confirmed • ${grouped.length - confirmed} review`
    : 'Audit is still running or has not started.';
  ($('bugPrompt') as HTMLTextAreaElement).value = buildBugPrompt();
  $('bugsModal').classList.remove('hidden');
}

export function closeBugs() {
  $('bugsModal').classList.add('hidden');
}

export async function copyBugPrompt() {
  try {
    await navigator.clipboard.writeText(($('bugPrompt') as HTMLTextAreaElement).value);
    status('Prompt copied');
  } catch {
    status('Copy blocked');
  }
}

export function syncMobilePageSelect() {
  const selectEl = $('mobilePageSelect') as HTMLSelectElement;
  if (!selectEl) return;
  const pages = [...runtime.files.keys()].filter(n => /\.html?$/i.test(n));
  selectEl.innerHTML = pages.map(p => `<option value="${esc(p)}">${esc(p.split('/').pop())}</option>`).join('');
  selectEl.classList.toggle('hidden', pages.length < 2);
  if (state.current && pages.includes(state.current)) selectEl.value = state.current;
}

export function setViewerFull(on: boolean, { native = false } = {}) {
  main.classList.toggle('viewer-full', on);
  document.body.classList.toggle('full-active', on);
  $('exitFullBtn').classList.toggle('hidden', !on);
  if (native && on && document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(() => {});
  }
  if (native && !on && document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }
  setTimeout(applyFit, 80);
}

export function handleViewportChange() {
  const landscape = runtime.files.size > 0 && isMobileHost() && innerWidth > innerHeight;
  if (landscape && !main.classList.contains('viewer-full')) {
    state.autoLandscapeFull = true;
    setViewerFull(true);
  } else if (!landscape && state.autoLandscapeFull) {
    state.autoLandscapeFull = false;
    setViewerFull(false);
  }
  applyFit();
}

export function openPasteModal() {
  $('moreModal').classList.add('hidden');
  $('pasteModal').classList.remove('hidden');
  if (navigator.clipboard?.readText) {
    navigator.clipboard.readText().then(t => {
      if (!t) return;
      if (/^https?:\/\//i.test(t.trim())) {
        ($('pasteLink') as HTMLInputElement).value = t.trim();
        switchPaste('link');
      } else if (!($('pasteText') as HTMLTextAreaElement).value) {
        ($('pasteText') as HTMLTextAreaElement).value = t;
      }
    }).catch(() => {});
  }
}

export function closePasteModal() {
  $('pasteModal').classList.add('hidden');
}

export function switchPaste(mode: string) {
  document.querySelectorAll('.paste-tab').forEach(b => {
    (b as HTMLElement).classList.toggle('active', (b as HTMLElement).dataset.paste === mode);
  });
  $('pasteTextPanel').classList.toggle('hidden', mode !== 'text');
  $('pasteLinkPanel').classList.toggle('hidden', mode !== 'link');
}

export async function openPastedText() {
  const text = ($('pasteText') as HTMLTextAreaElement).value;
  if (!text.trim()) return;
  const type = ($('pasteType') as HTMLSelectElement).value;
  const name = `pasted.${type}`;
  const file = new File([text], name, { type: mime(name) });
  closePasteModal();
  await loadProject([file]);
}

export async function openPastedLink() {
  const url = ($('pasteLink') as HTMLInputElement).value.trim();
  if (!/^https?:\/\//i.test(url)) { notice('Paste a full web link.'); return; }
  status('Opening link…');
  try {
    const res = await fetch(url, { credentials: 'omit' });
    if (!res.ok) throw new Error(`The link returned ${res.status}`);
    const blob = await res.blob();
    let name = 'download';
    try {
      name = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'download');
    } catch {}
    if (!ext(name)) {
      if (blob.type.includes('zip')) name += '.zip';
      else if (blob.type.includes('html')) name += '.html';
      else name += '.bin';
    }
    closePasteModal();
    await loadProject([new File([blob], name, { type: blob.type || mime(name) })]);
  } catch {
    status('Link blocked');
    notice('I could not open that link directly. Open or share the actual file instead.');
  }
}

export function toggleFullScreen() {
  state.autoLandscapeFull = false;
  setViewerFull(!main.classList.contains('viewer-full'), { native: true });
}

export function openMore() { $('moreModal').classList.remove('hidden'); }
export function closeMore() { $('moreModal').classList.add('hidden'); }

function pushRuntimeError(item: any, isAudit: boolean) {
  const keys = isAudit ? state.auditRuntimeErrorKeys : state.runtimeErrorKeys;
  const list = isAudit ? state.auditRuntimeErrors : state.runtimeErrors;
  const key = [item.kind, item.message, item.file || ''].join('|');
  if (keys.has(key)) return;
  keys.add(key);
  list.push(item);
}

// Window message dispatcher
window.addEventListener('message', e => {
  const fromAudit = e.source === auditFrame.contentWindow;
  if (e.source !== frame.contentWindow && !fromAudit) return;
  const d = e.data || {};
  if (d.type === 'debooger-nav' && !fromAudit) {
    const p = norm(resolve(d.base, d.href));
    if (runtime.files.has(p)) select(p);
  } else if (d.type === 'debooger-runtime-error') {
    pushRuntimeError(d, fromAudit);
    if (!fromAudit) status('Running problem found');
  } else if (d.type === 'debooger-control-result' && fromAudit) {
    state.controlTests.push(d.result);
    renderControlTests();
  } else if (d.type === 'debooger-live-findings' && Array.isArray(d.findings) && fromAudit) {
    state.liveFindings.push(...d.findings);
  } else if (d.type === 'debooger-screenshot-started' && fromAudit) {
    state.screenshotAttempts++;
    renderScreenshots();
  } else if (d.type === 'debooger-screenshot' && fromAudit) {
    addScreenshot(d.shot);
  } else if (d.type === 'debooger-screenshot-error' && fromAudit) {
    state.screenshotFailures++;
    renderScreenshots();
  }

  const key = waiterKey(d.type, fromAudit ? auditFrame : frame);
  if (state.messageWaiters.has(key)) state.messageWaiters.get(key)!(d);
});

// Event listeners setup
export function initApp() {
  ['dragenter', 'dragover'].forEach(v =>
    $('dropzone').addEventListener(v, e => { e.preventDefault(); $('dropzone').classList.add('drag'); })
  );
  ['dragleave', 'drop'].forEach(v =>
    $('dropzone').addEventListener(v, e => { e.preventDefault(); $('dropzone').classList.remove('drag'); })
  );
  $('dropzone').addEventListener('drop', (e: DragEvent) => {
    const files = e.dataTransfer?.files;
    if (files?.length) loadProject(files);
  });

  const fileInput = $('fileInput') as HTMLInputElement;
  fileInput.addEventListener('change', () => {
    if (fileInput.files?.length) {
      loadProject(fileInput.files).finally(() => { try { fileInput.value = ''; } catch {} });
    }
  });

  $('pasteInlineBtn').onclick = openPasteModal;
  $('emptyPasteBtn').onclick = openPasteModal;
  $('trashInlineBtn').onclick = () => { closeMore(); clearProject(); };
  $('trashBtn').onclick = clearProject;
  $('editBtn').onclick = () => openEditor('edit');
  $('designBtn').onclick = () => openEditor('design');
  $('bugsBtn').onclick = openBugs;
  $('pasteBtn').onclick = openPasteModal;
  $('moreBtn').onclick = openMore;

  $('leftCollapseBtn').onclick = () => setPanelCollapsed('left', true);
  $('rightCollapseBtn').onclick = () => setPanelCollapsed('right', true);
  $('leftRestoreBtn').onclick = () => setPanelCollapsed('left', false);
  $('rightRestoreBtn').onclick = () => setPanelCollapsed('right', false);

  document.querySelectorAll('.mbtn').forEach(button => {
    (button as HTMLElement).onclick = () => showMobileSheet((button as HTMLElement).dataset.sheet as any);
  });

  $('closeMoreBtn').onclick = closeMore;
  $('moreModal').addEventListener('click', e => { if (e.target === $('moreModal')) closeMore(); });

  $('closePasteBtn').onclick = closePasteModal;
  $('closeEditorBtn').onclick = closeEditor;
  ($('editorFileSelect') as HTMLSelectElement).onchange = e => loadEditorFile((e.target as HTMLSelectElement).value);
  $('applyEditBtn').onclick = applyEditor;
  $('editorModal').addEventListener('click', e => { if (e.target === $('editorModal')) closeEditor(); });

  $('closeBugsBtn').onclick = closeBugs;
  $('copyBugPromptBtn').onclick = copyBugPrompt;
  $('bugsModal').addEventListener('click', e => { if (e.target === $('bugsModal')) closeBugs(); });

  $('mobileEditBtn').onclick = () => openEditor('edit');
  $('mobileDesignBtn').onclick = () => openEditor('design');
  $('mobileBugsBtn').onclick = openBugs;
  $('mobileFitWidthBtn').onclick = () => setFit('width');
  $('mobileFitPageBtn').onclick = () => setFit('page');
  $('mobileActualBtn').onclick = () => setFit('actual');
  $('mobileRunAuditBtn').onclick = () => { closeMore(); runAudit(); };
  $('mobileCopyBtn').onclick = () => { closeMore(); copyReport(); };
  $('mobileSaveBtn').onclick = () => { closeMore(); downloadReport(); };

  $('pasteModal').addEventListener('click', e => { if (e.target === $('pasteModal')) closePasteModal(); });
  document.querySelectorAll('.paste-tab').forEach(b => {
    (b as HTMLElement).onclick = () => switchPaste((b as HTMLElement).dataset.paste!);
  });
  $('openPasteTextBtn').onclick = openPastedText;
  $('openPasteLinkBtn').onclick = openPastedLink;

  $('fullBtn').onclick = toggleFullScreen;
  $('exitFullBtn').onclick = toggleFullScreen;
  $('fitWidthBtn').onclick = () => setFit('width');
  $('fitPageBtn').onclick = () => setFit('page');
  $('actualBtn').onclick = () => setFit('actual');
  $('zoomOutBtn').onclick = () => zoomBy(-0.1);
  $('zoomInBtn').onclick = () => zoomBy(0.1);

  const desktopWidth = $('desktopWidth') as HTMLSelectElement;
  desktopWidth.onchange = e => {
    state.desktopWidth = Number((e.target as HTMLSelectElement).value) || (isMobileHost() ? 1200 : 1440);
    applyDevice();
  };

  const mobileDesktopWidth = $('mobileDesktopWidth') as HTMLSelectElement;
  mobileDesktopWidth.onchange = e => {
    state.desktopWidth = Number((e.target as HTMLSelectElement).value) || (isMobileHost() ? 1200 : 1440);
    applyDevice();
  };

  const mobilePageSelect = $('mobilePageSelect') as HTMLSelectElement;
  mobilePageSelect.onchange = e => {
    const val = (e.target as HTMLSelectElement).value;
    if (val) { select(val); closeMore(); }
  };

  document.querySelectorAll('.device-btn').forEach(b => {
    (b as HTMLElement).onclick = () => setDevice((b as HTMLElement).dataset.device as DeviceMode);
  });

  document.addEventListener('click', async e => {
    const target = e.target as HTMLElement;
    const shotButton = target.closest?.('[data-shot-index]') as HTMLElement;
    if (shotButton) {
      e.preventDefault();
      showScreenshot(Number(shotButton.dataset.shotIndex) || 0);
      return;
    }
    const actionButton = target.closest?.('[data-audit-action]') as HTMLElement;
    if (actionButton) {
      e.preventDefault();
      const action = actionButton.dataset.auditAction;
      if (action === 'audit') await runAudit();
      else if (action === 'copy') await copyReport();
      else if (action === 'download') await downloadReport();
      return;
    }
    const historyButton = target.closest?.('[data-history-id]') as HTMLButtonElement;
    if (historyButton && !historyButton.disabled) {
      e.preventDefault();
      await openHistorySnapshot(historyButton.dataset.historyId!);
    }
  });

  $('closeShotBtn').onclick = closeScreenshot;
  $('prevShotBtn').onclick = () => showScreenshot(state.shotIndex - 1);
  $('nextShotBtn').onclick = () => showScreenshot(state.shotIndex + 1);
  $('shotModal').addEventListener('click', e => { if (e.target === $('shotModal')) closeScreenshot(); });

  window.addEventListener('resize', handleViewportChange);
  window.addEventListener('orientationchange', () => setTimeout(handleViewportChange, 100));
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && main.classList.contains('viewer-full') && document.fullscreenEnabled) {
      if (!state.autoLandscapeFull) setViewerFull(false);
    }
  });

  desktopWidth.value = String(state.desktopWidth);
  mobileDesktopWidth.value = String(state.desktopWidth);
  renderHistory();
  refreshFiles();
  renderControlTests();
  renderScreenshots();
  setProjectUi(false);
  applyDevice();
  frame.srcdoc = welcomeHtml();
  syncMobilePageSelect();
  handleViewportChange();
}
