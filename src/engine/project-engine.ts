import { safeInlineScript, buildPreviewRuntime } from './preview-helper.ts';

const MIME: Record<string, string> = {
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  js: 'text/javascript',
  mjs: 'text/javascript',
  jsx: 'text/jsx',
  tsx: 'text/tsx',
  ts: 'text/typescript',
  json: 'application/json',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  xml: 'application/xml',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  pdf: 'application/pdf',
  zip: 'application/zip',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
};

const CODE_EXTS = ['ts', 'tsx', 'js', 'jsx', 'mjs'];

export const norm = (p: string): string =>
  String(p || '').replaceAll('\\', '/').replace(/^\.\//, '').replace(/^\//, '');

export const ext = (n: string): string => {
  const clean = String(n || '').split(/[?#]/)[0];
  const i = clean.lastIndexOf('.');
  return i < 0 ? '' : clean.slice(i + 1).toLowerCase();
};

export const mime = (n: string): string => MIME[ext(n)] || 'application/octet-stream';

export interface ProjectMeta {
  type: string;
  runtime: string;
  fileCount: number;
  pageCount: number;
  pages: string[];
  isServerOnly?: boolean;
  serverReasons?: string[];
  projectKey?: string;
  projectLabel?: string;
  codeFiles?: number;
  totalBytes?: number;
}

export function classify(files: Map<string, File>): ProjectMeta {
  const names = [...files.keys()].map(n => n.toLowerCase());
  const has = (n: string) => names.some(x => x === n || x.endsWith('/' + n));
  let type = 'Mixed project';
  let runtime = 'Browser';
  const serverReasons: string[] = [];

  // Check for server-side framework and backend features
  const hasServerFiles = names.some(x =>
    /(?:^|\/)(server\.(ts|js|mjs|cjs)|app\.(py|go|rb)|main\.(py|go|rs)|wsgi\.py|asgi\.py)$/i.test(x) ||
    /(?:^|\/)(api|routes)\/.*(route\.(ts|js)|index\.(ts|js))$/i.test(x)
  );

  if (has('package.json')) {
    if (names.some(x => x.includes('electron')) || has('electron.js') || has('main.cjs')) {
      type = 'Electron application';
      runtime = 'Desktop runtime + browser-style interface';
    } else if (names.some(x => x.includes('vite.config'))) {
      type = 'Vite web application';
      runtime = 'Vite client build';
    } else if (names.some(x => x.includes('next.config'))) {
      type = 'Next.js application';
      runtime = 'Next.js client/pages';
    } else if (names.some(x => x.endsWith('.jsx') || x.endsWith('.tsx'))) {
      type = 'React/Node application';
      runtime = 'React client runtime';
    } else {
      type = 'Node/JavaScript application';
      runtime = 'Node / browser client';
    }
  } else if (names.some(n => n.endsWith('.html') || n.endsWith('.htm'))) {
    type = names.filter(n => /\.html?$/.test(n)).length > 1 ? 'Multi-page website' : 'HTML website';
    runtime = 'Browser';
  } else if (names.some(n => /\.(jsx|tsx)$/.test(n))) {
    type = 'React-style source project';
    runtime = 'React client runtime';
  } else if (names.some(n => n.endsWith('.py'))) {
    type = 'Python project';
    runtime = 'Python backend';
    serverReasons.push('Contains Python backend source files (.py)');
  }

  // Detect server-only dependencies or backend code
  if (hasServerFiles) {
    serverReasons.push('Contains server entry point files (e.g. server.ts, api/ routes, or python app)');
  }

  const isServerOnly = serverReasons.length > 0;
  const pages = names.filter(n => /\.html?$/.test(n));

  return {
    type,
    runtime,
    fileCount: names.length,
    pageCount: pages.length,
    pages,
    isServerOnly,
    serverReasons: isServerOnly ? serverReasons : undefined
  };
}

function dirname(p: string): string {
  const i = p.lastIndexOf('/');
  return i >= 0 ? p.slice(0, i + 1) : '';
}

function cleanRef(ref: string): string {
  return String(ref || '').split('#')[0].split('?')[0];
}

export function resolve(base: string, ref: string): string {
  if (!ref || /^(data:|blob:|https?:|mailto:|tel:|javascript:|#|\/\/)/i.test(ref)) return ref;
  const clean = cleanRef(ref);
  if (clean.startsWith('/')) return norm(clean);
  const a = dirname(base).split('/').filter(Boolean);
  for (const x of clean.split('/')) {
    if (!x || x === '.') continue;
    if (x === '..') a.pop();
    else a.push(x);
  }
  return a.join('/');
}

function splitSrcset(value: string) {
  return String(value || '')
    .split(',')
    .map(x => x.trim())
    .filter(Boolean)
    .map(part => {
      const bits = part.split(/\s+/);
      return { url: bits.shift() || '', descriptor: bits.join(' ') };
    });
}

function isLocalRef(ref: string): boolean {
  return !!ref && !/^(data:|blob:|https?:|mailto:|tel:|javascript:|#|\/\/)/i.test(ref);
}

function isModuleLocalRef(ref: string, aliasPrefixes: string[] = []): boolean {
  if (!ref || /^(data:|blob:|https?:|mailto:|tel:|javascript:|#|\/\/)/i.test(ref)) return false;
  if (/^(\.?.?\/|\/)/.test(ref)) return true;
  for (const alias of aliasPrefixes) {
    if (ref === alias || ref.startsWith(alias + '/')) return true;
  }
  return false;
}

function isBareRef(ref: string, aliasPrefixes: string[] = []): boolean {
  return !!ref && !isModuleLocalRef(ref, aliasPrefixes) && !/^(data:|blob:|https?:|mailto:|tel:|javascript:|#|\/\/)/i.test(ref);
}

function packageRoot(spec: string): string {
  if (spec.startsWith('@')) return spec.split('/').slice(0, 2).join('/');
  return spec.split('/')[0];
}

function packageSubpath(spec: string): string {
  const root = packageRoot(spec);
  return spec.slice(root.length);
}

function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function textToBase64(source: string): string {
  const bytes = new TextEncoder().encode(String(source || ''));
  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function childModuleLauncher(source: string): string {
  const payload = textToBase64(source);
  return `{\n    const __b64=${JSON.stringify(payload)};\n    const __bin=atob(__b64);\n    const __bytes=new Uint8Array(__bin.length);\n    for(let __i=0;__i<__bin.length;__i++)__bytes[__i]=__bin.charCodeAt(__i);\n    const __url=URL.createObjectURL(new Blob([__bytes],{type:'text/javascript'}));\n    import(__url).finally(()=>setTimeout(()=>URL.revokeObjectURL(__url),1000));\n  }`;
}

export class ProjectRuntime {
  files: Map<string, File>;
  urls: Map<string, string>;
  bundleCache: Map<string, string>;
  packageVersions: Record<string, string>;
  compileErrors: Array<{ file: string; message: string }>;
  aliases: Map<string, string>; // e.g. '@' -> 'src', '@/components' -> 'src/components'
  serverOnlyDetected: boolean;
  serverReasons: string[];

  constructor() {
    this.files = new Map();
    this.urls = new Map();
    this.bundleCache = new Map();
    this.packageVersions = {};
    this.compileErrors = [];
    this.aliases = new Map();
    this.serverOnlyDetected = false;
    this.serverReasons = [];
  }

  clear() {
    for (const u of this.urls.values()) {
      if (u.startsWith('blob:')) URL.revokeObjectURL(u);
    }
    this.urls.clear();
    this.bundleCache.clear();
    this.files.clear();
    this.packageVersions = {};
    this.compileErrors = [];
    this.aliases.clear();
    this.serverOnlyDetected = false;
    this.serverReasons = [];
  }

  async addFiles(list: File[] | FileList) {
    this.clear();
    const out: File[] = [];
    for (const f of [...list]) {
      if (ext(f.name) === 'zip') {
        const JSZip = (globalThis as any).JSZip;
        if (typeof JSZip === 'undefined') {
          throw new Error('ZIP support did not load. Check the internet connection and try again.');
        }
        const z = await JSZip.loadAsync(f);
        for (const zf of Object.values(z.files).filter((x: any) => !x.dir && !/^__MACOSX\//i.test(x.name)) as any[]) {
          const b = await zf.async('blob');
          out.push(new File([b], norm(zf.name), { type: mime(zf.name) }));
        }
      } else {
        const n = (f as any).webkitRelativePath || f.name;
        out.push(new File([f], norm(n), { type: f.type || mime(n) }));
      }
    }
    for (const f of out) {
      this.files.set(norm(f.name), f);
    }
    await this.readPackageInfo();
    await this.readAliasConfig();
    this.checkServerOnly();
    return out;
  }

  async readPackageInfo() {
    const p = [...this.files.keys()].find(n => /(^|\/)package\.json$/i.test(n));
    if (!p) return;
    try {
      const text = await this.files.get(p)!.text();
      const j = JSON.parse(text);
      this.packageVersions = { ...(j.dependencies || {}), ...(j.devDependencies || {}) };
    } catch {
      this.packageVersions = {};
    }
  }

  async readAliasConfig() {
    this.aliases.clear();
    // Default fallback: if src directory exists, map '@' to 'src', else to root
    const hasSrc = [...this.files.keys()].some(k => k.startsWith('src/'));
    this.aliases.set('@', hasSrc ? 'src' : '');

    // 1. Inspect tsconfig.json or jsconfig.json
    const configNames = [...this.files.keys()].filter(n => /(^|\/)[tj]sconfig\.json$/i.test(n));
    for (const cName of configNames) {
      try {
        const text = await this.files.get(cName)!.text();
        // Remove comments from json
        const cleanJson = text.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
        const config = JSON.parse(cleanJson);
        const paths = config.compilerOptions?.paths || {};
        const baseUrl = norm(config.compilerOptions?.baseUrl || '');
        const configDir = dirname(cName);

        for (const [key, targets] of Object.entries(paths)) {
          if (!Array.isArray(targets) || !targets.length) continue;
          const cleanKey = key.replace(/\/\*$/, '');
          const targetStr = (targets[0] as string).replace(/\/\*$/, '');
          const resolvedTarget = norm(resolve(configDir, baseUrl ? resolve(configDir, baseUrl) + '/' + targetStr : targetStr));
          this.aliases.set(cleanKey, resolvedTarget);
        }
      } catch (_) {}
    }

    // 2. Inspect vite.config.*
    const viteConfigFiles = [...this.files.keys()].filter(n => /(^|\/)vite\.config\.[mc]?[jt]s$/i.test(n));
    for (const vName of viteConfigFiles) {
      try {
        const text = await this.files.get(vName)!.text();
        const vDir = dirname(vName);
        // Look for alias: { '@': path.resolve(__dirname, './src') } or alias: [ { find: '@', replacement: '...' } ]
        const objectMatches = text.matchAll(/['"]?(@[\w-]*)['"]?\s*:\s*(?:path\.resolve\([^)]*['"]([^'"]+)['"]\)|['"]([^'"]+)['"])/g);
        for (const m of objectMatches) {
          const alias = m[1];
          const target = m[2] || m[3];
          if (alias && target) {
            this.aliases.set(alias, norm(resolve(vDir, target)));
          }
        }
      } catch (_) {}
    }
  }

  checkServerOnly() {
    const meta = classify(this.files);
    this.serverOnlyDetected = !!meta.isServerOnly;
    this.serverReasons = meta.serverReasons || [];
  }

  isReactSourceProject(): boolean {
    const names = [...this.files.keys()];
    if (names.some(n => /\.html?$/i.test(n))) return false;
    return names.some(n => /\.(jsx|tsx)$/i.test(n)) || names.some(n => /(^|\/)package\.json$/i.test(n));
  }

  findReactEntry(): string | null {
    const names = [...this.files.keys()];
    const candidates = [
      'src/main.tsx', 'src/main.jsx', 'src/main.ts', 'src/main.js',
      'src/index.tsx', 'src/index.jsx', 'src/index.ts', 'src/index.js',
      'main.tsx', 'main.jsx', 'main.ts', 'main.js',
      'index.tsx', 'index.jsx', 'index.ts', 'index.js'
    ];
    for (const candidate of candidates) {
      const matches = names.filter(n => n === candidate || n.endsWith('/' + candidate));
      if (matches.length) {
        return matches.sort((a, b) => a.split('/').length - b.split('/').length)[0];
      }
    }
    return names.find(n => /(^|\/)(main|index)\.(tsx|jsx|ts|js)$/i.test(n)) ||
           names.find(n => /\.(tsx|jsx)$/i.test(n)) || null;
  }

  synthesizeReactHtml(): string | null {
    const entry = this.findReactEntry();
    if (!entry) return null;
    const usesTailwind = Object.keys(this.packageVersions).some(k => k === 'tailwindcss' || k.startsWith('@tailwindcss/'));
    const tw = usesTailwind
      ? `<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4.1.14" data-debooger-helper="tailwind"></script>`
      : '';
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Preview</title>
${tw}
</head>
<body>
<div id="root"></div>
<script type="module" src="/${entry}"></script>
</body>
</html>`;
  }

  entry(): string | undefined {
    const n = [...this.files.keys()];
    const priorities = [
      /(^|\/)dist\/index\.html?$/i,
      /(^|\/)build\/index\.html?$/i,
      /(^|\/)out\/index\.html?$/i,
      /(^|\/)index\.html?$/i,
      /(^|\/)public\/index\.html?$/i,
      /(^|\/)src\/index\.html?$/i
    ];
    for (const pattern of priorities) {
      const hit = n.find(x => pattern.test(x));
      if (hit) return hit;
    }
    const htmlEntry = n.find(x => /\.html?$/i.test(x));
    if (htmlEntry) return htmlEntry;
    if (this.isReactSourceProject()) return '__synthesized_react__';
    return n[0];
  }

  findLocal(base: string, spec: string): string {
    const raw = String(spec || '');
    const cleaned = norm(cleanRef(raw));
    const b = norm(base);

    // Compiled frontend build support (e.g. project/dist/index.html requesting /assets/app.js)
    const m = b.match(/^(.*?(?:dist|build|out))(?:\/|$)/i);
    const appRoot = m ? m[1] : (b.includes('/') ? b.slice(0, b.lastIndexOf('/')) : '');

    // Check alias resolution first!
    for (const [alias, target] of this.aliases) {
      if (raw === alias || raw.startsWith(alias + '/')) {
        const remainder = raw.slice(alias.length).replace(/^\//, '');
        const mapped = norm(target ? `${target}/${remainder}` : remainder);
        const resolved = this.findPathMatch(mapped);
        if (resolved) return resolved;
        return mapped;
      }
    }

    const roots = [
      raw.startsWith('/') && appRoot ? norm(`${appRoot}/${cleaned}`) : norm(resolve(base, raw))
    ];
    if (raw.startsWith('/') && !roots.includes(cleaned)) {
      roots.push(cleaned);
    }

    for (const resolved of roots) {
      const match = this.findPathMatch(resolved);
      if (match) return match;
    }
    return roots[0];
  }

  findPathMatch(path: string): string | null {
    path = norm(cleanRef(path));
    if (this.files.has(path)) return path;
    const e = ext(path);
    const candidates = e ? [path] : [
      ...CODE_EXTS.map(x => `${path}.${x}`),
      `${path}.json`,
      `${path}.css`,
      ...CODE_EXTS.map(x => `${path}/index.${x}`),
      `${path}/index.json`
    ];
    for (const cand of candidates) {
      if (this.files.has(cand)) return cand;
    }
    // Case-insensitive fallback
    const lowerMap = new Map([...this.files.keys()].map(k => [k.toLowerCase(), k]));
    for (const cand of candidates) {
      const match = lowerMap.get(cand.toLowerCase());
      if (match) return match;
    }
    return null;
  }

  async dataUrl(path: string): Promise<string | null> {
    path = norm(cleanRef(path));
    if (this.urls.has(path)) return this.urls.get(path)!;
    const f = this.files.get(path);
    if (!f) return null;
    const buf = await f.arrayBuffer();
    const b64 = bufToBase64(buf);
    const mt = f.type || mime(path) || 'application/octet-stream';
    const u = `data:${mt};base64,${b64}`;
    this.urls.set(path, u);
    return u;
  }

  objectUrl(path: string): string | null {
    path = norm(cleanRef(path));
    if (this.urls.has(path)) return this.urls.get(path)!;
    const f = this.files.get(path);
    if (!f) return null;
    const u = URL.createObjectURL(f);
    this.urls.set(path, u);
    return u;
  }

  externalUrl(spec: string): string {
    const root = packageRoot(spec);
    const sub = packageSubpath(spec);
    const version = String(this.packageVersions[root] || '').replace(/^[~^<>= ]+/, '');
    const pinned = version ? `${root}@${version}${sub}` : spec;
    const qs = (root === 'react' || root === 'react-dom') ? '?dev' : '?dev&external=react,react-dom';
    return `https://esm.sh/${pinned}${qs}`;
  }

  modulePresets(path: string) {
    const e = ext(path);
    const presets: any[] = [];
    if (e === 'ts' || e === 'tsx') {
      presets.push(['typescript', { allExtensions: true, isTSX: e === 'tsx' }]);
    }
    if (e === 'jsx' || e === 'tsx') {
      presets.push(['react', { runtime: 'automatic' }]);
    }
    return presets;
  }

  transpile(source: string, path: string): string {
    if (!['ts', 'tsx', 'jsx'].includes(ext(path))) return source;
    const Babel = (globalThis as any).Babel;
    if (typeof Babel === 'undefined') {
      throw new Error('The built-in React/TypeScript compiler did not load.');
    }
    try {
      return Babel.transform(source, {
        filename: path,
        sourceType: 'module',
        presets: this.modulePresets(path),
        retainLines: false
      }).code;
    } catch (err: any) {
      this.compileErrors.push({ file: path, message: String(err?.message || err) });
      throw new Error(`Could not compile ${path}: ${err?.message || err}`);
    }
  }

  collectSpecs(source: string, path = 'module.js'): string[] {
    const Babel = (globalThis as any).Babel;
    if (typeof Babel === 'undefined') {
      throw new Error('The built-in JavaScript/TypeScript parser did not load.');
    }
    const specs: string[] = [];
    const seen = new Set<string>();
    const collector = () => ({
      visitor: {
        ImportDeclaration(p: any) {
          const v = p.node.source?.value;
          if (v && !seen.has(v)) { seen.add(v); specs.push(v); }
        },
        ExportNamedDeclaration(p: any) {
          const v = p.node.source?.value;
          if (v && !seen.has(v)) { seen.add(v); specs.push(v); }
        },
        ExportAllDeclaration(p: any) {
          const v = p.node.source?.value;
          if (v && !seen.has(v)) { seen.add(v); specs.push(v); }
        },
        CallExpression(p: any) {
          if (p.node.callee?.type !== 'Import' || p.node.arguments?.length !== 1) return;
          const a = p.node.arguments[0];
          if (a?.type === 'StringLiteral' && a.value && !seen.has(a.value)) {
            seen.add(a.value);
            specs.push(a.value);
          }
        }
      }
    });

    try {
      Babel.transform(source, {
        filename: path,
        sourceType: 'module',
        presets: this.modulePresets(path),
        plugins: [collector],
        ast: false,
        code: false
      });
    } catch (err: any) {
      this.compileErrors.push({ file: path, message: String(err?.message || err) });
      throw new Error(`Could not parse ${path}: ${err?.message || err}`);
    }
    return specs;
  }

  isAssetModule(path: string): boolean {
    return !CODE_EXTS.includes(ext(path)) && ext(path) !== 'json' && ext(path) !== 'css';
  }

  async buildModuleBundle(entry: string): Promise<string> {
    entry = norm(cleanRef(entry));
    if (this.bundleCache.has(entry)) return this.bundleCache.get(entry)!;
    const Babel = (globalThis as any).Babel;
    if (typeof Babel === 'undefined') {
      throw new Error('The built-in React/TypeScript compiler did not load.');
    }

    const modules = new Map<string, { source: string; map: Map<string, string> }>();
    const assets = new Map<string, string>();
    const externals = new Map<string, string>();
    const cssModules = new Map<string, string>(); // path -> parsed CSS classes object code
    const visiting = new Set<string>();
    const aliasPrefixes = [...this.aliases.keys()];

    const walk = async (path: string) => {
      path = norm(cleanRef(path));
      if (modules.has(path) || assets.has(path) || visiting.has(path)) return;
      const f = this.files.get(path);
      if (!f) throw new Error(`Local module not found: ${path}`);

      if (this.isAssetModule(path)) {
        const uri = await this.dataUrl(path);
        assets.set(path, uri || '');
        return;
      }

      if (ext(path) === 'json') {
        const text = await f.text();
        let value: any;
        try {
          value = JSON.parse(text);
        } catch (err: any) {
          throw new Error(`Invalid JSON module ${path}: ${err?.message || err}`);
        }
        modules.set(path, {
          source: `module.exports = ${JSON.stringify(value)};`,
          map: new Map()
        });
        return;
      }

      if (ext(path) === 'css') {
        // Handle CSS module
        if (/\.module\.css$/i.test(path)) {
          const cssContent = await f.text();
          const classNames = [...cssContent.matchAll(/\.([a-zA-Z_-][\w-]*)/g)].map(m => m[1]);
          const classObj: Record<string, string> = {};
          for (const c of classNames) classObj[c] = c;
          cssModules.set(path, JSON.stringify(classObj));
        }
        return;
      }

      visiting.add(path);
      const source = await f.text();
      const specs = this.collectSpecs(source, path);
      const map = new Map<string, string>();

      for (const spec of specs) {
        if (/\.css(?:\?[#].*)?$/i.test(spec)) {
          if (/\.module\.css(?:\?[#].*)?$/i.test(spec)) {
            const cssPath = this.findLocal(path, spec);
            if (this.files.has(cssPath)) {
              await walk(cssPath);
              map.set(spec, `cssmod:${cssPath}`);
              continue;
            }
          }
          map.set(spec, 'css:');
          continue;
        }

        if (isModuleLocalRef(spec, aliasPrefixes)) {
          const local = this.findLocal(path, spec);
          if (!this.files.has(local)) {
            throw new Error(`Could not resolve '${spec}' from '${path}' (mapped to '${local}')`);
          }
          if (this.isAssetModule(local)) {
            await walk(local);
            map.set(spec, `asset:${local}`);
          } else if (ext(local) === 'css') {
            map.set(spec, 'css:');
          } else {
            await walk(local);
            map.set(spec, `local:${local}`);
          }
        } else if (isBareRef(spec, aliasPrefixes)) {
          if (!externals.has(spec)) {
            externals.set(spec, this.externalUrl(spec));
          }
          map.set(spec, `ext:${spec}`);
        }
      }

      visiting.delete(path);
      modules.set(path, { source, map });
    };

    await walk(entry);

    const compile = (source: string, path: string, map: Map<string, string>) => {
      const rewrite = () => ({
        visitor: {
          ImportDeclaration(p: any) {
            const v = p.node.source?.value;
            if (map.has(v)) {
              if (map.get(v) === 'css:') {
                p.remove();
              } else {
                p.node.source.value = map.get(v);
              }
            }
          },
          ExportNamedDeclaration(p: any) {
            const v = p.node.source?.value;
            if (v && map.has(v)) p.node.source.value = map.get(v);
          },
          ExportAllDeclaration(p: any) {
            const v = p.node.source?.value;
            if (v && map.has(v)) p.node.source.value = map.get(v);
          },
          CallExpression(p: any) {
            if (p.node.callee?.type !== 'Import' || p.node.arguments?.length !== 1) return;
            const a = p.node.arguments[0];
            if (a?.type !== 'StringLiteral' || !map.has(a.value)) return;
            const id = map.get(a.value);
            if (id === 'css:') {
              p.replaceWithSourceString('Promise.resolve({})');
            } else {
              p.replaceWithSourceString(`Promise.resolve().then(() => __require(${JSON.stringify(id)}))`);
            }
          }
        }
      });

      try {
        return Babel.transform(source, {
          filename: path,
          sourceType: 'module',
          presets: this.modulePresets(path),
          plugins: [rewrite, 'transform-modules-commonjs'],
          retainLines: false
        }).code;
      } catch (err: any) {
        this.compileErrors.push({ file: path, message: String(err?.message || err) });
        throw new Error(`Could not compile ${path}: ${err?.message || err}`);
      }
    };

    const extDecl: string[] = [];
    const extEntries: string[] = [];
    let i = 0;
    for (const [spec, url] of externals) {
      const name = `__ext${i++}`;
      extDecl.push(`import * as ${name} from ${JSON.stringify(url)};`);
      extEntries.push(`${JSON.stringify(`ext:${spec}`)}: Object.assign({ __esModule: true }, ${name})`);
    }

    const assetEntries = [...assets].map(([p, uri]) =>
      `${JSON.stringify(`asset:${p}`)}: { __esModule: true, default: ${JSON.stringify(uri)} }`
    );

    const cssModEntries = [...cssModules].map(([p, jsonStr]) =>
      `${JSON.stringify(`cssmod:${p}`)}: new Proxy(${jsonStr}, { get: (t, p) => (typeof p === 'string' && (t[p] || (p.startsWith('__') ? undefined : p))) })`
    );

    const moduleEntries: string[] = [];
    for (const [p, item] of modules) {
      const code = compile(item.source, p, item.map);
      moduleEntries.push(
        `${JSON.stringify(`local:${p}`)}: function(module, exports, __require) {\n${code}\n}`
      );
    }

    const bundle = `${extDecl.join('\n')}
const __externalModules = { ${extEntries.join(',')} };
const __assetModules = { ${assetEntries.join(',')} };
const __cssModules = { ${cssModEntries.join(',')} };
const __modules = { ${moduleEntries.join(',')} };
const __cache = Object.create(null);

function __require(id) {
  if (id === 'css:') return {};
  if (Object.prototype.hasOwnProperty.call(__externalModules, id)) return __externalModules[id];
  if (Object.prototype.hasOwnProperty.call(__assetModules, id)) return __assetModules[id];
  if (Object.prototype.hasOwnProperty.call(__cssModules, id)) return __cssModules[id];
  if (!Object.prototype.hasOwnProperty.call(__modules, id)) throw new Error('Unknown module ' + id);
  if (__cache[id]) return __cache[id].exports;
  const module = { exports: {} };
  __cache[id] = module;
  __modules[id](module, module.exports, __require);
  return module.exports;
}

__require(${JSON.stringify(`local:${entry}`)});`;

    this.bundleCache.set(entry, bundle);
    return bundle;
  }

  async cssRewrite(css: string, base: string, seen = new Set<string>()): Promise<string> {
    if (seen.has(base)) return css;
    seen.add(base);

    css = css.replace(/@import\s+["']tailwindcss["']\s*;?/gi, '');
    css = css.replace(/@import\s+["']tailwindcss\/[^"']*["']\s*;?/gi, '');

    for (const m of [...css.matchAll(/@import\s+(?:url\()?['"]?([^'")\s]+)['"]?\)?\s*;?/gi)]) {
      const p = this.findLocal(base, m[1]);
      const f = this.files.get(p);
      if (f && ext(p) === 'css') {
        const imported = await this.cssRewrite(await f.text(), p, seen);
        css = css.replace(m[0], `\n${imported}\n`);
      }
    }

    for (const m of [...css.matchAll(/url\((['"]?)([^'"]+)\1\)/g)]) {
      const ref = m[2].trim();
      if (!isLocalRef(ref)) continue;
      const u = await this.dataUrl(this.findLocal(base, ref));
      if (u) css = css.split(m[0]).join(`url("${u}")`);
    }
    return css;
  }

  async injectProjectCss(d: Document, alreadyInlined = new Set<string>()) {
    const cssFiles = [...this.files.keys()].filter(n => ext(n) === 'css' && !alreadyInlined.has(n));
    if (!cssFiles.length) return;
    const usesTailwind = cssFiles.some(n => n.toLowerCase().includes('tailwind')) ||
      Object.keys(this.packageVersions).some(k => k === 'tailwindcss' || k.startsWith('@tailwindcss/'));

    if (usesTailwind && !d.querySelector('script[data-debooger-helper="tailwind"]')) {
      const tw = d.createElement('script');
      tw.src = 'https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4.1.14';
      tw.setAttribute('data-debooger-helper', 'tailwind');
      d.head.appendChild(tw);
    }

    for (const p of cssFiles) {
      const st = d.createElement('style');
      if (usesTailwind) st.type = 'text/tailwindcss';
      st.setAttribute('data-debooger-source', p);
      st.textContent = await this.cssRewrite(await this.files.get(p)!.text(), p);
      d.head.appendChild(st);
    }
  }

  async htmlRewrite(src: string, base: string, inject = ''): Promise<string> {
    const d = new DOMParser().parseFromString(src, 'text/html');

    // Remove document-level CSP meta tags that block sandbox helpers
    d.querySelectorAll('meta[http-equiv]').forEach(m => {
      const v = (m.getAttribute('http-equiv') || '').toLowerCase();
      if (v === 'content-security-policy' || v === 'content-security-policy-report-only') m.remove();
    });

    // Inline linked stylesheets
    const inlinedCss = new Set<string>();
    for (const l of [...d.querySelectorAll('link[rel="stylesheet"][href]')]) {
      const p = this.findLocal(base, l.getAttribute('href') || '');
      const f = this.files.get(p);
      if (f) {
        const st = d.createElement('style');
        st.setAttribute('data-debooger-source', p);
        st.textContent = await this.cssRewrite(await f.text(), p);
        l.replaceWith(st);
        inlinedCss.add(p);
      }
    }
    await this.injectProjectCss(d, inlinedCss);

    for (const l of [...d.querySelectorAll('link[href]')]) {
      if ((l.getAttribute('rel') || '').toLowerCase() === 'stylesheet') continue;
      const ref = l.getAttribute('href') || '';
      if (!isLocalRef(ref)) continue;
      const u = await this.dataUrl(this.findLocal(base, ref));
      if (u) l.setAttribute('href', u);
    }

    // Images, video, audio
    for (const el of [...d.querySelectorAll('[src],[poster]')].filter(el => el.tagName !== 'SCRIPT')) {
      for (const a of ['src', 'poster']) {
        const r = el.getAttribute(a);
        if (!r || !isLocalRef(r)) continue;
        const u = await this.dataUrl(this.findLocal(base, r));
        if (u) el.setAttribute(a, u);
      }
    }

    // Srcsets
    for (const el of [...d.querySelectorAll('[srcset]')]) {
      const parts = splitSrcset(el.getAttribute('srcset') || '');
      const next: string[] = [];
      for (const item of parts) {
        const u = isLocalRef(item.url) ? await this.dataUrl(this.findLocal(base, item.url)) : null;
        next.push(`${u || item.url}${item.descriptor ? ' ' + item.descriptor : ''}`);
      }
      if (next.length) el.setAttribute('srcset', next.join(', '));
    }

    // Inline styles
    for (const el of [...d.querySelectorAll('[style]')]) {
      el.setAttribute('style', await this.cssRewrite(el.getAttribute('style') || '', base));
    }

    // Scripts
    for (const s of [...d.querySelectorAll('script[src]')]) {
      const raw = s.getAttribute('src') || '';
      if (!isLocalRef(raw)) continue;
      const p = this.findLocal(base, raw);
      const f = this.files.get(p);
      if (!f) continue;
      const explicitType = (s.getAttribute('type') || '').toLowerCase();
      if (explicitType === 'module') {
        const bundle = await this.buildModuleBundle(p);
        const ns = d.createElement('script');
        ns.setAttribute('type', 'module');
        ns.setAttribute('data-debooger-source', p);
        ns.textContent = childModuleLauncher(bundle);
        s.replaceWith(ns);
        continue;
      }
      const ns = d.createElement('script');
      let text = await f.text();
      if (['ts', 'tsx', 'jsx'].includes(ext(p))) {
        try {
          text = this.transpile(text, p);
        } catch (_) {}
      }
      ns.textContent = safeInlineScript(text);
      for (const a of [...s.attributes]) {
        if (a.name !== 'src') ns.setAttribute(a.name, a.value);
      }
      ns.setAttribute('data-debooger-source', p);
      s.replaceWith(ns);
    }

    // Capture helper (html2canvas)
    const capture = d.createElement('script');
    capture.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
    capture.setAttribute('data-debooger-helper', 'screenshot');
    d.body.appendChild(capture);

    // Navigation and error interception
    const origin = typeof location !== 'undefined' && location.origin && location.origin !== 'null'
      ? location.origin
      : '*';
    const nav = d.createElement('script');
    nav.textContent = safeInlineScript(buildPreviewRuntime(base, origin));
    d.body.appendChild(nav);

    if (inject) d.head.insertAdjacentHTML('beforeend', inject);
    return '<!doctype html>\n' + d.documentElement.outerHTML;
  }
}
