// Built from src/skills/cutscene-edit/scripts/lib/review-page.mts by `npm run build`. Edit that file, not this one.
/**
 * Peaks for the waveform: `bins` values in 0..1 from mono samples.
 */
export function peaks(samples, bins = 1600) {
    const out = new Array(bins).fill(0);
    if (!samples.length)
        return out;
    const per = samples.length / bins;
    for (let b = 0; b < bins; b++) {
        let m = 0;
        const s = Math.floor(b * per);
        const e = Math.min(samples.length, Math.floor((b + 1) * per));
        for (let i = s; i < e; i++) {
            const v = Math.abs(samples[i]);
            if (v > m)
                m = v;
        }
        out[b] = m;
    }
    const max = Math.max(1e-6, ...out);
    return out.map((v) => Math.round(Math.pow(v / max, 0.7) * 1000) / 1000);
}
/**
 * Where each cut lands in the edited video (the join), from the EDL.
 */
export function joinsFor(edl) {
    return edl.delete_ranges.map((d) => {
        const next = edl.keep_ranges.find((k) => k.start >= d.end - 1e-6);
        return { ...d, out: next ? next.out_start : edl.edited_duration };
    });
}
/** Mark words whose middle falls inside a cut. */
export function markCutWords(words, edl) {
    return words.map((w) => {
        const mid = (w.start + w.end) / 2;
        const cut = edl.delete_ranges.some((d) => mid >= d.start && mid < d.end);
        return { t: w.text, s: Math.round(w.start * 1000) / 1000, e: Math.round(w.end * 1000) / 1000, c: cut ? 1 : 0 };
    });
}
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export function buildReviewHtml(d) {
    const joins = joinsFor(d.edl);
    const data = {
        duration: d.edl.source_duration,
        edited: d.edl.edited_duration,
        fps: d.edl.fps,
        deletes: joins.map((j) => ({ s: j.start, e: j.end, out: j.out, r: (j.reasons ?? []).join("; ") })),
        keeps: d.edl.keep_ranges.map((k) => ({ s: k.start, e: k.end })),
        words: d.words,
        peaks: d.peaks,
        candidates: (d.candidates ?? []).map((c) => ({ id: c.id, type: c.type, rec: c.recommend, conf: c.confidence, s: (c.source_cut ?? c.cut).start, e: (c.source_cut ?? c.cut).end, removes: c.removes, keeps: c.keeps, note: c.note })),
        hasEdited: !!d.editedSrc,
    };
    const json = JSON.stringify(data).replace(/</g, "\\u003c");
    const pct = d.edl.source_duration ? ((d.edl.removed / d.edl.source_duration) * 100).toFixed(1) : "0";
    const fmt = (s) => {
        const m = Math.floor(s / 60);
        return `${m}:${(s - m * 60).toFixed(1).padStart(4, "0")}`;
    };
    const toolName = { "cut-silences": "Silences", "apply-cuts": "Mistakes", "rough-cut": "Rough cut" }[d.edl.tool] ?? d.edl.tool;
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cut review · ${esc(d.title)}</title>
<style>
:root{--bg:#0e0f13;--panel:#16181e;--panel2:#1c1f27;--line:#2a2e39;--text:#ecebe6;--dim:#9b9da7;--faint:#5f626d;
--keep:#93a6ff;--keep-soft:rgba(147,166,255,.18);--cut:#ffb454;--cut-soft:rgba(255,180,84,.16);--accent:#ffb454;--play:#ecebe6;
--r:14px;--mono:ui-monospace,"Cascadia Mono","SF Mono",Menlo,Consolas,monospace;--sans:"Inter","Segoe UI Variable","Segoe UI",system-ui,-apple-system,Roboto,sans-serif}
@media (prefers-color-scheme:light){:root{--bg:#f5f4ef;--panel:#ffffff;--panel2:#efede6;--line:#dfddd4;--text:#16171b;--dim:#62646d;--faint:#a3a5ad;
--keep:#3b57d6;--keep-soft:rgba(59,87,214,.12);--cut:#b86400;--cut-soft:rgba(184,100,0,.13);--accent:#b86400;--play:#16171b}}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--text);font:14px/1.55 var(--sans);-webkit-font-smoothing:antialiased}
.wrap{max-width:1180px;margin:0 auto;padding:28px 28px 64px}
header{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:26px}
.brand{display:flex;align-items:center;gap:12px}.brand svg{flex:none}
.word{font-weight:700;letter-spacing:-.01em;font-size:17px}.word span{color:var(--dim);font-weight:500}
.file{color:var(--dim);font-size:13px;font-family:var(--mono);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:52%}
h2{font-size:12px;letter-spacing:.09em;text-transform:uppercase;color:var(--dim);font-weight:600;margin:34px 0 12px}
.stats{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}
.stat{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:14px 16px}
.stat b{display:block;font-size:24px;font-weight:650;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.stat small{color:var(--dim);font-size:12px}.stat.cut b{color:var(--cut)}.stat.keep b{color:var(--keep)}
.card{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:16px}
.tl{position:relative;height:120px;border-radius:10px;overflow:hidden;background:var(--panel2);cursor:pointer}
.tl canvas{position:absolute;inset:0;width:100%;height:100%}
.ph{position:absolute;top:0;bottom:0;width:2px;background:var(--play);left:0;pointer-events:none;box-shadow:0 0 0 1px rgba(0,0,0,.25)}
.hover{position:absolute;top:6px;padding:3px 8px;border-radius:6px;background:var(--text);color:var(--bg);font:12px var(--mono);pointer-events:none;transform:translateX(-50%);white-space:nowrap;display:none}
.axis{display:flex;justify-content:space-between;color:var(--faint);font:11px var(--mono);margin-top:6px}
.bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:14px}
button{font:inherit;font-size:13px;color:var(--text);background:var(--panel2);border:1px solid var(--line);border-radius:9px;padding:7px 12px;cursor:pointer;transition:border-color .15s,background .15s}
button:hover{border-color:var(--keep)}button:focus-visible{outline:2px solid var(--keep);outline-offset:2px}
button.primary{background:var(--text);color:var(--bg);border-color:var(--text)}button.primary:hover{opacity:.9}
button.on{border-color:var(--accent);color:var(--accent)}
.legend{margin-left:auto;display:flex;gap:16px;color:var(--dim);font-size:12px}.sw{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:-1px}
.players{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.player h3{margin:0 0 10px;font-size:13px;font-weight:600;display:flex;justify-content:space-between;color:var(--dim)}
.player h3 em{font-style:normal;font-family:var(--mono);color:var(--text)}
video{width:100%;border-radius:10px;background:#000;display:block;aspect-ratio:16/9}
.empty{aspect-ratio:16/9;border-radius:10px;border:1px dashed var(--line);display:grid;place-items:center;text-align:center;color:var(--dim);padding:20px;font-size:13px}
.words{max-height:300px;overflow:auto;line-height:2.05;font-size:15px;padding-right:6px}
.words span{padding:2px 2px;border-radius:5px;cursor:pointer}
.words span:hover{background:var(--keep-soft)}
.words span.c{color:var(--cut);text-decoration:line-through;text-decoration-thickness:1.5px;background:var(--cut-soft)}
.words span.now{background:var(--keep);color:var(--bg);text-decoration:none}
.words .gap{color:var(--faint);font:11px var(--mono);margin:0 3px}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:9px 10px;border-bottom:1px solid var(--line);font-size:13px;vertical-align:top}
th{color:var(--dim);font-weight:600;font-size:12px}td.t{font-family:var(--mono);white-space:nowrap}td.r{color:var(--dim)}tr:last-child td{border-bottom:0}
tr.sel td{background:var(--cut-soft)}
.chip{display:inline-block;font-size:11px;padding:1px 8px;border-radius:99px;border:1px solid var(--line);color:var(--dim);margin-right:6px}
.chip.cut{border-color:var(--cut);color:var(--cut)}.chip.keep{border-color:var(--keep);color:var(--keep)}
.cand{display:grid;grid-template-columns:28px 1fr auto;gap:10px;padding:12px 4px;border-bottom:1px solid var(--line)}.cand:last-child{border-bottom:0}
.cand input{width:18px;height:18px;accent-color:var(--accent);margin-top:2px}
.cand .rm{color:var(--cut)}.cand .kp{color:var(--dim)}.cand p{margin:3px 0}
textarea{width:100%;min-height:70px;margin-top:10px;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:9px;font:12px var(--mono);padding:10px;display:none}
footer{margin-top:40px;color:var(--faint);font-size:12px;display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}
kbd{font:11px var(--mono);border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;padding:0 5px;color:var(--dim)}
@media (max-width:820px){.stats{grid-template-columns:repeat(2,1fr)}.players{grid-template-columns:1fr}.legend{margin-left:0}}
</style></head><body><div class="wrap">
<header><div class="brand"><svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true"><rect x="2" y="9" width="26" height="18" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 9l4.5-6 22 2.6-1.2 3.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M11 3.7l-2.2 5.1M18 4.6l-2.3 4.4" stroke="currentColor" stroke-width="2"/><path d="M8 17h7" stroke="var(--keep)" stroke-width="3" stroke-linecap="round"/><path d="M18 17h4" stroke="var(--cut)" stroke-width="3" stroke-linecap="round"/></svg>
<div class="word">Cutscene <span>· cut review · ${esc(toolName)}</span></div></div><div class="file" title="${esc(d.edlName)}">${esc(d.edlName)}</div></header>
<div class="stats">
<div class="stat"><b>${fmt(d.edl.source_duration)}</b><small>original</small></div>
<div class="stat keep"><b>${fmt(d.edl.edited_duration)}</b><small>edited</small></div>
<div class="stat cut"><b>−${d.edl.removed.toFixed(1)} s</b><small>removed</small></div>
<div class="stat"><b>${pct}%</b><small>tighter</small></div>
<div class="stat"><b>${d.edl.delete_ranges.length}</b><small>cuts</small></div>
</div>
<h2>Timeline (original)</h2>
<div class="card"><div class="tl" id="tl"><canvas id="wave"></canvas><div class="ph" id="ph"></div><div class="hover" id="hv"></div></div>
<div class="axis"><span>0:00</span><span>${fmt(d.edl.source_duration / 2)}</span><span>${fmt(d.edl.source_duration)}</span></div>
<div class="bar"><button class="primary" id="playO">Play original</button><button id="prev" title="Previous cut (P)">◀ Cut</button><button id="next" title="Next cut (N)">Cut ▶</button><button id="preview" title="Plays the original and skips every cut">Preview the edit</button>
<div class="legend"><span><i class="sw" style="background:var(--keep)"></i>kept</span><span><i class="sw" style="background:var(--cut)"></i>cut</span></div></div></div>
<h2>Players</h2>
<div class="players"><div class="card player"><h3>Original <em id="tO">0:00.0</em></h3>${d.originalSrc ? `<video id="orig" src="${esc(d.originalSrc)}" controls preload="auto"></video>` : `<div class="empty">No original video was given.<br>Pass --original to hear the cuts.</div>`}</div>
<div class="card player"><h3>Edited <em id="tE">0:00.0</em></h3>${d.editedSrc ? `<video id="edit" src="${esc(d.editedSrc)}" controls preload="auto"></video>` : `<div class="empty">Not rendered yet: this is a dry run.<br>“Preview the edit” plays the original and skips the cuts, so you can judge it before rendering.</div>`}</div></div>
${d.words.length ? `<h2>Transcript · cut words struck through</h2><div class="card"><div class="words" id="words"></div></div>` : ""}
${data.candidates.length ? `<h2>Candidates · tick what to cut</h2><div class="card" id="cands"></div><div class="bar"><button class="primary" id="copy">Copy approved list</button><span style="color:var(--dim);font-size:12px">Paste it into the approved-cuts file, then run apply-cuts.</span></div><textarea id="out" readonly></textarea>` : ""}
<h2>Cuts · ${d.edl.delete_ranges.length}</h2>
<div class="card" style="padding:4px 8px"><table><thead><tr><th>#</th><th>at (original)</th><th>join (edited)</th><th>length</th><th>why</th><th></th></tr></thead><tbody id="rows"></tbody></table></div>
<footer><span>Keys: <kbd>Space</kbd> play · <kbd>N</kbd>/<kbd>P</kbd> next/previous cut · <kbd>E</kbd> preview the edit · click the waveform or a word to jump</span><span>Made with Cutscene</span></footer>
</div>
<script type="application/json" id="data">${json}</script>
<script>
(()=>{const D=JSON.parse(document.getElementById('data').textContent);
const $=id=>document.getElementById(id),O=$('orig'),E=$('edit'),tl=$('tl'),cv=$('wave'),ph=$('ph'),hv=$('hv');
const f=s=>{s=Math.max(0,s);const m=Math.floor(s/60);return m+':'+(s-m*60).toFixed(1).padStart(4,'0')};
const css=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
let mode=null,stopAt=null,stopP=null,cur=-1;
const inCut=t=>D.deletes.find(d=>t>=d.s&&t<d.e);
function draw(){const w=tl.clientWidth,h=tl.clientHeight,r=devicePixelRatio||1;cv.width=w*r;cv.height=h*r;const g=cv.getContext('2d');g.scale(r,r);g.clearRect(0,0,w,h);
const K=css('--keep'),C=css('--cut'),n=D.peaks.length,bw=w/n;
for(const d of D.deletes){g.fillStyle=css('--cut-soft');g.fillRect(d.s/D.duration*w,0,Math.max(1,(d.e-d.s)/D.duration*w),h)}
for(let i=0;i<n;i++){const t=(i+.5)/n*D.duration,a=Math.max(1,D.peaks[i]*(h*.42));g.fillStyle=inCut(t)?C:K;g.globalAlpha=inCut(t)?.85:.9;g.fillRect(i*bw,h/2-a,Math.max(.6,bw-.35),a*2)}g.globalAlpha=1}
draw();addEventListener('resize',draw);
const words=$('words');let spans=[];
if(words){let last=null;for(const w of D.words){if(last!==null&&w.s-last>=.5){const g=document.createElement('span');g.className='gap';g.textContent=(w.s-last).toFixed(1)+'s';words.append(g,' ')}
const s=document.createElement('span');s.textContent=w.t;if(w.c)s.className='c';s.title=f(w.s);s.onclick=()=>seek(w.s,true);words.append(s,' ');spans.push([w,s]);last=w.e}}
const rows=$('rows');D.deletes.forEach((d,i)=>{const tr=document.createElement('tr');tr.innerHTML='<td>'+(i+1)+'</td><td class="t">'+f(d.s)+' – '+f(d.e)+'</td><td class="t">'+f(d.out)+'</td><td class="t"><b>'+(d.e-d.s).toFixed(2)+' s</b></td><td class="r"></td><td style="white-space:nowrap"></td>';
tr.children[4].textContent=d.r||'cut';const a=document.createElement('button');a.textContent='Hear cut';a.onclick=()=>hearCut(i);const b=document.createElement('button');b.textContent='Hear join';b.style.marginLeft='6px';b.onclick=()=>hearJoin(i);tr.children[5].append(a,b);tr.id='row'+i;rows.append(tr)});
function sel(i){document.querySelectorAll('tr.sel').forEach(x=>x.classList.remove('sel'));const r=$('row'+i);if(r){r.classList.add('sel');r.scrollIntoView({block:'nearest'})}cur=i}
function seek(t,play){if(!O)return;mode=null;stopAt=null;setPrev(false);O.currentTime=Math.max(0,t);if(play)O.play()}
function hearCut(i){if(!O)return;const d=D.deletes[i];sel(i);setPrev(false);mode=null;O.currentTime=Math.max(0,d.s-1.2);stopAt=d.e+.4;stopP=O;O.play()}
function hearJoin(i){const d=D.deletes[i];sel(i);if(E){E.currentTime=Math.max(0,d.out-1.5);stopAt=d.out+1.5;stopP=E;E.play();return}
if(!O)return;mode='skip';setPrev(false);O.currentTime=Math.max(0,d.s-1.5);stopAt=d.e+1.5;stopP=O;O.play()}
const pv=$('preview');function setPrev(on){pv.classList.toggle('on',on);pv.textContent=on?'Previewing the edit…':'Preview the edit'}
pv.onclick=()=>{if(!O)return;if(mode==='skip'&&!stopAt){mode=null;setPrev(false);O.pause();return}mode='skip';stopAt=null;setPrev(true);if(inCut(O.currentTime))O.currentTime=inCut(O.currentTime).e;O.play()};
$('playO').onclick=()=>{if(!O)return;mode=null;stopAt=null;setPrev(false);O.paused?O.play():O.pause()};
const go=k=>{if(!D.deletes.length)return;const i=Math.min(D.deletes.length-1,Math.max(0,cur+k));hearCut(i)};$('next').onclick=()=>go(1);$('prev').onclick=()=>go(-1);
tl.addEventListener('click',e=>{const r=tl.getBoundingClientRect(),t=(e.clientX-r.left)/r.width*D.duration;const i=D.deletes.findIndex(d=>t>=d.s-.05&&t<=d.e+.05);if(i>=0)hearCut(i);else seek(t,true)});
tl.addEventListener('mousemove',e=>{const r=tl.getBoundingClientRect(),x=e.clientX-r.left,t=x/r.width*D.duration,d=inCut(t);hv.style.display='block';hv.style.left=Math.min(r.width-60,Math.max(60,x))+'px';hv.textContent=d?('cut '+(d.e-d.s).toFixed(2)+' s · '+(d.r||'')).slice(0,64):f(t)});
tl.addEventListener('mouseleave',()=>hv.style.display='none');
addEventListener('keydown',e=>{if(e.target.tagName==='TEXTAREA'||e.target.tagName==='INPUT')return;if(e.key===' '){e.preventDefault();$('playO').click()}else if(e.key==='n'||e.key==='N')go(1);else if(e.key==='p'||e.key==='P')go(-1);else if(e.key==='e'||e.key==='E')pv.click()});
let wi=0;function tick(){if(O){const t=O.currentTime;if(mode==='skip'&&!O.paused){const d=inCut(t);if(d)O.currentTime=d.e}
ph.style.left=(t/D.duration*100)+'%';$('tO').textContent=f(t);
if(spans.length){while(wi>0&&spans[wi][0].s>t)wi--;while(wi<spans.length-1&&spans[wi+1][0].s<=t)wi++;spans.forEach(([w,s],k)=>s.classList.toggle('now',k===wi&&!O.paused&&t<w.e+.25))}}
if(E)$('tE').textContent=f(E.currentTime);if(stopAt!==null&&stopP&&stopP.currentTime>=stopAt){stopP.pause();stopAt=null;if(mode==='skip'){mode=null;setPrev(false)}}requestAnimationFrame(tick)}tick();
const box=$('cands');if(box){D.candidates.forEach(c=>{const el=document.createElement('label');el.className='cand';el.innerHTML='<input type="checkbox"><div><p><span class="chip '+(c.rec==='cut'?'cut':c.rec==='keep'?'keep':'')+'"></span><span class="chip"></span><b class="id"></b> <span style="color:var(--dim);font-family:var(--mono);font-size:12px"></span></p><p class="rm"></p><p class="kp"></p><p style="color:var(--faint);font-size:12px"></p></div><div></div>';
const q=el.querySelectorAll('p span,p b,p');el.querySelector('input').checked=c.rec==='cut';q[1].textContent=c.rec;q[2].textContent=c.type+' · '+c.conf;q[3].textContent=c.id;q[4].textContent=f(c.s)+' – '+f(c.e);
el.querySelector('.rm').textContent='removes: '+c.removes;el.querySelector('.kp').textContent=c.keeps?'keeps: '+c.keeps:'';el.querySelectorAll('p')[3].textContent=c.note;
const b=document.createElement('button');b.textContent='Hear';b.onclick=ev=>{ev.preventDefault();if(!O)return;mode=null;O.currentTime=Math.max(0,c.s-1.2);stopAt=c.e+.4;stopP=O;O.play()};el.lastChild.append(b);el.dataset.id=c.id;box.append(el)});
$('copy').onclick=()=>{const ids=[...box.querySelectorAll('.cand')].filter(x=>x.querySelector('input').checked).map(x=>x.dataset.id);const t=JSON.stringify({approve:ids},null,1);const o=$('out');o.style.display='block';o.value=t;o.select();navigator.clipboard?.writeText(t).catch(()=>{})}}
})();
</script></body></html>`;
}
