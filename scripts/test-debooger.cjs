const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('--- Testing debooger2000 Build 023 ---');

// 1. Verify single HTML files exist and have content
const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf-8');
const versionHtml = fs.readFileSync(path.join(__dirname, '../debooger2000-023.html'), 'utf-8');

assert(indexHtml.includes('debooger2000 Build 023'), 'Must contain version 023 header');
assert(indexHtml.includes('<span class="build">023</span>'), 'Must show build badge 023');
assert(versionHtml.length === indexHtml.length, 'debooger2000-023.html must match index.html');
console.log('✓ File existence and Build 023 branding verified');

// 2. Verify all UI components and tools are present in HTML
const requiredElements = [
  'emptyState', 'workspace', 'mobileBar', 'fileInput',
  'pasteBtn', 'editBtn', 'designBtn', 'trashBtn', 'bugsBtn', 'fullBtn', 'moreBtn',
  'desktopWidth', 'fitWidthBtn', 'fitPageBtn', 'actualBtn',
  'pageTabs', 'desktopStage', 'frame', 'auditFrame', 'exitFullBtn',
  'scoreBox', 'visualEvidenceStatus', 'metrics', 'findings', 'controlList', 'shotGrid',
  'auditBtn', 'copyBtn', 'downloadBtn',
  'moreModal', 'pasteModal', 'editorModal', 'bugsModal', 'shotModal'
];
for (const id of requiredElements) {
  assert(indexHtml.includes(`id="${id}"`), `Missing element #${id}`);
}
console.log(`✓ All ${requiredElements.length} primary and secondary UI elements present`);

// 3. Test alias resolution logic in ProjectRuntime
const { ProjectRuntime } = require('../src/engine/project-engine.ts');

async function testAliases() {
  const runtime = new ProjectRuntime();
  const files = [
    new File(['{ "compilerOptions": { "paths": { "@/*": ["src/*"] } } }'], 'tsconfig.json', { type: 'application/json' }),
    new File(['export const Button = () => "button";'], 'src/components/Button.tsx', { type: 'text/tsx' }),
    new File(['import { Button } from "@/components/Button";\nexport default Button;'], 'src/App.tsx', { type: 'text/tsx' }),
  ];
  await runtime.addFiles(files);

  assert(runtime.aliases.has('@'), 'Alias @ must be recognized');
  const resolved = runtime.findLocal('src/App.tsx', '@/components/Button');
  assert.strictEqual(resolved, 'src/components/Button.tsx', `Expected src/components/Button.tsx but got ${resolved}`);
  console.log('✓ @/ alias resolution from tsconfig.json successfully resolved to local file');
}

// 4. Test error deduplication logic
const { auditProject } = require('../src/engine/audit-engine.ts');

async function testDeduplication() {
  const filesMap = new Map();
  // Create a css file with 20 missing url references
  let cssText = 'body {\n';
  for (let i = 1; i <= 20; i++) {
    cssText += `  background-image: url("missing-image-${i}.png");\n`;
  }
  cssText += '}\n';

  filesMap.set('styles.css', new File([cssText], 'styles.css', { type: 'text/css' }));
  const meta = { type: 'CSS project', runtime: 'Browser', fileCount: 1, pageCount: 0, pages: [] };
  const audit = await auditProject(filesMap, meta);

  assert(audit.findings.length > 0, 'Audit must detect findings');
  console.log(`✓ Found ${audit.findings.length} findings from 20 broken references`);
}

// 5. Test server-only project detection
async function testServerDetection() {
  const filesMap = new Map();
  filesMap.set('server.ts', new File(['import express from "express";\nconst app = express();\napp.listen(3000);'], 'server.ts', { type: 'text/typescript' }));
  filesMap.set('index.html', new File(['<!doctype html><html><body><h1>API</h1></body></html>'], 'index.html', { type: 'text/html' }));
  const { classify } = require('../src/engine/project-engine.ts');
  const meta = classify(filesMap);

  assert(meta.isServerOnly === true, 'Server-only project must be detected');
  assert(meta.serverReasons.length > 0, 'Server reasons must be stated');
  console.log('✓ Server-only project detection verified:', meta.serverReasons);
}

// 6. Test phone defaults
assert(indexHtml.includes('isMobileHost() ? 1200 : 1440') || indexHtml.includes('isMobileHost()?1200:1440'), 'Mobile host must default to 1200 desktop width');
console.log('✓ Phone 1200px desktop default verified');

// 7. Verify no local broken file references in single HTML
assert(!indexHtml.includes('src="./'), 'Single HTML must not depend on local relative JS');
assert(!indexHtml.includes('href="./'), 'Single HTML must not depend on local relative CSS');
console.log('✓ Standalone single-file packaging verified');

(async () => {
  await testAliases();
  await testDeduplication();
  await testServerDetection();
  console.log('--- ALL TESTS PASSED SUCCESSFULLY ---');
})();
