// Gemini client using official Google SDK (@google/generative-ai)
// Public API: hasKey(), generateText({ system, user, timeoutMs })

const path = require('path');
const fs = require('fs');

function getKey() {
  const k = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (k) return k;
  try {
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const raw = fs.readFileSync(envPath, 'utf8');
      for (let line of raw.split(/\r?\n/)) {
        const i = line.indexOf(' #'); if (i >= 0) line = line.slice(0, i);
        const t = line.trim(); if (!t || t.startsWith('#')) continue;
        const eq = t.indexOf('='); if (eq <= 0) continue;
        const key = t.slice(0, eq).trim();
        const val = t.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
        if (key === 'GEMINI_API_KEY' || key === 'GOOGLE_API_KEY') return val;
      }
    }
  } catch {}
  return '';
}

function hasKey() { return !!getKey(); }

const DEBUG = process.env.GEMINI_DEBUG === '1' || process.env.NODE_ENV !== 'production';

async function generateText({ system, user, history = [], timeoutMs = 18000 }) {
  const API_KEY = getKey();
  if (!API_KEY) throw new Error('GEMINI_API_KEY missing');

  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(API_KEY);

  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
  const tried = [];
  const envModel = process.env.GEMINI_MODEL;
  const base = [
    'gemini-2.0-flash-001',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite-001',
    'gemini-2.5-flash',
    'gemini-1.5-flash',
    'gemini-1.5-pro'
  ];
  // Prefer stable 2.0 models first, then env override if provided (dedup)
  const models = [...base, envModel].filter(Boolean).filter((m, i, a) => a.indexOf(m) === i);

  try {
    let attemptModel = 0;
    for (const m of models) {
      if (attemptModel >= 3) break; // limit attempts to stay within route timeout
      try {
        const model = genAI.getGenerativeModel({ model: m });
        const prior = Array.isArray(history) ? history.map(h => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.text || '' }] })) : [];
        const req = {
          contents: [
            ...(system ? [{ role: 'user', parts: [{ text: `SYSTEM:\n${system}` }] }] : []),
            ...prior,
            { role: 'user', parts: [{ text: user }] }
          ],
          generationConfig: { temperature: 0.6, topP: 0.9, topK: 40, maxOutputTokens: 640, candidateCount: 1 }
        };
  // Note: do not set any safetySettings; SDK may default, but we rely on server defaults
  const result = await model.generateContent(req, { signal: controller.signal });
        const text = result?.response?.text?.() || '';
        if (text && text.trim()) { if (DEBUG) console.log(`[GeminiSDK] ${m} success`); return text.trim(); }
        tried.push(`${m}:empty`);
        if (DEBUG) console.warn(`[GeminiSDK] ${m} returned empty text`);
      } catch (e) {
        if (e?.name === 'AbortError') throw e;
        const msg = String(e?.message || e);
        tried.push(`${m}:${msg.slice(0,60)}`);
        if (DEBUG) console.warn(`[GeminiSDK] ${m} failed:`, msg);
        if (/\b503\b|UNAVAILABLE/i.test(msg)) {
          // short backoff then try next model
          await new Promise(r => setTimeout(r, 300));
        }
        // try next model
      }
      attemptModel++;
    }
    throw new Error(`No Gemini response (${tried.join(', ')})`);
  } finally {
    clearTimeout(to);
  }
}

module.exports = { hasKey, generateText };
