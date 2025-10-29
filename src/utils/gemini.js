// Gemini REST client with model resolution and API version fallback.
// Public API: hasKey(), generateText({ system, user, timeoutMs })

const fs = require('fs');
const path = require('path');

function getKey() {
  const k = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (k) return k;
  const candidates = [
    path.join(process.cwd(), '.env'),
    path.join(__dirname, '../../.env'),
    path.join(__dirname, '../../../.env')
  ];
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
      for (let line of raw.split(/\r?\n/)) {
        const i = line.indexOf(' #'); if (i >= 0) line = line.slice(0, i);
        const t = line.trim(); if (!t || t.startsWith('#')) continue;
        const eq = t.indexOf('='); if (eq <= 0) continue;
        const key = t.slice(0, eq).replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
        let val = t.slice(eq + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
        val = val.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
        if (key === 'GEMINI_API_KEY' || key === 'GOOGLE_API_KEY') return val;
      }
    } catch {}
  }
  return '';
}

function getModel() { return process.env.GEMINI_MODEL || 'gemini-1.5-flash'; }

let _fetch = (typeof fetch !== 'undefined') ? fetch : null;
function ensureFetch() {
  if (_fetch) return _fetch;
  try { _fetch = require('node-fetch'); return _fetch; } catch { throw new Error('fetch is not available in this environment'); }
}

function hasKey() { return Boolean(getKey()); }

const DEBUG = process.env.GEMINI_DEBUG === '1' || process.env.NODE_ENV !== 'production';

async function listModels(apiVer, apiKey, fetchFn, signal) {
  const url = `https://generativelanguage.googleapis.com/${apiVer}/models?key=${encodeURIComponent(apiKey)}`;
  try {
    const res = await fetchFn(url, { signal });
    if (!res.ok) return [];
    const data = await res.json().catch(() => ({}));
    const arr = Array.isArray(data.models) ? data.models : [];
    const names = arr.map((m) => String(m.name || '').replace(/^models\//, '')).filter(Boolean);
    if (DEBUG) console.log(`[Gemini] ${apiVer} models:`, names.slice(0, 5), names.length > 5 ? `(+${names.length - 5} more)` : '');
    return names;
  } catch {
    return [];
  }
}

function makeCandidates(apiVer, available, preferred) {
  const out = [];
  const add = (m) => { if (m && !out.includes(m)) out.push(m); };
  // Start with explicitly preferred
  if (preferred) { add(preferred); if (!/-latest$/.test(preferred)) add(`${preferred}-latest`); }
  // Strategy per API version
  if (apiVer === 'v1') {
    // v1 commonly supports 2.x
    for (const r of ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-2.0-flash-001', 'gemini-2.0-flash-lite-001']) add(r);
    for (const r of ['gemini-1.5-flash-latest','gemini-1.5-flash','gemini-1.5-pro-latest','gemini-1.5-pro']) add(r);
  } else {
    // v1beta: try proven-stable 1.5 first, then 2.x previews
    for (const r of ['gemini-1.5-flash-latest','gemini-1.5-flash','gemini-1.5-pro-latest','gemini-1.5-pro','gemini-1.5-flash-8b-latest','gemini-1.5-flash-8b','gemini-pro']) add(r);
    for (const r of ['gemini-2.5-flash','gemini-2.5-pro','gemini-2.0-flash']) add(r);
  }
  if (available && available.length) {
    const intersect = out.filter((m) => available.includes(m));
    return intersect.length ? intersect : [...available, ...out.filter((m) => !available.includes(m))];
  }
  return out;
}

async function generateText({ system, user, history = [], timeoutMs = 12000 }) {
  const API_KEY = getKey();
  const MODEL = getModel();
  if (!API_KEY) throw new Error('GEMINI_API_KEY missing');

  const fetchFn = ensureFetch();
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
  const buildUrl = (apiVer, model) => `https://generativelanguage.googleapis.com/${apiVer}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(API_KEY)}`;
  const prior = Array.isArray(history) ? history.map(h => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.text || '' }] })) : [];
  // Important: do NOT include safetySettings; differing enums across API versions cause 400s
  const body = {
    contents: [
      ...(system ? [{ role: 'user', parts: [{ text: `SYSTEM:\n${system}` }] }] : []),
      ...prior,
      { role: 'user', parts: [{ text: user }] }
    ],
    generationConfig: { temperature: 0.6, topP: 0.9, topK: 40, maxOutputTokens: 640, candidateCount: 1 }
  };
  const tried = [];
  const isNotFound = (status, detail) => status === 404 || /not found|NOT_FOUND|is not supported for generateContent/i.test(detail || '');
  const isSchemaMismatch = (status, detail) => status === 400 && /Invalid JSON payload received|Unknown name/i.test(detail || '');
  const isTransient = (status) => [408, 409, 429, 500, 502, 503, 504].includes(Number(status));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  try {
    for (const apiVer of ['v1', 'v1beta']) {
      const avail = await listModels(apiVer, API_KEY, fetchFn, controller.signal);
  let candidates = makeCandidates(apiVer, avail, MODEL);
        // Prefer stable 2.0 variants first
        const prefer = ['gemini-2.0-flash-001','gemini-2.0-flash','gemini-2.0-flash-lite-001'];
        candidates = [...prefer.filter(m => candidates.includes(m)), ...candidates.filter(m => !prefer.includes(m))];
        // Avoid overly long loops; try top 4 per API version
        if (candidates.length > 4) candidates = candidates.slice(0, 4);
      if (DEBUG) console.log(`[Gemini] Trying ${apiVer} candidates:`, candidates);
      for (const m of candidates) {
        try {
          let attempt = 0;
          let lastErrText = '';
            while (attempt < 2) {
            attempt++;
            const res = await fetchFn(buildUrl(apiVer, m), {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal
            });
            if (!res.ok) {
              let detail = ''; try { detail = await res.text(); } catch {}
              lastErrText = detail;
              tried.push(`${apiVer}/${m}:${res.status}`);
              if (isNotFound(res.status, detail) || isSchemaMismatch(res.status, detail)) break; // try next model or apiVer
                if (isTransient(res.status) && attempt < 2) {
                  const backoff = 350; // single short backoff to stay within server timeout
                if (DEBUG) console.warn(`[Gemini] ${apiVer}/${m} transient ${res.status}, retrying in ${backoff}ms...`);
                await sleep(backoff);
                continue;
              }
              // Non-transient or max retries reached: move on to next model
              break;
            }
            const data = await res.json();
            if (DEBUG && data?.promptFeedback) console.warn('[Gemini] promptFeedback:', JSON.stringify(data.promptFeedback));
            const parts = data?.candidates?.[0]?.content?.parts || [];
            const text = Array.isArray(parts) ? parts.map(p => p?.text || '').join('').trim() : '';
            if (text && text.trim()) {
              if (DEBUG) console.log(`[Gemini] Success with ${apiVer}/${m}${attempt > 1 ? ` (attempt ${attempt})` : ''}`);
              return text.trim();
            }
            // If empty text, treat as transient and try next attempt/model
            if (DEBUG) console.warn(`[Gemini] Empty response from ${apiVer}/${m}${attempt > 1 ? ` (attempt ${attempt})` : ''}`);
            if (attempt >= 2) break;
          }
          // loop fell through without success: try next model
          if (DEBUG && lastErrText) console.warn(`[Gemini] Failed ${apiVer}/${m}: ${lastErrText.slice(0, 160)}...`);
        } catch (e) {
          if (e?.name === 'AbortError') throw e;
          // Network-ish or unexpected: try next model
        }
      }
    }
    const msg = `Gemini models not available (${tried.join(', ')})`;
    if (DEBUG) console.warn('[Gemini]', msg);
    throw new Error(msg);
  } finally {
    clearTimeout(t);
  }
}

module.exports = { hasKey, generateText };
