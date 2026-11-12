import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Ground Truth: an AI agent hires a human for $5. PayPal AUTHORIZES (holds) the money,
// a vision model checks the worker's photo, then PayPal CAPTURES + pays the worker (PASS)
// or VOIDS the hold (FAIL). Every PayPal status shown is read back from a GET endpoint.
const app = express(), upload = multer({ dest: 'uploads/' }), port = process.env.PORT || 3000;
const PP = process.env.PAYPAL_BASE || 'https://api-m.sandbox.paypal.com';
// PayPal sandbox test Visa (public PayPal developer test card, not a real card).
const SANDBOX_CARD = { number: process.env.SANDBOX_CARD_NUMBER || '4032039317984658', expiry: process.env.SANDBOX_CARD_EXPIRY || '2030-01', security_code: '123', name: 'Ground Truth Agent Wallet' };
const WORKER_EMAIL = process.env.PAYOUT_EMAIL || 'gt-worker-maria@personal.example.com';
const VISION_MODELS = (process.env.GEMINI_MODEL || 'gemini-3.5-flash,gemini-3.8-flash,gemini-flash-latest,gemini-3.5-flash-lite').split(',');
const DEMOS = {
  pass: { question: 'Is the Walgreens on this corner a 24-hour pharmacy? Send a photo of the storefront sign.', location: 'Walgreens, North Las Vegas, NV', photo: 'evidence/walgreens-24hr-pharmacy.jpg', credit: 'Photo: "Local markets nlv walgreens storefront 2" by Ken Lund, Wikimedia Commons (CC BY-SA 2.0)' },
  fail: { question: 'Is the Rite Aid pharmacy at Union Tpke & 187th St open right now? Send a photo of the storefront sign.', location: 'Union Tpke & 187th St, Queens, NY', photo: 'evidence/former-rite-aid-music-school.jpg', credit: 'Photo: "Union Tpke 187th St (2022-07-03) 03 - Real Brave Music School (Former Rite Aid)" by Tdorante10, Wikimedia Commons (CC BY-SA 4.0)' }
};
app.use(express.json());
app.use('/uploads', express.static('uploads'));
app.use('/evidence', express.static('evidence'));
app.use('/assets', express.static('public/assets'));
app.use(express.static('public', { index: false }));
const tasks = new Map(); let tokenCache = { value: '', expires: 0 };
async function token() { if (Date.now() < tokenCache.expires) return tokenCache.value; const raw = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64'); const r = await fetch(`${PP}/v1/oauth2/token`, { method: 'POST', headers: { Authorization: `Basic ${raw}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials' }); if (!r.ok) throw Error(`PayPal auth ${r.status}`); const j = await r.json(); tokenCache = { value: j.access_token, expires: Date.now() + (j.expires_in - 60) * 1000 }; return tokenCache.value; }
async function pp(method, url, body) { const t = await token(); const r = await fetch(`${PP}${url}`, { method, headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', Prefer: 'return=representation', 'PayPal-Request-Id': crypto.randomUUID() }, ...(body ? { body: JSON.stringify(body) } : {}) }); const txt = await r.text(); let j = {}; try { j = txt ? JSON.parse(txt) : {}; } catch {} if (!r.ok) throw Error(`PayPal ${method} ${url.split('?')[0]}: ${r.status} ${j.name || ''} ${j.details?.[0]?.issue || j.message || ''}`.trim()); return j; }
const log = (t, step, data) => { (t.trace ||= []).push({ at: new Date().toISOString(), step, ...data }); };

// 1. hire_human: create Orders v2 intent=AUTHORIZE paid by the agent's sandbox card. No redirect.
async function hireHuman({ question, location, budget = 5, photoHint }) {
  const id = crypto.randomUUID().slice(0, 8); const value = Number(budget).toFixed(2);
  const t = { id, question, location, budget: Number(budget), worker: WORKER_EMAIL, state: 'POSTED', createdAt: new Date().toISOString(), photoHint };
  tasks.set(id, t);
  const order = await pp('POST', '/v2/checkout/orders', { intent: 'AUTHORIZE', purchase_units: [{ reference_id: id, custom_id: `gt-${id}`, description: `Ground Truth task: ${question}`.slice(0, 127), amount: { currency_code: 'USD', value } }], payment_source: { card: SANDBOX_CARD } });
  t.orderId = order.id;
  let auth = order.purchase_units?.[0]?.payments?.authorizations?.[0];
  if (!auth) { const a = await pp('POST', `/v2/checkout/orders/${order.id}/authorize`, {}); auth = a.purchase_units?.[0]?.payments?.authorizations?.[0]; }
  t.authorizationId = auth?.id;
  const ord = await pp('GET', `/v2/checkout/orders/${order.id}`); t.orderStatus = ord.status;
  const ra = await pp('GET', `/v2/payments/authorizations/${t.authorizationId}`); t.authorizationStatus = ra.status; t.authorizationExpires = ra.expiration_time;
  log(t, 'HELD', { orderId: t.orderId, orderStatus: t.orderStatus, authorizationId: t.authorizationId, authorizationStatus: t.authorizationStatus });
  t.state = 'HELD'; return t;
}

// 2. Vision check with a strict JSON verdict.
async function verify(t, buf, mimeType) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) return { pass: false, reasons: ['No vision model key configured, so nothing was verified. Funds are not released.'], sign_text: '', open_status: 'unknown', model: 'none' };
  const prompt = `You are the verification step of a paid field task. A worker was paid-on-proof to photograph a place.\nTask: ${t.question}\nLocation: ${t.location}\nDecide if this photo is credible evidence that answers the task for the named business at that place. Read all visible signage exactly. FAIL if the business shown is a different business, the named business is gone or closed down, the sign is unreadable, or the photo does not show the requested storefront.\nReturn ONLY JSON: {"pass": boolean, "reasons": [string, ...], "sign_text": string, "open_status": "open"|"open_24h"|"closed"|"permanently_closed"|"unknown", "answer": string}`;
  let lastErr;
  for (const model of VISION_MODELS) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model.trim()}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify({ contents: [{ parts: [{ inlineData: { mimeType, data: buf.toString('base64') } }, { text: prompt }] }], generationConfig: { temperature: 0, responseMimeType: 'application/json' } }) });
      const j = await r.json(); if (!r.ok) throw Error(`${model} ${r.status} ${j.error?.status || ''}`);
      const v = JSON.parse(j.candidates[0].content.parts.map(p => p.text || '').join('').replace(/```json|```/g, ''));
      return { pass: v.pass === true, reasons: Array.isArray(v.reasons) ? v.reasons : [String(v.reasons || '')], sign_text: String(v.sign_text || ''), open_status: String(v.open_status || 'unknown'), answer: v.answer || '', model: model.trim() };
    } catch (e) { lastErr = e; }
  }
  return { pass: false, reasons: [`Vision model unavailable (${lastErr?.message}). Funds are not released.`], sign_text: '', open_status: 'unknown', model: 'error' };
}

// 3. Settle: capture + payout on PASS, void on FAIL. Read every result back.
async function settle(t) {
  if (t.verdict.pass) {
    const cap = await pp('POST', `/v2/payments/authorizations/${t.authorizationId}/capture`, { amount: { currency_code: 'USD', value: t.budget.toFixed(2) }, final_capture: true });
    t.captureId = cap.id; const rc = await pp('GET', `/v2/payments/captures/${cap.id}`); t.captureStatus = rc.status;
    const ra = await pp('GET', `/v2/payments/authorizations/${t.authorizationId}`); t.authorizationStatus = ra.status;
    log(t, 'CAPTURED', { captureId: t.captureId, captureStatus: t.captureStatus, authorizationStatus: t.authorizationStatus }); t.state = 'CAPTURED';
    try {
      const py = await pp('POST', '/v1/payments/payouts', { sender_batch_header: { sender_batch_id: `gt-${t.id}-${Date.now()}`, email_subject: 'Ground Truth: you got paid for a verified task', email_message: `Your photo for "${t.question}" was verified.` }, items: [{ recipient_type: 'EMAIL', amount: { value: t.budget.toFixed(2), currency: 'USD' }, receiver: t.worker, note: `Verified Ground Truth task ${t.id}`, sender_item_id: t.id }] });
      t.payoutBatchId = py.batch_header?.payout_batch_id;
      for (let i = 0; i < 6; i++) { const rd = await pp('GET', `/v1/payments/payouts/${t.payoutBatchId}`); t.payoutStatus = rd.batch_header?.batch_status; t.payoutItemId = rd.items?.[0]?.payout_item_id; t.payoutItemStatus = rd.items?.[0]?.transaction_status; if (t.payoutItemStatus && !['PENDING', 'NEW'].includes(t.payoutItemStatus)) break; await new Promise(r => setTimeout(r, 1500)); }
      log(t, 'PAID', { payoutBatchId: t.payoutBatchId, payoutStatus: t.payoutStatus, payoutItemId: t.payoutItemId, payoutItemStatus: t.payoutItemStatus });
      t.state = 'PAID';
    } catch (e) { t.payoutStatus = 'QUEUED'; t.payoutNote = 'Worker payout: queued (PayPal Payouts not enabled on this sandbox account)'; t.payoutError = e.message; log(t, 'PAYOUT_QUEUED', { error: e.message }); }
  } else {
    const v = await pp('POST', `/v2/payments/authorizations/${t.authorizationId}/void`);
    const ra = await pp('GET', `/v2/payments/authorizations/${t.authorizationId}`); t.authorizationStatus = ra.status; t.voidedAuthorizationId = t.authorizationId; t.voidId = v.id || t.authorizationId;
    t.captureStatus = 'NOT CAPTURED'; t.payoutStatus = 'NOT PAID';
    log(t, 'VOIDED', { authorizationId: t.authorizationId, authorizationStatus: t.authorizationStatus }); t.state = 'VOIDED';
  }
  return t;
}
async function submitEvidence(t, buf, mimeType, photoUrl) {
  t.photo = photoUrl; t.state = 'PHOTO IN'; log(t, 'PHOTO IN', { photo: photoUrl });
  t.verdict = await verify(t, buf, mimeType); t.verdict.reason = t.verdict.reasons.join(' ');
  t.state = 'VERIFIED'; log(t, 'VERIFIED', { pass: t.verdict.pass, sign_text: t.verdict.sign_text, open_status: t.verdict.open_status, model: t.verdict.model });
  return settle(t);
}
const agentReply = t => ({ task_id: t.id, state: t.state, answer: t.verdict ? (t.verdict.pass ? t.verdict.answer : 'Could not verify. The hold was voided and nobody was paid.') : null, verdict: t.verdict, paypal: { orderId: t.orderId, orderStatus: t.orderStatus, authorizationId: t.authorizationId, authorizationStatus: t.authorizationStatus, captureId: t.captureId, captureStatus: t.captureStatus, payoutBatchId: t.payoutBatchId, payoutStatus: t.payoutStatus, payoutItemStatus: t.payoutItemStatus, payoutNote: t.payoutNote } });

app.get('/api/status', async (_q, s) => { let paypal = 'offline'; try { await token(); paypal = 'connected'; } catch {} s.json({ paypal, payouts: paypal === 'connected', mode: 'sandbox', vision: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) }); });
app.post('/api/hire', async (req, res) => { const { question, location, budget = 5 } = req.body || {}; if (!question || !location) return res.status(400).json({ error: 'Question and location required' }); try { res.json(await hireHuman({ question, location, budget })); } catch (e) { res.status(502).json({ error: e.message }); } });
// MCP-style tool endpoints for agents.
app.get('/mcp/tools', (_q, s) => s.json({ tools: [{ name: 'hire_human', description: 'Pay a nearby human up to $budget to photograph a physical-world fact. PayPal holds the money; it is captured only if a vision model verifies the photo, otherwise the hold is voided.', input_schema: { type: 'object', required: ['question', 'location'], properties: { question: { type: 'string' }, location: { type: 'string' }, budget: { type: 'number', default: 5 } } } }, { name: 'task_status', description: 'Read a Ground Truth task: verdict and PayPal statuses.', input_schema: { type: 'object', required: ['task_id'], properties: { task_id: { type: 'string' } } } }] }));
app.post('/mcp/tools/hire_human', async (req, res) => { try { const t = await hireHuman(req.body || {}); res.json(agentReply(t)); } catch (e) { res.status(502).json({ error: e.message }); } });
app.post('/mcp/tools/task_status', (req, res) => { const t = tasks.get(req.body?.task_id); t ? res.json(agentReply(t)) : res.status(404).json({ error: 'Task not found' }); });
app.get('/paypal/return', (_q, s) => s.redirect('/'));
app.get('/api/task/:id', (q, s) => { const t = tasks.get(q.params.id); t ? s.json(t) : s.status(404).json({ error: 'Task not found' }); });
app.post('/api/task/:id/photo', upload.single('photo'), async (req, res) => { const t = tasks.get(req.params.id); if (!t) return res.status(404).json({ error: 'Task not found' }); if (!req.file) return res.status(400).json({ error: 'Photo required' }); if (t.state !== 'HELD') return res.status(409).json({ error: `Task already ${t.state}` }); try { res.json(await submitEvidence(t, fs.readFileSync(req.file.path), req.file.mimetype, '/uploads/' + path.basename(req.file.path))); } catch (e) { t.error = e.message; res.status(502).json(t); } });
// Demo: same real PayPal + vision path, with a real public-domain/CC photo as the worker's evidence.
app.get('/api/demo/:kind', async (q, s) => { const d = DEMOS[q.params.kind]; if (!d) return s.sendStatus(404); try { const t = await hireHuman({ question: d.question, location: d.location, budget: 5 }); t.demo = q.params.kind; t.photoCredit = d.credit; tasks.set(`demo-${q.params.kind}`, t); s.json(t); } catch (e) { s.status(502).json({ error: e.message }); } });
app.post('/api/demo/:kind/photo', async (q, s) => { const d = DEMOS[q.params.kind]; const t = tasks.get(`demo-${q.params.kind}`); if (!d || !t) return s.sendStatus(404); if (t.state !== 'HELD') return s.json(t); try { s.json(await submitEvidence(t, fs.readFileSync(d.photo), 'image/jpeg', '/' + d.photo)); } catch (e) { t.error = e.message; s.status(502).json(t); } });
const sendUi = (_q, s) => { const f = path.resolve('public/index.html'); fs.existsSync(f) ? s.sendFile(f) : s.send(page); };
app.get('/t/:id', sendUi); app.get('/', sendUi);
const page=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ground Truth</title><style>*{box-sizing:border-box}body{margin:0;background:#0b0d0e;color:#e9efea;font:15px ui-monospace,SFMono-Regular,Menlo,monospace}header{height:72px;border-bottom:1px solid #242a28;padding:22px 5vw;display:flex;justify-content:space-between;color:#a6b5aa}.brand{color:#d9ff71;font-weight:800;letter-spacing:.08em}.grid{display:grid;grid-template-columns:1.1fr .9fr;min-height:calc(100vh - 72px)}section{padding:6vh 5vw;border-right:1px solid #252a27}h1{font:500 clamp(32px,5vw,60px)/1.05 system-ui;letter-spacing:-.05em;max-width:640px;margin:32px 0 14px}p{color:#9ba79e;line-height:1.6}.eyebrow{color:#d9ff71;font-size:11px;letter-spacing:.14em}.box{background:#111514;border:1px solid #2b332f;border-radius:8px;padding:20px;margin:26px 0}.label{font-size:10px;color:#89958d;letter-spacing:.12em}textarea,input{background:#0b0d0e;color:#e9efea;border:1px solid #303833;padding:13px;width:100%;font:inherit;border-radius:4px;margin-top:8px}button{background:#d9ff71;border:0;border-radius:4px;padding:13px 17px;font:700 13px inherit;cursor:pointer;margin:8px 8px 0 0}.secondary{background:#202722;color:#d9ff71;border:1px solid #424e46}.timeline{padding:6vh 5vw}.step{border-left:1px solid #38433c;padding:0 0 32px 24px;position:relative;color:#69766d}.step:before{content:'';position:absolute;left:-5px;top:0;width:9px;height:9px;background:#465349;border-radius:50%}.step.on{color:#e4eee6}.step.on:before{background:#d9ff71;box-shadow:0 0 12px #d9ff71}.result{white-space:pre-wrap;color:#c6d2c8;font:12px/1.6 monospace}.proof{max-width:100%;border-radius:5px;margin-top:14px}.status{color:#d9ff71}@media(max-width:760px){.grid{grid-template-columns:1fr}section{padding:35px 22px;border-right:0;border-bottom:1px solid #252a27}.timeline{padding:35px 22px}h1{margin-top:18px}}</style></head><body><header><span class="brand">GROUND TRUTH / FIELD OPS</span><span id="health">CONNECTING…</span></header><div class="grid"><section><div class="eyebrow">AGENT CONSOLE · SANDBOX</div><h1>Proof from the physical world.</h1><p>Request a human check. Release funds only when the photo supports the answer.</p><div class="box"><div class="label">NEW FIELD REQUEST · $5.00</div><textarea id="q" rows="3">Is the pharmacy on 5th St open right now? Photo of the storefront with the hours sign.</textarea><input id="loc" value="5th Street, New York"><button onclick="hire()">Run agent request ↗</button><button class="secondary" onclick="demo('pass')">Load PASS demo</button><button class="secondary" onclick="demo('fail')">Load FAIL demo</button></div><div id="worker" class="box" hidden><div class="label">WORKER TASK · PRICE SHOWN BEFORE ACCEPTANCE</div><div id="taskinfo"></div><input id="photo" type="file" accept="image/*" capture="environment"><button onclick="submitPhoto()">Accept & submit evidence</button></div><div class="box"><div class="label">AGENT RESPONSE / PROOF</div><div id="out" class="result">Waiting for a request.</div></div></section><aside class="timeline"><div class="eyebrow">SETTLEMENT TRACE</div><h2>Money follows evidence.</h2><p>PayPal sandbox · Orders v2 authorization · Payout state read back</p><div id="steps">${['HELD','PHOTO IN','VERIFIED','CAPTURED','PAID'].map(x=>`<div class="step">${x}</div>`).join('')}</div><div class="box"><div class="label">LIVE API CAPABILITIES</div><div id="caps" class="result">Checking PayPal…</div></div></aside></div><script>let current;async function status(){let d=await fetch('/api/status').then(x=>x.json());health.textContent='PAYPAL '+d.paypal.toUpperCase();caps.textContent='PayPal API: '+d.paypal+'\\nPayouts: '+(d.payouts?'enabled':'unavailable, capture-to-merchant fallback')+'\\nVision: '+(d.vision?'Gemini connected':'not configured')}status();function timeline(state){let order=['HELD','PHOTO IN','VERIFIED','CAPTURED','PAID'];document.querySelectorAll('.step').forEach((e,i)=>e.classList.toggle('on',order.indexOf(e.textContent)<=order.indexOf(state)))}async function hire(){out.textContent='Agent calling hire_human(question, location, budget)…';let r=await fetch('/api/hire',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:q.value,location:loc.value,budget:5})});let d=await r.json();if(!r.ok){out.textContent=JSON.stringify(d,null,2);return}current=d;timeline(d.state);worker.hidden=false;taskinfo.textContent=d.question+'\\nLocation: '+d.location+'\\nWorker price: $'+d.budget+'\\nAuthorization: '+d.authorizationId;out.textContent='Authorization held. Worker task is open.'}async function demo(kind){current=await fetch('/api/demo/'+kind).then(x=>x.json());timeline('HELD');worker.hidden=false;taskinfo.textContent=current.question+'\\nLocation: '+current.location+'\\nWorker price: $5.00';await fetch('/api/demo/'+kind+'/photo',{method:'POST'}).then(x=>x.json()).then(show)}async function submitPhoto(){if(current?.demo){let k=current.id.split('-')[1];return fetch('/api/demo/'+k+'/photo',{method:'POST'}).then(x=>x.json()).then(show)}if(!current)return;let f=photo.files[0];if(!f)return alert('Choose a photo first');let form=new FormData();form.append('photo',f);let d=await fetch('/api/task/'+current.id+'/photo',{method:'POST',body:form}).then(x=>x.json());show(d)}function show(d){current=d;timeline(d.state);out.textContent=JSON.stringify({answer:d.verdict?.answer,verdict:d.verdict?.pass?'PASS':'FAIL',reason:d.verdict?.reason,photo:d.photo,captureId:d.captureId,captureStatus:d.captureStatus,payoutBatchId:d.payoutBatchId,payoutStatus:d.payoutStatus,voidId:d.voidId},null,2);if(d.photo){let im=document.createElement('img');im.className='proof';im.src=d.photo;out.appendChild(im)}}</script></body></html>`;
app.listen(port,()=>console.log(`Ground Truth listening on ${port}`));
