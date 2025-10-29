const express = require('express');
const dayjs = require('dayjs');
const router = express.Router();
const { hasKey: hasGeminiKey, generateText: geminiGenerateRest } = require('../utils/gemini');
const { generateText: geminiGenerateSdk } = (() => { try { return require('../utils/gemini_sdk'); } catch { return { generateText: null }; } })();

const canned = [
  "I'm on it! Here's a quick tip: set aside a small amount daily to reach your goal faster.",
  "Heads up: a few subscriptions are due soon. Want me to list them?",
  "You're doing great! Your top spending category this month is Dining Out.",
  "Consider boosting your Emergency Fund—aim for 3-6 months of expenses.",
  "Safe to Spend looks healthy today. Keep it up!"
];

// Fetch recent buddy chat history (last 20 messages)
router.get('/buddy/history', (req, res) => {
  try {
    const hist = Array.isArray(req.session?.buddyHistory) ? req.session.buddyHistory.slice(-20) : [];
    return res.json({ ok: true, history: hist });
  } catch (e) {
    return res.json({ ok: true, history: [] });
  }
});

// Reset buddy chat history
router.post('/buddy/reset', (req, res) => {
  try {
    if (req.session) req.session.buddyHistory = [];
  } catch {}
  return res.json({ ok: true });
});

router.post('/buddy', async (req, res) => {
  const prisma = req.prisma;
  const userId = req.session?.userId;
  const userMsg = String(req.body?.message || '').trim();
  // Ensure per-session chat history exists
  if (req.session && !Array.isArray(req.session.buddyHistory)) {
    req.session.buddyHistory = [];
  }

  // If no Gemini key, fall back to canned logic
  const fallback = () => {
    const text = userMsg.toLowerCase();
    // Curated suggestions for investable Indian stocks & funds (with simple category/intent parsing)
    if (/(stock|stocks|share|shares|mutual fund|mutual funds|etf|sip)/i.test(text)) {
      const wantsIndexOnly = /(index only|only index)/i.test(userMsg);
      const wantsStocksOnly = /(stocks only|only stocks|just stocks)/i.test(userMsg);
      const wantsFundsOnly = /(funds only|only funds|just funds|only mutual)/i.test(userMsg);
      const bank = /(bank|banking|financials|finserv)/i.test(userMsg);
      const it = /(it|tech|technology|software|it services)/i.test(userMsg);
      const energy = /(energy|oil|gas|power|utilities)/i.test(userMsg);
      const auto = /(auto|automobile|vehicle|ev|cars|bikes)/i.test(userMsg);
      const pharma = /(pharma|pharmaceutical|healthcare|health care)/i.test(userMsg);

      const stockSets = {
        default: [
          ['RELIANCE', 'Reliance Industries: diversified across energy, retail, telecom'],
          ['HDFCBANK', 'HDFC Bank: large private bank with steady asset quality'],
          ['TCS', 'Tata Consultancy Services: large‑cap IT services exporter']
        ],
        bank: [ ['HDFCBANK','Large private bank'], ['ICICIBANK','Private bank with strong ROE'], ['KOTAKBANK','Conservative growth bank'] ],
        it: [ ['TCS','IT services bellwether'], ['INFY','Infosys: diversified IT'], ['HCLTECH','Engineering & services mix'] ],
        energy: [ ['RELIANCE','Diversified energy/retail/telecom'], ['NTPC','Power generation major'], ['POWERGRID','Power transmission utility'] ],
        auto: [ ['TATAMOTORS','PV & EV exposure'], ['MARUTI','Leading passenger vehicles'], ['BAJAJ-AUTO','Two‑wheelers exports mix'] ],
        pharma: [ ['SUNPHARMA','Largest pharma by mcap'], ['CIPLA','Broad portfolio'], ['DRREDDY','US generics exposure'] ]
      };
      const fundSets = {
        index: [
          ['NIFTYBEES','Nippon India ETF Nifty 50 (core index exposure)'],
          ['UTI Nifty 50 Index Fund — Direct','Broad market index fund'],
          ['HDFC Index Fund – Nifty 50 — Direct','Low‑cost index fund']
        ],
        flexi: [ ['Parag Parikh Flexi Cap — Direct','Diversified flexi‑cap'] ],
        largemid: [ ['Mirae Asset Large & Midcap — Direct','Blend of large & midcaps'] ],
        debtShort: [ ['HDFC Short Term Debt — Direct','Short‑duration debt (lower volatility)'] ],
        liquid: [ ['ICICI Prudential Liquid — Direct','For near‑cash parking'] ],
        gold: [ ['GOLDBEES','Nippon India ETF Gold BeES (gold hedge)'] ]
      };

      const pickStocks = () => {
        const cat = bank ? 'bank' : it ? 'it' : energy ? 'energy' : auto ? 'auto' : pharma ? 'pharma' : 'default';
        return stockSets[cat].map(([t, r]) => `• ${t} — ${r}`);
      };
      const pickIndexOnly = () => fundSets.index.map(([t, r]) => `• ${t} — ${r}`);
      const pickFundsMixed = () => [
        ...fundSets.index.slice(0,2).map(([t, r]) => `• ${t} — ${r}`),
        ...fundSets.flexi.map(([t, r]) => `• ${t} — ${r}`),
        ...fundSets.debtShort.map(([t, r]) => `• ${t} — ${r}`)
      ];

      const lines = [];
      lines.push('Here are investable options you can explore (verify live availability with your broker):');
      lines.push('');
      if (!wantsFundsOnly && !wantsIndexOnly) {
        lines.push('Stocks (NSE):');
        lines.push(...pickStocks());
        lines.push('');
      }
      if (!wantsStocksOnly) {
        lines.push(wantsIndexOnly ? 'Index funds / ETFs:' : 'Funds / ETFs:');
        lines.push(...(wantsIndexOnly ? pickIndexOnly() : pickFundsMixed()));
        lines.push('');
      }
      lines.push('Tip: Start with an index fund/ETF as your core, add 1–2 large‑cap stocks or a flexi‑cap fund, set up a monthly SIP, and review yearly.');
      return lines.join('\n');
    }
    // Smart fallback: investment split if user asks about investing a salary percentage
    const investRe = /(invest|allocate|save)[^\d%]*(\d{1,3})(?:\s?%| percent)|salary\s*is\s*₹?([\d,]+)/i;
    if (/invest|allocate|mutual fund|sip/.test(text)) {
      // Try to detect percentage and/or salary amount from the message
      let pct = 25;
      let salary = 0;
      const pctMatch = text.match(/(\d{1,3})\s?%/);
      if (pctMatch) pct = Math.min(100, Math.max(1, Number(pctMatch[1])));
      const salaryMatch = userMsg.match(/₹?([\d,]{4,})/);
      if (salaryMatch) salary = Number(String(salaryMatch[1]).replace(/,/g, '')) || 0;
      const monthly = salary > 0 ? Math.round((salary * pct) / 100) : null;
      // Simple, balanced allocation (India): 50% index, 20% large-cap, 20% short-term debt, 10% gold
      const total = monthly ?? 10000; // assume ₹10,000 if amount not detected
      const amt = (p) => `₹${Math.round((total * p) / 100).toLocaleString('en-IN')}`;
      const parts = [
        `${amt(50)} in Nifty 50/Total Market index funds (core growth)`,
        `${amt(20)} in large-cap diversified funds (stability)`,
        `${amt(20)} in short-term debt/liquid funds (buffer)`,
        `${amt(10)} in gold (hedge)`
      ];
      const intro = monthly ? `Invest ${pct}% of ₹${salary.toLocaleString('en-IN')} ≈ ₹${monthly.toLocaleString('en-IN')} per month.` : `Here’s a balanced split for your monthly investing:`;
      return `${intro}\n• ${parts.join('\n• ')}\nTip: Set up 1 auto-SIP date (post-salary) and review yearly.`;
    }
    let reply = canned[Math.floor(Math.random() * canned.length)];
    if (text.includes('bill') || text.includes('due')) reply = 'You have 2 bills due within 5 days. I suggest reviewing your subscriptions page.';
    if (text.includes('goal')) reply = 'Your Paris vacation goal is at 45%. Adding ₹100 this week keeps you on track.';
    if (text.includes('budget')) reply = 'You have 72% of your Groceries budget remaining.';
    if (text.includes('spend')) reply = 'Your Safe to Spend today is approximately ₹120.';
    return reply;
  };

  if (!hasGeminiKey()) {
    return res.json({ ok: true, reply: fallback() });
  }

  try {
    // Gather a compact financial context for the current user
    const startOfMonth = dayjs().startOf('month').toDate();
    const endOfMonth = dayjs().endOf('month').toDate();

    const [accounts, monthTx, subs, goals] = await Promise.all([
      prisma.account.findMany({ where: { userId } }),
      prisma.transaction.findMany({
        where: { userId, date: { gte: startOfMonth, lte: endOfMonth } },
        include: { category: true },
        orderBy: { date: 'desc' }
      }),
      prisma.subscription.findMany({
        where: { userId, status: { in: ['ACTIVE', 'active'] }, dueDate: { gte: startOfMonth, lte: endOfMonth } },
        orderBy: { dueDate: 'asc' }
      }),
      prisma.goal.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } })
    ]);

    const totalBalance = accounts.reduce((s, a) => s + (Number(a.currentBalance) || 0), 0);

    let incomeThisMonth = 0;
    let spentThisMonth = 0;
    const byCat = new Map();
    for (const t of monthTx) {
      const amt = Number(t.amount) || 0;
      const typ = (t.type || '').toString().toLowerCase();
      if (typ === 'income') incomeThisMonth += Math.abs(amt);
      else if (typ === 'expense') {
        spentThisMonth += Math.abs(amt);
        const key = t.category ? t.category.name : 'Uncategorized';
        byCat.set(key, (byCat.get(key) || 0) + Math.abs(amt));
      } else {
        if (amt >= 0) incomeThisMonth += Math.abs(amt);
        else {
          spentThisMonth += Math.abs(amt);
          const key = t.category ? t.category.name : 'Uncategorized';
          byCat.set(key, (byCat.get(key) || 0) + Math.abs(amt));
        }
      }
    }
    let topCategory = '—';
    let maxTotal = 0;
    for (const [name, total] of byCat.entries()) {
      if (total > maxTotal) { maxTotal = total; topCategory = name; }
    }
    const totalUpcomingBills = subs.reduce((acc, s) => acc + (Number(s.amount) || 0), 0);

    const today = dayjs();
    const plannedSavings = goals.reduce((acc, g) => {
      const remaining = Math.max(0, (Number(g.targetAmount) || 0) - (Number(g.savedAmount) || 0));
      const monthsLeft = Math.max(1, dayjs(g.targetDate || endOfMonth).diff(today, 'month'));
      return acc + (remaining > 0 ? remaining / monthsLeft : 0);
    }, 0);

    const flowNet = Math.max(0, incomeThisMonth - spentThisMonth);
    const base = totalBalance > 0 ? totalBalance : flowNet;
    let safeToSpend = base - totalUpcomingBills - plannedSavings;
    if (!isFinite(safeToSpend)) safeToSpend = 0;
    safeToSpend = Math.max(0, Math.round(safeToSpend));

    // Build a concise context
    const last3 = monthTx.slice(0, 3).map(t => {
      const sign = Number(t.amount) >= 0 ? '+' : '-';
      const amt = Math.abs(Number(t.amount) || 0).toFixed(0);
      const cat = t.category ? t.category.name : 'Uncategorized';
      return `${t.description} (${cat}) ${sign}₹${amt}`;
    }).join('\n');

    const system = [
      'You are Pocket Guard, an Indian personal finance assistant. Tone: concise, friendly, helpful.',
      'Use INR (₹) with no decimals unless needed. Avoid disclaimers and overly generic advice.',
      'Ground your answers strictly in the provided user context when relevant.',
      'If the user asks for stocks or mutual funds: list 3–6 India‑focused options investable via NSE/BSE or Indian AMCs.',
      'Format: Name (or NSE ticker) — 1‑line rationale. Prefer broad‑market index funds/ETFs and large‑cap names over niche picks. Avoid penny stocks.',
      'If they say "index only", suggest index funds/ETFs only; if "stocks only" or "funds only", respect that. If they mention a sector (banking, IT, auto, energy, pharma), align the stock picks to it.',
      'Prefer 2-5 sentences; if listing, keep it short bullets. Offer 1 actionable next step when appropriate.'
    ].join('\n');

    const context = [
      `This-month income: ₹${Math.round(incomeThisMonth)}`,
      `This-month spent: ₹${Math.round(spentThisMonth)}`,
      `Top spending category: ${topCategory}`,
      `Upcoming bills (this month): ₹${Math.round(totalUpcomingBills)}`,
      `Planned monthly savings (goals): ₹${Math.round(plannedSavings)}`,
      `Safe to Spend (est.): ₹${safeToSpend}`,
      last3 ? `Recent: \n${last3}` : ''
    ].filter(Boolean).join('\n');

    const user = `User question: ${userMsg || 'Say hi.'}\n\nUser context:\n${context}`;

  // Prepare short chat history (last 8 messages) for follow-ups
  const rawHist = Array.isArray(req.session?.buddyHistory) ? req.session.buddyHistory : [];
  const history = rawHist.slice(-8).map((h) => ({
    role: (/^(assistant|ai|model)$/i).test(h.role) ? 'assistant' : 'user',
    text: String(h.text || '').slice(0, 4000)
  }));

  let reply = '';
  const useSdk = typeof geminiGenerateSdk === 'function';
  try {
    if (useSdk) reply = await geminiGenerateSdk({ system, user, history, timeoutMs: 18000 });
  } catch {}
  if (!reply) {
    reply = await geminiGenerateRest({ system, user, history, timeoutMs: 18000 });
  }
    if (!reply) reply = fallback();
    // Append turn to session history
    try {
      req.session.buddyHistory.push({ role: 'user', text: userMsg });
      req.session.buddyHistory.push({ role: 'assistant', text: reply });
    } catch {}
    return res.json({ ok: true, reply });
  } catch (err) {
    console.warn('Buddy error, falling back:', err.message);
    const fb = fallback();
    try {
      req.session.buddyHistory.push({ role: 'user', text: userMsg });
      req.session.buddyHistory.push({ role: 'assistant', text: fb });
    } catch {}
    return res.json({ ok: true, reply: fb });
  }
});

module.exports = router;
