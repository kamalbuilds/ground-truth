const $=s=>document.querySelector(s), chat=$('#chat'), sleep=ms=>new Promise(r=>setTimeout(r,ms));
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const STEPS=[
 {k:'HELD',d:'$5 authorized on the agent owner’s PayPal. Not charged.',id:t=>t.authorizationId||t.orderId,st:t=>t.authorizationId?(fake(t)?'DEMO':'AUTHORIZED'):(t.orderId?'AWAITING APPROVAL':'')},
 {k:'PHOTO IN',d:'A nearby human accepted the task and sent a photo.',id:t=>t.photo?t.photo.split('/').pop():'',st:t=>t.photo?'RECEIVED':''},
 {k:'VERIFIED',d:'Vision model checks the photo against the question.',id:t=>t.verdict?(t.verdict.sign_text?'“'+t.verdict.sign_text+'”':(t.verdict.answer||'')):'',st:t=>t.verdict?(t.verdict.pass?'PASS':'FAIL'):''},
 {k:'CAPTURED',d:'Proof accepted. PayPal captures the held $5.',id:t=>t.captureId||'',st:t=>t.captureStatus||''},
 {k:'PAID',d:'Worker paid out through PayPal.',id:t=>t.payoutBatchId||'',st:t=>t.payoutItemStatus||t.payoutStatus||''}];
const fake=t=>!!t&&(!t.orderId||/^DEMO/.test(t.authorizationId||''));
const ORDER=['HELD','PHOTO IN','VERIFIED','CAPTURED','PAID'];
function renderSteps(t,reached){const el=$('#steps');const voided=t&&t.state==='VOIDED'&&reached>=2;
 el.innerHTML=STEPS.map((s,i)=>{let cls='step',idv=t?s.id(t):'',st=t?s.st(t):'',nm=s.k,ds=s.d;
  if(voided&&i===3){cls+=' void';nm='VOIDED';ds='Photo failed. PayPal voided the hold. Nobody is charged, nobody is paid.';idv=t.voidedAuthorizationId||t.voidId||t.authorizationId||'';st=fake(t)?'DEMO · VOIDED':(t.authorizationStatus||'VOIDED')}
  else if(voided&&i===4){cls+=' gone'}
  else if(i<=reached){cls+=' on';if(i===reached)cls+=' now'}
  return `<div class="${cls}"><div class="dot">${voided&&i===3?'✕':'0'+(i+1)}</div><div><div class="nm">${nm}</div><div class="ds">${esc(ds)}</div></div><div class="id">${idv?esc(idv):'<span style="color:var(--dim)">—</span>'}${st?`<br><span class="st">${esc(st)}</span>`:''}</div></div>`}).join('');
 const a=$('#amt'),w=$('#amtWhat');a.className='big';
 if(!t){a.classList.add('held');w.textContent='Waiting for the agent';return}
 if(voided){a.classList.add('void');w.textContent='Hold voided · $0 moved'}
 else if(reached>=4&&t.state==='PAID'){a.classList.add('cap');w.textContent='Paid to the worker'}
 else if(reached>=3){a.classList.add('cap');w.textContent=t.payoutNote?'Captured · payout queued':'Captured'}
 else if(reached>=0&&(t.authorizationId)){a.classList.add('held');w.textContent='Held · not charged'}
 else {a.classList.add('held');w.textContent='Awaiting payer approval'}
 $('#taskId').textContent='task '+t.id+(fake(t)?' · DEMO':t.demo?' · preset photo':'');}
function add(html,cls=''){const d=document.createElement('div');d.className=cls;d.innerHTML=html;chat.appendChild(d);chat.scrollTop=chat.scrollHeight;return d}
const user=t=>add(`<div class="who">You</div><div class="bubble">${esc(t)}</div>`,'msg user');
const agent=t=>add(`<div class="who">Agent</div><div class="bubble">${t}</div>`,'msg agent');
async function think(ms=900){const d=agent('<span class="typing"><i></i><i></i><i></i></span>');await sleep(ms);d.remove()}
function toolCall(q,loc){return add(`<div class="bar"><span>tool call · <span class="fn">hire_human</span></span><span>MCP</span></div><pre><span class="v">hire_human</span>({
  <span class="k">question</span>: <span class="s">"${esc(q)}"</span>,
  <span class="k">location</span>: <span class="s">"${esc(loc)}"</span>,
  <span class="k">budget_usd</span>: <span class="v">5.00</span>,
  <span class="k">release_when</span>: <span class="s">"photo verified by vision model"</span>
})</pre>`,'tool')}
function toolRet(t){return add(`<div class="bar"><span>result · <span class="fn">PayPal</span></span><span>${fake(t)?'<span class="demo-tag">DEMO · NO PAYPAL CALL</span>':'PayPal sandbox · live'}</span></div><pre>{
  <span class="k">task_id</span>: <span class="s">"${esc(t.id)}"</span>,
  <span class="k">paypal_order</span>: <span class="s">"${esc(t.orderId||'—')}"</span>,
  <span class="k">authorization</span>: <span class="s">"${esc(t.authorizationId||'pending approval')}"</span>,
  <span class="k">state</span>: <span class="v">"${esc(t.state)}"</span>  <span class="c">// money held, not charged</span>
}</pre>`,'tool ret')}
function reasons(v){if(Array.isArray(v?.reasons))return v.reasons.filter(Boolean);return String(v?.reason||'').split(/(?<=[.;])\s+/).filter(Boolean)}
function verdictCard(t){const v=t.verdict||{};return add(`<img src="${esc(t.photo||'')}" alt="worker photo"><div class="body"><span class="tag">${v.pass?'✓ VERIFIED':'✕ REJECTED'}</span><div class="ans">${esc(v.answer||'')}</div><ul>${reasons(v).map(r=>`<li>${esc(r)}</li>`).join('')}</ul></div>`,'verdict '+(v.pass?'pass':'fail'))}
async function animateTo(t,from=0){const target=t.state==='VOIDED'?3:Math.max(ORDER.indexOf(t.state),t.verdict?2:-1);for(let i=from;i<=target;i++){renderSteps(t,i);await sleep(850)}return target}
async function finish(t){await animateTo(t,1);await think(700);verdictCard(t);await sleep(400);
 if(t.state==='VOIDED')agent(`I couldn't verify it, so <b>nobody was paid</b>. PayPal voided the $5 hold${(t.voidedAuthorizationId||t.voidId)?` (<span class="mono">${esc(t.voidedAuthorizationId||t.voidId)}</span>)`:''}. I'll re-post the task.`);
 else if(t.verdict?.pass)agent(`<b>${esc(t.verdict.answer)}</b> Verified from a real photo. PayPal captured the $5${t.captureId?` (<span class="mono">${esc(t.captureId)}</span>)`:''}${t.state==='PAID'?' and paid the worker.':t.payoutNote?'. Worker payout is queued.':'.'}`);
 else if(t.error)agent(`PayPal returned an error: <span class="mono">${esc(t.error)}</span>`);}
let busy=false;
const DEMO={pass:['Is the Walgreens on this corner a 24-hour pharmacy? Send a photo of the storefront sign.','Walgreens, North Las Vegas, NV'],fail:['Is the Rite Aid pharmacy at Union Tpke & 187th St open right now? Send a photo of the storefront sign.','Union Tpke & 187th St, Queens, NY']};
async function runDemo(kind){if(busy)return;busy=true;chat.innerHTML='';renderSteps(null,-1);
 const tp=fetch('/api/demo/'+kind).then(r=>r.json());const [q,loc]=DEMO[kind];$('#q').value=q;$('#loc').value=loc;user(q);await think();agent("I can't see the physical world. I'll hire a nearby human and pay only if their photo proves the answer.");await sleep(500);toolCall(q,loc);await sleep(900);
 const t=await tp;toolRet(t);$('#pDemo').hidden=!fake(t);renderSteps(t,0);await sleep(1200);
 agent(`PayPal is holding $5 (<span class="mono">${esc(t.authorizationId||'')}</span>). Not charged. A nearby worker accepted and sent a photo. <span class="demo-tag">PRESET PHOTO</span>`);const th=agent('<span class="typing"><i></i><i></i><i></i></span> checking the photo');
 const f=await fetch('/api/demo/'+kind+'/photo',{method:'POST'}).then(r=>r.json());th.remove();await finish(f);busy=false}
async function runLive(){if(busy)return;busy=true;chat.innerHTML='';$('#pDemo').hidden=true;renderSteps(null,-1);
 const q=$('#q').value,loc=$('#loc').value;user(q);await think();agent("I can't see the physical world. I'll hire a nearby human and pay only if their photo proves the answer.");await sleep(400);toolCall(q,loc);
 const r=await fetch('/api/hire',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:q,location:loc,budget:5})});const t=await r.json();
 if(!r.ok){agent('PayPal error: <span class="mono">'+esc(t.error)+'</span>');busy=false;return}
 toolRet(t);renderSteps(t,-1);
 add(`<a class="btn primary" href="${esc(t.approveUrl)}" target="_blank" rel="noopener">Approve $5 hold on PayPal ↗</a><a class="btn" href="/t/${esc(t.id)}" target="_blank">Open worker phone ↗</a>`,'linkrow');
 let held=false;for(let i=0;i<900;i++){await sleep(1500);let s;try{s=await fetch('/api/task/'+t.id).then(r=>r.json())}catch{continue}
  if(!held&&s.authorizationId){held=true;renderSteps(s,0);agent(`PayPal is holding $5 (<span class="mono">${esc(s.authorizationId)}</span>). Not charged. Task is live for nearby workers.`)}
  if(s.verdict&&(s.state==='PAID'||s.state==='VOIDED'||s.error||(s.state==='CAPTURED'&&s.payoutNote))){await finish(s);break}}
 busy=false}
$('#go').onclick=runLive;document.querySelectorAll('[data-demo]').forEach(b=>b.onclick=()=>runDemo(b.dataset.demo));
fetch('/api/status').then(r=>r.json()).then(d=>{if(d.paypal==='connected')$('#pPay').classList.add('ok');if(d.vision)$('#pVis').classList.add('ok');if(d.payouts)$('#pOut').classList.add('ok');else $('#pOut').lastChild.textContent='Payouts: fallback'}).catch(()=>{});
renderSteps(null,-1);
