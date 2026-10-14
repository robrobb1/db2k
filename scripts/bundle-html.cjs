const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

// 1. Bundle TypeScript engine files into standalone IIFE JavaScript
const bundleResult = esbuild.buildSync({
  entryPoints: [path.join(__dirname, '../src/engine/main.ts')],
  bundle: true,
  format: 'iife',
  target: 'es2022',
  write: false,
  minify: false,
});

const bundledJs = bundleResult.outputFiles[0].text;

// 2. HTML template based on Build 022 with Build 023 enhancements
const htmlContent = `<!doctype html>
<!-- debooger2000 Build 023 — hardened React/Vite/aliases + background audit + mobile viewer -->
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#f5f7f5">
<title>debooger2000</title>
<meta name="description" content="Project viewer and debugger for web applications, ZIP archives, HTML, and React source projects.">
<meta property="og:title" content="debooger2000">
<meta property="og:description" content="Project viewer and debugger for web applications, ZIP archives, HTML, and React source projects.">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
/* debooger2000 build 023 — preserved visual system, repaired mobile viewer */
:root{
  --bg:#f5f7f5;--surface:#ffffff;--surface-2:#f8faf8;--surface-3:#f1f4f1;
  --line:#dde3dd;--line-strong:#c8d0c8;--text:#23272b;--text-2:#5f6962;--text-3:#88918b;
  --green:#4bb229;--green-dark:#378b22;--green-soft:#eff8ec;--green-line:#c9e4bf;
  --amber:#c88b28;--amber-dark:#9b6819;--amber-soft:#fff7e8;--amber-line:#edd6aa;
  --red:#b94238;--red-soft:#fff2f0;--red-line:#efcfcb;
  --shadow:0 1px 2px rgba(26,34,28,.04),0 10px 28px rgba(26,34,28,.06);
  --shadow-pop:0 24px 70px rgba(21,28,23,.22);
  --r1:8px;--r2:12px;--r3:16px;--pill:999px;
  --xs:11px;--sm:12px;--md:13px;--lg:15px;--xl:18px;
  --top:58px;--mobilebar:54px;--left:258px;--right:326px;
  --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
}
*{box-sizing:border-box}
html,body{height:100%;margin:0}
body{font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;font-size:var(--md);color:var(--text);background:var(--bg);-webkit-font-smoothing:antialiased}
button,input,select,textarea{font:inherit;color:inherit}
button,label{-webkit-tap-highlight-color:transparent}
button{touch-action:manipulation}
h1,h2,p,dl,dd,dt,ul{margin:0}
.app{height:100dvh;display:flex;flex-direction:column;overflow:hidden}
.hidden{display:none!important}.spacer{flex:1}.desktop-only{display:inline-flex}.mobile-only{display:none}
.muted,.small{color:var(--text-2);font-size:var(--sm);line-height:1.5}.mono{font-family:var(--mono);font-size:var(--xs);line-height:1.55;white-space:pre-wrap;word-break:break-word}
.eyebrow,.field-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-3)}

.topbar{height:var(--top);flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:0 14px;background:rgba(255,255,255,.98);border-bottom:1px solid var(--line);box-shadow:0 2px 14px rgba(29,39,31,.04);z-index:30}
.brand{display:flex;align-items:center;gap:8px;font-size:15px;font-weight:650;letter-spacing:-.02em}.brand-mark{width:10px;height:10px;border-radius:3px;background:var(--green);box-shadow:inset 0 0 0 1px rgba(0,0,0,.04)}
.build,.status,.count{font-size:10px;font-weight:600;border-radius:var(--pill);white-space:nowrap}.build{padding:3px 7px;background:var(--green-soft);border:1px solid var(--green-line);color:var(--green-dark)}.status{padding:4px 8px;background:var(--surface-2);border:1px solid var(--line);color:var(--text-2);max-width:220px;overflow:hidden;text-overflow:ellipsis}.count{padding:2px 7px;background:var(--surface-3);color:var(--text-2)}

.btn,.select,.field{border:1px solid var(--line-strong);background:var(--surface);border-radius:var(--r1);font-size:var(--sm)}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:34px;padding:7px 11px;font-weight:600;cursor:pointer;white-space:nowrap;text-align:center;transition:background .14s,border-color .14s,transform .08s,box-shadow .14s}
.btn:hover{background:var(--surface-2);border-color:#b8c2b9}.btn:active{transform:translateY(1px)}
.btn.primary{background:var(--green-dark);border-color:var(--green-dark);color:#fff;box-shadow:0 1px 2px rgba(31,91,21,.12)}.btn.primary:hover{background:#307b1e;border-color:#307b1e}.btn.ghost{background:var(--surface)}.btn.full{width:100%}.btn.compact{min-height:30px;padding:5px 9px;font-size:11px}.icon-btn{display:inline-grid;place-items:center;min-width:32px;padding:6px}.top-upload{padding-inline:13px}.top-upload span{font-size:16px;line-height:0;margin-right:2px}.native-upload{user-select:none}body.empty-mode .top-upload{display:none}
.btn:focus-visible,.seg:focus-visible,.file-item:focus-visible,.tab:focus-visible,.mbtn:focus-visible,.restore:focus-visible,.dropzone:focus-visible,.shot:focus-visible,.field:focus,.select:focus{outline:2px solid rgba(75,178,41,.32);outline-offset:2px}
.select{height:30px;padding:4px 9px}.field{width:100%;padding:8px 10px;margin-bottom:8px;background:#fff}.switch{display:inline-flex;align-items:center;gap:6px;color:var(--text-2);font-size:var(--sm);cursor:pointer}.switch.compact{font-size:11px}.field-label{margin:12px 0 7px}

.segmented{display:inline-flex;gap:2px;padding:2px;background:var(--surface-3);border:1px solid var(--line);border-radius:9px}.seg{border:0;background:transparent;color:var(--text-2);padding:5px 10px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer}.seg.active{background:#fff;color:var(--green-dark);box-shadow:0 1px 4px rgba(27,37,29,.09)}.segmented.full-width{display:flex;width:100%}.segmented.full-width .seg{flex:1}

.project-tool{display:inline-flex;align-items:center;gap:5px;min-height:32px;padding:6px 8px;font-weight:500}.tool-glyph{width:15px;height:15px;display:inline-grid;place-items:center;font-size:14px;line-height:1}.tool-label{font-size:11px}.full-icon{width:33px;min-width:33px;padding:0;font-size:16px}body.empty-mode .project-tool{display:none}.mobile-tools{display:none}.tool-section{padding:11px 0;border-bottom:1px solid var(--line)}.tool-section:last-child{border-bottom:0}.tool-section-title{margin-bottom:8px;color:var(--text-3);font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.07em}.tool-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.tool-row{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.tool-row .btn{flex:0 0 auto}.zoom-readout{min-width:46px;text-align:center;font-size:11px;color:var(--text-2)}.audit-frame{position:fixed;left:-100000px;top:0;width:1440px;height:900px;opacity:0;pointer-events:none;border:0}.editor-card,.bugs-card{width:min(920px,100%)}.editor-area,.bug-area{min-height:52dvh;font-family:var(--mono);line-height:1.5;resize:vertical}.bug-summary{margin-bottom:8px}.modal-actions{display:flex;justify-content:flex-end;gap:7px;margin-top:8px}

/* opening screen */
.empty{flex:1;min-height:0;display:grid;place-items:center;padding:28px;background:radial-gradient(circle at 22% 18%,rgba(75,178,41,.055),transparent 28%),linear-gradient(180deg,#fafcf9 0%,#f4f6f4 100%)}
.empty-shell{width:min(1220px,100%);display:grid;grid-template-columns:minmax(0,1fr) 520px;gap:44px;align-items:center}
.empty-intro{min-width:0}.empty-intro h1{max-width:650px;margin:7px 0 13px;font-size:clamp(31px,3vw,43px);line-height:1.08;letter-spacing:-.04em;font-weight:650}.empty-intro>p{max-width:690px;color:var(--text-2);font-size:15px;line-height:1.68}
.feature-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin-top:24px}.feature{display:grid;grid-template-columns:28px 1fr;gap:9px;padding:12px;background:rgba(255,255,255,.72);border:1px solid var(--line);border-radius:10px}.feature strong{display:block;font-size:12px;font-weight:650;margin-bottom:3px}.feature span:not(.feature-icon){display:block;color:var(--text-2);font-size:10.5px;line-height:1.45}.feature-icon{display:grid;place-items:center;width:26px;height:26px;border-radius:7px;font-size:12px;font-weight:800}.feature-icon.green{background:var(--green-soft);border:1px solid var(--green-line);color:var(--green-dark)}.feature-icon.amber{background:var(--amber-soft);border:1px solid var(--amber-line);color:var(--amber-dark)}
.open-card{padding:22px;border:1px solid #d5ddd4;border-radius:16px;background:rgba(255,255,255,.94);box-shadow:0 18px 60px rgba(31,52,32,.10)}.open-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}.open-card h2{margin-top:4px;font-size:18px;letter-spacing:-.025em;font-weight:650}.safe-badge{display:inline-flex;align-items:center;gap:6px;padding:4px 7px;border-radius:var(--pill);background:var(--surface-2);border:1px solid var(--line);color:var(--text-2);font-size:9.5px;white-space:nowrap}.safe-badge span{width:6px;height:6px;border-radius:50%;background:var(--green)}
.dropzone{width:100%;min-height:246px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;padding:22px;border:1.5px dashed #b8c8b6;border-radius:12px;background:#fbfcfb;color:var(--text-2);cursor:pointer;text-align:center}.dropzone:hover,.dropzone.drag{border-color:var(--green);background:var(--green-soft)}.dropzone strong{color:var(--text);font-size:14px}.dropzone>span:last-child{max-width:300px;font-size:11px;line-height:1.5}.drop-icon{display:grid;place-items:center;width:40px;height:40px;margin-bottom:3px;border-radius:11px;background:var(--green-dark);color:#fff;font-size:23px;line-height:1;box-shadow:0 7px 20px rgba(55,139,34,.2)}
.empty-actions{display:grid;grid-template-columns:1fr;gap:7px;margin-top:10px}.hint{margin-top:11px;color:var(--text-3);font-size:9.5px;text-align:center;letter-spacing:.025em}.file-input{position:fixed;left:-10000px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden}

/* workspace */
.workspace{flex:1;min-height:0;display:grid;grid-template-columns:var(--left) minmax(0,1fr) var(--right);position:relative;background:var(--bg)}
body.left-collapsed .workspace{grid-template-columns:0 minmax(0,1fr) var(--right)}body.right-collapsed .workspace{grid-template-columns:var(--left) minmax(0,1fr) 0}body.left-collapsed.right-collapsed .workspace{grid-template-columns:0 minmax(0,1fr) 0}
body.left-collapsed .panel-left,body.right-collapsed .panel-right{display:none}
.panel{min-width:0;overflow:auto;overscroll-behavior:contain;padding:11px;background:#f8faf8}.panel-left{border-right:1px solid var(--line)}.panel-right{border-left:1px solid var(--line)}
.panel-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:1px 0 9px;padding:0 2px}.panel-title,.preview-title{margin-top:2px;font-size:14px;font-weight:650;letter-spacing:-.015em}
.quick-open{margin-bottom:9px;padding-bottom:9px;border-bottom:1px solid var(--line)}
.restore{position:absolute;top:11px;z-index:7;border:1px solid var(--green-line);background:#fff;color:var(--green-dark);border-radius:7px;padding:6px 8px;cursor:pointer;box-shadow:var(--shadow)}.restore-left{left:8px}.restore-right{right:8px}
.block{margin-bottom:9px;overflow:hidden;background:#fff;border:1px solid var(--line);border-radius:10px;box-shadow:0 1px 2px rgba(29,37,31,.025)}.project-summary-block,.audit-score-block{border-top:2px solid var(--green)}.attention-block{border-top:2px solid var(--amber)}.screenshot-block{border-top:2px solid #d6e8cf}
.block-h{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 11px;border-bottom:1px solid var(--line);font-size:11px;font-weight:650}.block-b{padding:11px}.block-b.tight{padding:6px}.disclose-block>summary{cursor:pointer;list-style:none}.disclose-block>summary::-webkit-details-marker{display:none}.disclose-block:not([open])>.block-h{border-bottom:0}.disclose-block>summary::after{content:"";width:6px;height:6px;border-right:1.5px solid var(--text-3);border-bottom:1.5px solid var(--text-3);transform:rotate(45deg);margin-left:auto}.disclose-block[open]>summary::after{transform:rotate(225deg)}
.headline{font-size:12px;font-weight:600;line-height:1.5}.facts{display:grid;grid-template-columns:auto 1fr;gap:4px 9px;margin-top:9px;font-size:11px}.facts dt{color:var(--text-2)}.facts dd{font-weight:550;word-break:break-word}.mini-details{margin-top:9px;padding-top:8px;border-top:1px solid var(--line)}.mini-details summary{cursor:pointer;color:var(--green-dark);font-size:11px;list-style:none}.provider-note{margin-top:8px}
.file-list{display:flex;flex-direction:column;gap:2px;max-height:380px;overflow:auto}.file-item,.history-item{width:100%;padding:8px;border:1px solid transparent;border-radius:7px;background:transparent;text-align:left;cursor:pointer}.file-item:hover,.history-item:hover{background:var(--surface-2)}.file-item.active{background:var(--green-soft);border-color:var(--green-line)}.file-path{display:block;color:var(--text);font-size:11px;font-weight:600;line-height:1.35;word-break:break-word}.file-desc{display:block;margin-top:2px;color:var(--text-2);font-size:10px;line-height:1.42}.file-meta{display:block;margin-top:2px;color:var(--text-3);font-size:9px}.history-item{margin-bottom:5px;border-color:var(--line);background:#fff;font-size:11px}.history-item strong{display:block;margin-bottom:2px;font-size:11px;font-weight:600}

.main{min-width:0;min-height:0;display:flex;flex-direction:column;background:#eef1ee;position:relative;overflow:hidden}.preview-headbar{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:49px;padding:8px 10px;background:#fff;border-bottom:1px solid var(--line)}.preview-heading{flex:0 0 auto}.toolbar{display:flex;align-items:center;justify-content:flex-end;gap:6px;min-width:0}.adapt-switch{margin-left:2px}.tabs{display:flex;gap:4px;padding:6px 8px 0;background:#fff;overflow:auto}.tab{border:1px solid var(--line);border-bottom:0;background:var(--surface-2);padding:6px 9px;border-radius:7px 7px 0 0;font-size:10px;cursor:pointer}.tab.active{background:#eef1ee;color:var(--green-dark)}
.notice{margin:7px 8px 0;padding:8px 10px;border:1px solid var(--amber-line);border-radius:8px;background:var(--amber-soft);color:#6f4b11;font-size:11px;line-height:1.45}.viewer-shell{flex:1;min-height:0;overflow:auto;padding:10px;background:#e8ece8}.stage-wrap{min-width:100%;min-height:100%;display:flex;align-items:flex-start;justify-content:center}.device-stage{transform-origin:top center;background:#fff;box-shadow:0 8px 32px rgba(26,35,28,.14);transition:width .18s,height .18s,transform .18s}.device-frame{display:block;width:100%;height:100%;border:0;background:#fff}.desktop-stage{width:1440px;height:900px}.viewer-full{position:fixed!important;inset:0!important;z-index:100;background:#e8ece8!important}.viewer-full .preview-headbar,.viewer-full .tabs{display:none}.viewer-full .viewer-shell{padding:0}.viewer-float{position:fixed;right:16px;top:16px;z-index:130;padding:8px 12px;border:1px solid var(--line);border-radius:8px;background:#fff;box-shadow:var(--shadow);cursor:pointer}

.score{font-size:30px;font-weight:650;letter-spacing:-.04em;line-height:1}.score-line{display:grid;grid-template-columns:auto 1fr;gap:11px;align-items:center}.score-denom{font-size:12px;color:var(--text-3);letter-spacing:0}.score.good{color:var(--green-dark)}.score.warn{color:var(--amber-dark)}.score.bad{color:var(--red)}.score-message{font-size:11px;font-weight:650;line-height:1.35}.visual-status{margin-top:9px;padding:7px 8px;border-radius:7px;font-size:10px;line-height:1.4}.visual-status.neutral{background:var(--surface-2);border:1px solid var(--line);color:var(--text-2)}.visual-status.good{background:var(--green-soft);border:1px solid var(--green-line);color:var(--green-dark)}.visual-status.warn{background:var(--amber-soft);border:1px solid var(--amber-line);color:var(--amber-dark)}
.metric-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:6px;margin-top:8px}.metric{padding:8px;border:1px solid var(--line);border-radius:7px;background:var(--surface-2)}.metric b{display:block;font-size:14px;font-weight:650}.metric span{display:block;margin-top:1px;color:var(--text-2);font-size:9px;line-height:1.35}
.finding{margin-bottom:6px;border:1px solid var(--line);border-radius:8px;background:#fff;overflow:hidden}.finding>summary{padding:9px;cursor:pointer;list-style:none}.finding>summary::-webkit-details-marker{display:none}.finding p{margin:0;padding:0 9px 10px;color:var(--text-2);font-size:10px;line-height:1.5}.finding strong{font-size:11px}.finding.good{border-color:var(--green-line);background:var(--green-soft)}.finding.warn{border-color:var(--amber-line);background:var(--amber-soft)}.finding.bad{border-color:var(--red-line);background:var(--red-soft)}.finding.review{border-color:var(--line)}.severity{display:inline-flex;margin:0 5px 4px 0;padding:2px 5px;border-radius:var(--pill);font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:.05em}.severity.pass{background:#ddf2d6;color:var(--green-dark)}.severity.warning{background:#f9e8c7;color:var(--amber-dark)}.severity.error{background:#f7dcd8;color:var(--red)}.severity.review{background:#ecefec;color:var(--text-2)}.simple-line{margin-top:4px;color:var(--text-2);font-size:10px;line-height:1.45}.finding-where{margin-top:4px;color:var(--text-3);font-size:9px;word-break:break-word}.finding-success{padding:9px}.more-findings{padding:8px;color:var(--text-2);font-size:10px}
.control-test{padding:8px 0;border-bottom:1px solid var(--line)}.control-test:last-child{border-bottom:0}.control-test strong{font-size:11px}.control-status{display:inline-block;margin-right:5px;font-size:9px;font-weight:700}.control-test.good .control-status{color:var(--green-dark)}.control-test.bad .control-status{color:var(--red)}
.shot-status{margin-bottom:7px}.shot-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.shot{padding:0;border:1px solid var(--line);border-radius:7px;background:#fff;overflow:hidden;cursor:pointer}.shot img{display:block;width:100%;aspect-ratio:16/10;object-fit:cover}.shot-label{display:block;padding:5px;color:var(--text-2);font-size:9px;text-align:left}.actions{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding-bottom:3px}.actions .full-span{grid-column:1/-1}

.mobilebar{height:var(--mobilebar);flex:0 0 auto;display:none;background:#fff;border-top:1px solid var(--line);z-index:40}.mbtn{flex:1;border:0;background:#fff;color:var(--text-2);font-size:11px;font-weight:600}.mbtn.active{color:var(--green-dark);box-shadow:inset 0 2px 0 var(--green)}
.modal{position:fixed;inset:0;z-index:200;display:grid;place-items:center;padding:18px;background:rgba(30,38,32,.52);backdrop-filter:blur(3px)}.modal-card{width:min(620px,100%);max-height:min(760px,92dvh);overflow:auto;border:1px solid var(--line);border-radius:13px;background:#fff;box-shadow:var(--shadow-pop)}.modal-card.narrow{width:min(390px,100%)}.modal-card.wide{width:min(1080px,100%)}.modal-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;border-bottom:1px solid var(--line)}.modal-head strong{font-size:13px}.modal-body{padding:14px}.stack{display:grid;gap:7px}.paste-tabs{margin-bottom:11px}.paste-area{min-height:250px;resize:vertical}.paste-row{display:grid;grid-template-columns:160px 1fr;gap:8px;align-items:start}.paste-row .field{margin:0}.paste-link-button{margin-top:10px}.shot-card{overflow:hidden}.shot-view{display:grid;place-items:center;min-height:300px;max-height:70dvh;padding:10px;background:#eef1ee}.shot-view img{display:block;max-width:100%;max-height:66dvh;object-fit:contain;box-shadow:var(--shadow)}.shot-nav{display:flex;justify-content:space-between;padding:10px 12px;border-top:1px solid var(--line)}.shot-modal-meta{margin-top:2px;color:var(--text-2);font-size:10px}

@media (max-width:1180px){:root{--left:230px;--right:300px}.adapt-switch{display:none}.empty-shell{grid-template-columns:minmax(0,1fr) 390px;gap:30px}.feature-row{grid-template-columns:1fr}}
@media (max-width:900px){
  :root{--top:52px}.desktop-only{display:none!important}.mobile-only{display:inline-grid}.topbar{padding:0 7px;gap:5px}.status{display:none}.brand{font-size:13px;gap:6px}.top-upload{display:none}.project-tool{width:31px;min-width:31px;height:31px;padding:0;justify-content:center}.project-tool .tool-label{display:none}.full-icon{width:31px;min-width:31px;height:31px}.mobile-tools{display:block}
  .empty{padding:12px}.empty-shell{width:min(620px,100%);grid-template-columns:1fr;gap:14px}.empty-intro h1{font-size:28px}.empty-intro>p{font-size:13px}.feature-row{display:none}.open-card{padding:15px}.dropzone{min-height:176px}
  .workspace{display:block;position:relative}.panel,.main{position:absolute;inset:0}.panel{padding:9px}.panel-left,.panel-right{display:none;border:0}.main{display:flex}.sheet-left .main,.sheet-right .main{display:none}.sheet-left .panel-left{display:block}.sheet-right .panel-right{display:block}.mobilebar{display:flex}.panel-toggle,.restore{display:none!important}.preview-headbar{display:none}.tabs{display:none}.viewer-shell{padding:3px}.stage-wrap{justify-content:flex-start}.viewer-float{right:max(9px,env(safe-area-inset-right));top:max(9px,env(safe-area-inset-top));width:32px;height:32px;padding:0;font-size:0}.viewer-float::after{content:"×";font-size:21px}.tool-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.modal{padding:10px}.modal-card{max-height:94dvh}.modal-head{padding:10px 12px}.modal-body{padding:12px}
  body.full-active .topbar,body.full-active .mobilebar{display:none!important}.viewer-full{inset:0!important}.viewer-full .viewer-shell{padding:0}.viewer-full .stage-wrap{min-height:100dvh}
}
@media (max-width:520px){.topbar{gap:4px}.build{display:none}.top-upload{padding-inline:9px}.empty-intro h1{font-size:26px}.open-card-head{display:block}.safe-badge{margin-top:8px}.paste-row{grid-template-columns:1fr}.metric-grid{grid-template-columns:1fr 1fr}.shot-grid{grid-template-columns:1fr}}
</style>
<script>
/* debooger2000 ZIP fallback — used only when the CDN copy of JSZip is unavailable. */
(function(){
  if(window.JSZip)return;
  const u16=(v,o)=>v.getUint16(o,true),u32=(v,o)=>v.getUint32(o,true);
  const decode=(bytes)=>new TextDecoder('utf-8').decode(bytes);
  async function inflateRaw(bytes){
    if(typeof DecompressionStream!=='function')throw new Error('This browser cannot unpack compressed ZIP files without the ZIP helper. Try Safari/Chrome or turn off content blocking for this page.');
    const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function loadAsync(input){
    const buffer=input instanceof ArrayBuffer?input:await input.arrayBuffer();
    const bytes=new Uint8Array(buffer),view=new DataView(buffer);
    let eocd=-1;
    for(let i=Math.max(0,bytes.length-65557);i<=bytes.length-22;i++){
      const p=bytes.length-22-(i-Math.max(0,bytes.length-65557));
      if(p>=0&&u32(view,p)===0x06054b50){eocd=p;break}
    }
    if(eocd<0)throw new Error('This does not look like a valid ZIP file.');
    const count=u16(view,eocd+10),centralOffset=u32(view,eocd+16),files={};
    let pos=centralOffset;
    for(let n=0;n<count;n++){
      if(pos+46>bytes.length||u32(view,pos)!==0x02014b50)throw new Error('The ZIP file directory is damaged or unsupported.');
      const flags=u16(view,pos+8),method=u16(view,pos+10),compressedSize=u32(view,pos+20),nameLen=u16(view,pos+28),extraLen=u16(view,pos+30),commentLen=u16(view,pos+32),localOffset=u32(view,pos+42);
      const name=decode(bytes.slice(pos+46,pos+46+nameLen));
      const dir=name.endsWith('/');
      files[name]={name,dir,async:async(type)=>{
        if(dir)return type==='blob'?new Blob([]):new Uint8Array();
        if(flags&1)throw new Error('Password-protected ZIP files are not supported.');
        if(localOffset+30>bytes.length||u32(view,localOffset)!==0x04034b50)throw new Error('A file inside this ZIP has a damaged header.');
        const localNameLen=u16(view,localOffset+26),localExtraLen=u16(view,localOffset+28),start=localOffset+30+localNameLen+localExtraLen,end=start+compressedSize;
        if(end>bytes.length)throw new Error('A file inside this ZIP is incomplete.');
        const packed=bytes.slice(start,end);
        let unpacked;
        if(method===0)unpacked=packed;
        else if(method===8)unpacked=await inflateRaw(packed);
        else throw new Error('This ZIP uses a compression method this browser cannot unpack.');
        if(type==='blob')return new Blob([unpacked]);
        if(type==='uint8array')return unpacked;
        if(type==='arraybuffer')return unpacked.buffer.slice(unpacked.byteOffset,unpacked.byteOffset+unpacked.byteLength);
        if(type==='text'||type==='string')return decode(unpacked);
        return new Blob([unpacked]);
      }};
      pos+=46+nameLen+extraLen+commentLen;
    }
    return{files};
  }
  window.JSZip={loadAsync};
})();
</script>
<script src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@babel/standalone@7.29.0/babel.min.js"></script>
</head>
<body class="empty-mode">
<div class="app">
<header class="topbar">
  <div class="brand"><span class="brand-mark" aria-hidden="true"></span><span>debooger2000</span><span class="build">023</span></div>
  <span class="status" id="statusBadge">Ready</span>
  <div class="spacer"></div>
  <label class="btn primary top-upload native-upload desktop-only" for="fileInput"><span aria-hidden="true">＋</span> Upload</label>
  <button class="btn ghost desktop-only" id="pasteBtn">Paste</button>
  <button class="btn ghost project-tool" id="editBtn" title="Edit"><span class="tool-glyph">✎</span><span class="tool-label">Edit</span></button>
  <button class="btn ghost project-tool" id="designBtn" title="Design"><span class="tool-glyph">◇</span><span class="tool-label">Design</span></button>
  <button class="btn ghost project-tool" id="trashBtn" title="Trash"><span class="tool-glyph">⌫</span><span class="tool-label">Trash</span></button>
  <button class="btn ghost project-tool" id="bugsBtn" title="Bugs"><span class="tool-glyph">⌁</span><span class="tool-label">Bugs</span></button>
  <button class="btn ghost full-icon project-tool" id="fullBtn" aria-label="Full screen" title="Full screen">⛶</button>
  <button class="btn icon-btn mobile-only" id="moreBtn" aria-label="All tools">•••</button>
</header>
<section class="empty" id="emptyState" aria-labelledby="emptyTitle">
  <div class="empty-shell">
    <div class="empty-intro">
      <div class="eyebrow">Project viewer + debugger</div>
      <h1 id="emptyTitle">Open a project. See it, test it, understand it.</h1>
      <p>Open a ZIP, HTML file, or web project. Debooger2000 shows the real page, checks what it can safely prove, and explains problems in plain English.</p>
      <div class="feature-row" aria-label="What debooger2000 does">
        <div class="feature"><span class="feature-icon green">✓</span><div><strong>Preview it</strong><span>See the actual page at desktop, tablet, or phone size.</span></div></div>
        <div class="feature"><span class="feature-icon amber">!</span><div><strong>Test it</strong><span>Check code, layout, runtime errors, and safe controls.</span></div></div>
        <div class="feature"><span class="feature-icon green">?</span><div><strong>Understand it</strong><span>Get simple explanations instead of developer jargon.</span></div></div>
      </div>
    </div>
    <div class="open-card">
      <div class="open-card-head"><div><span class="eyebrow">Start here</span><h2>Open your project</h2></div><span class="safe-badge"><span></span>Original stays unchanged</span></div>
      <label id="dropzone" class="dropzone native-dropzone" for="fileInput">
        <span class="drop-icon" aria-hidden="true">＋</span>
        <strong>Tap to choose your project</strong>
        <span>Choose a ZIP, HTML file, or project files from your phone or computer. On desktop, you can also drag files here.</span>
      </label>
      <div class="empty-actions single-action"><button type="button" class="btn ghost" id="emptyPasteBtn">Paste code or link</button></div>
      <div class="hint">HTML · CSS · JavaScript · React · Vite · TypeScript · ZIP</div>
    </div>
  </div>
</section>
<div class="workspace hidden" id="workspace">
  <aside class="panel panel-left" id="leftPanel" aria-label="Project information">
    <div class="panel-heading"><div><span class="eyebrow">Project</span><div class="panel-title">Files & details</div></div><button class="btn icon-btn panel-toggle" id="leftCollapseBtn" aria-label="Collapse project panel">‹</button></div>
    <div class="quick-open"><label class="btn primary full native-upload" for="fileInput">＋ Upload another project</label></div>
    <div class="block project-summary-block"><div class="block-h"><span>What you opened</span></div><div class="block-b" id="projectSummary"><div class="muted">Open a project and I’ll explain what it is, where it starts, and what can be tested here.</div></div></div>
    <details class="block disclose-block files-card"><summary class="block-h"><span>Files</span><span class="count" id="fileCountLabel">0</span></summary><div class="block-b tight"><div id="fileList" class="file-list"><div class="muted">No project is open yet.</div></div></div></details>
    <details class="block disclose-block history-card"><summary class="block-h"><span>Earlier audits</span></summary><div class="block-b" id="history"><div class="muted">No earlier saved audit on this device yet.</div></div></details>
  </aside>
  <main class="main stage" id="previewStage">
    <div class="preview-headbar">
      <div class="preview-heading"><span class="eyebrow">Live preview</span><div class="preview-title">Your real page</div></div>
      <div class="toolbar desktop-only">
        <div class="segmented device-group" aria-label="Preview device">
          <button class="seg device-btn active" data-device="desktop">Desktop</button>
          <button class="seg device-btn" data-device="tablet">iPad</button>
          <button class="seg device-btn" data-device="mobile">Mobile</button>
        </div>
        <select id="desktopWidth" class="select" aria-label="Desktop width">
          <option value="1200">1200</option>
          <option value="1280">1280</option>
          <option value="1366">1366</option>
          <option value="1440" selected>1440</option>
          <option value="1600">1600</option>
          <option value="1920">1920</option>
        </select>
        <button class="btn ghost compact" id="fitWidthBtn" data-fit="width">Fit</button>
        <button class="btn ghost compact" id="fitPageBtn" data-fit="page">Page</button>
        <button class="btn ghost compact" id="actualBtn" data-fit="actual">100%</button>
      </div>
    </div>
    <div id="pageTabs" class="tabs"></div>
    <div id="notice" class="notice hidden"></div>
    <div id="viewerShell" class="viewer-shell"><div id="stageWrap" class="stage-wrap"><div id="desktopStage" class="device-stage desktop-stage"><iframe id="frame" class="device-frame desktop-frame" title="Project preview" sandbox="allow-scripts allow-forms allow-modals allow-popups allow-downloads"></iframe></div></div></div>
    <iframe id="auditFrame" class="audit-frame" title="Background audit" sandbox="allow-scripts allow-forms allow-modals allow-popups allow-downloads" aria-hidden="true"></iframe>
    <button class="viewer-float hidden" id="exitFullBtn" aria-label="Exit full screen">Exit</button>
  </main>
  <aside class="panel panel-right" id="auditRail" aria-label="Audit results">
    <div class="panel-heading"><div><span class="eyebrow">Audit</span><div class="panel-title">Results</div></div><button class="btn icon-btn panel-toggle" id="rightCollapseBtn" aria-label="Collapse audit panel">›</button></div>
    <div class="block audit-score-block"><div class="block-h"><span>Overall result</span></div><div class="block-b"><div id="scoreBox"><div class="score">—</div><div class="muted">The score stays blank until the available checks finish.</div></div><div id="visualEvidenceStatus" class="visual-status neutral">Pictures are checked during the audit.</div><div id="metrics" class="metric-grid"></div></div></div>
    <div id="compareBox" class="hidden"></div>
    <div class="block attention-block"><div class="block-h"><span>Needs attention</span></div><div class="block-b" id="findings"><div class="muted">Confirmed problems appear first. Anything uncertain is marked for a manual check and does not lower the score.</div></div></div>
    <details class="block disclose-block"><summary class="block-h"><span>Controls</span><span class="count" id="controlCount">0</span></summary><div class="block-b" id="controlList"><div class="muted">Only harmless controls are pressed. Send, delete, call, pay, save, submit, and download actions are skipped.</div></div></details>
    <details class="block disclose-block screenshot-block"><summary class="block-h"><span>Pictures</span><span class="count" id="shotCount">0</span></summary><div class="block-b"><div id="shotStatus" class="muted shot-status">Useful pictures appear here after the page settles.</div><div id="shotGrid" class="shot-grid"></div></div></details>
    <div class="actions">
      <button class="btn primary" id="auditBtn" data-audit-action="audit">Audit</button>
      <button class="btn ghost" id="copyBtn" data-audit-action="copy">Copy</button>
      <button class="btn ghost full-span" id="downloadBtn" data-audit-action="download">Save</button>
    </div>
  </aside>
  <button class="restore restore-left hidden" id="leftRestoreBtn" aria-label="Show project panel">›</button>
  <button class="restore restore-right hidden" id="rightRestoreBtn" aria-label="Show audit panel">‹</button>
</div>
<nav class="mobilebar hidden" id="mobileBar" aria-label="Mobile workspace navigation">
  <button class="mbtn" id="mobileProjectBtn" data-sheet="left">Project</button>
  <button class="mbtn active" id="mobilePreviewBtn" data-sheet="preview">Preview</button>
  <button class="mbtn" id="mobileAuditBtn" data-sheet="right">Audit</button>
</nav>
</div>
<input id="fileInput" class="file-input" type="file" multiple aria-label="Choose project files or ZIP">
<div class="modal hidden" id="moreModal" role="dialog" aria-modal="true" aria-labelledby="moreTitle">
  <div class="modal-card narrow">
    <div class="modal-head"><strong id="moreTitle">Tools</strong><button class="btn ghost compact" id="closeMoreBtn">Close</button></div>
    <div class="modal-body more-actions">
      <div class="tool-section">
        <div class="tool-section-title">Project</div>
        <div class="tool-grid">
          <label class="btn primary native-upload" for="fileInput">Upload</label>
          <button class="btn" id="pasteInlineBtn">Paste</button>
          <button class="btn" id="trashInlineBtn">Trash</button>
          <button class="btn" id="mobileEditBtn">Edit</button>
          <button class="btn" id="mobileDesignBtn">Design</button>
          <button class="btn" id="mobileBugsBtn">Bugs</button>
        </div>
      </div>
      <div class="tool-section">
        <div class="tool-section-title">Preview</div>
        <div class="segmented full-width">
          <button class="seg device-btn active" data-device="desktop">Desktop</button>
          <button class="seg device-btn" data-device="tablet">iPad</button>
          <button class="seg device-btn" data-device="mobile">Phone</button>
        </div>
        <div class="tool-row" style="margin-top:8px">
          <select id="mobileDesktopWidth" class="select" aria-label="Desktop width">
            <option value="1200">1200</option>
            <option value="1280">1280</option>
            <option value="1366">1366</option>
            <option value="1440">1440</option>
            <option value="1600">1600</option>
            <option value="1920">1920</option>
          </select>
          <button class="btn compact" id="mobileFitWidthBtn" data-fit="width">Fit</button>
          <button class="btn compact" id="mobileFitPageBtn" data-fit="page">Page</button>
          <button class="btn compact" id="mobileActualBtn" data-fit="actual">100%</button>
        </div>
        <div class="tool-row" style="margin-top:8px">
          <button class="btn compact" id="zoomOutBtn">−</button>
          <span class="zoom-readout" id="zoomValue">100%</span>
          <button class="btn compact" id="zoomInBtn">＋</button>
          <select id="mobilePageSelect" class="select hidden" aria-label="Page"></select>
        </div>
      </div>
      <div class="tool-section">
        <div class="tool-section-title">Audit & report</div>
        <div class="tool-grid">
          <button class="btn" id="mobileRunAuditBtn">Audit</button>
          <button class="btn" id="mobileCopyBtn">Copy</button>
          <button class="btn" id="mobileSaveBtn">Save</button>
        </div>
      </div>
    </div>
  </div>
</div>
<div class="modal hidden" id="pasteModal" role="dialog" aria-modal="true" aria-labelledby="pasteTitle">
  <div class="modal-card">
    <div class="modal-head"><strong id="pasteTitle">Paste something to open</strong><button class="btn ghost" id="closePasteBtn">Close</button></div>
    <div class="modal-body">
      <div class="segmented full-width paste-tabs"><button class="seg paste-tab active" data-paste="text">Code / text</button><button class="seg paste-tab" data-paste="link">Link</button></div>
      <div id="pasteTextPanel">
        <textarea id="pasteText" class="field paste-area" aria-label="Pasted code or text" placeholder="Paste HTML, CSS, JavaScript, JSON, or text here..."></textarea>
        <div class="paste-row">
          <select id="pasteType" class="field" aria-label="Pasted content type">
            <option value="html">HTML</option>
            <option value="css">CSS</option>
            <option value="js">JavaScript</option>
            <option value="json">JSON</option>
            <option value="txt">Text</option>
          </select>
          <button class="btn primary" id="openPasteTextBtn">Open this code</button>
        </div>
      </div>
      <div id="pasteLinkPanel" class="hidden">
        <input id="pasteLink" class="field" type="url" aria-label="Direct file or ZIP link" inputmode="url" placeholder="Paste a direct file or ZIP link">
        <div class="muted">Some links only work inside the app that created them. If this browser cannot reach the file, that will be shown clearly.</div>
        <button class="btn primary full paste-link-button" id="openPasteLinkBtn">Open this link</button>
      </div>
    </div>
  </div>
</div>
<div class="modal hidden" id="editorModal" role="dialog" aria-modal="true" aria-labelledby="editorTitle">
  <div class="modal-card editor-card">
    <div class="modal-head"><strong id="editorTitle">Edit</strong><button class="btn ghost compact" id="closeEditorBtn">Close</button></div>
    <div class="modal-body">
      <select id="editorFileSelect" class="field" aria-label="File to edit"></select>
      <textarea id="editorText" class="field editor-area" spellcheck="false" aria-label="File source"></textarea>
      <div class="modal-actions"><button class="btn primary" id="applyEditBtn">Apply</button></div>
    </div>
  </div>
</div>
<div class="modal hidden" id="bugsModal" role="dialog" aria-modal="true" aria-labelledby="bugsTitle">
  <div class="modal-card bugs-card">
    <div class="modal-head"><strong id="bugsTitle">Bugs</strong><button class="btn ghost compact" id="closeBugsBtn">Close</button></div>
    <div class="modal-body">
      <div id="bugSummary" class="muted bug-summary"></div>
      <textarea id="bugPrompt" class="field bug-area" spellcheck="false" aria-label="AI repair prompt"></textarea>
      <div class="modal-actions"><button class="btn primary" id="copyBugPromptBtn">Copy prompt</button></div>
    </div>
  </div>
</div>
<div class="modal hidden" id="shotModal" role="dialog" aria-modal="true" aria-labelledby="shotTitle">
  <div class="modal-card wide shot-card">
    <div class="modal-head"><div><strong id="shotTitle">Page picture</strong><div class="shot-modal-meta" id="shotMeta"></div></div><button class="btn ghost" id="closeShotBtn">Close</button></div>
    <div class="shot-view"><img id="shotImage" alt="Captured project preview"></div>
    <div class="shot-nav"><button class="btn ghost" id="prevShotBtn">Previous</button><button class="btn ghost" id="nextShotBtn">Next</button></div>
  </div>
</div>
<script>
${bundledJs}
</script>
</body>
</html>`;

fs.writeFileSync(path.join(__dirname, '../index.html'), htmlContent, 'utf-8');
fs.writeFileSync(path.join(__dirname, '../debooger2000-023.html'), htmlContent, 'utf-8');
console.log('Successfully generated index.html and debooger2000-023.html!');
