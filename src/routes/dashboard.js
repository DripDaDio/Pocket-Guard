const express = require('express');
const dayjs = require('dayjs');
const { PrismaClient } = require('@prisma/client');
const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) return res.redirect('/login');
  next();
}

router.get('/', requireAuth, async (req, res) => {
  const prisma = req.prisma || new PrismaClient();
  const userId = req.session.userId;
  const startOfMonth = dayjs().startOf('month').toDate();
  const endOfMonth = dayjs().endOf('month').toDate();

  try {
    const [accounts, monthTx, recentTx, subs, goals] = await Promise.all([
      prisma.account.findMany({ where: { userId } }),
      prisma.transaction.findMany({
        where: { userId, date: { gte: startOfMonth, lte: endOfMonth } },
        include: { category: true },
        orderBy: { date: 'desc' }
      }),
      prisma.transaction.findMany({
        where: { userId },
        orderBy: { date: 'desc' },
        take: 7,
        include: { category: true }
      }),
      prisma.subscription.findMany({
        where: {
          userId,
          status: { in: ['ACTIVE', 'active'] },
          dueDate: { gte: startOfMonth, lte: endOfMonth }
        },
        orderBy: { dueDate: 'asc' }
      }),
      prisma.goal.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } })
    ]);

    // Balance across accounts (for snapshot usage if needed)
    const totalBalance = accounts.reduce((s, a) => s + (Number(a.currentBalance) || 0), 0);

    // Robust monthly totals: prefer explicit type, otherwise fallback to sign; avoid double counting
    let incomeThisMonth = 0;
    let spentThisMonth = 0;
    for (const t of monthTx) {
      const amt = Number(t.amount);
      const typ = (t.type || '').toString().toLowerCase();
      if (typ === 'income') {
        incomeThisMonth += Math.abs(isNaN(amt) ? 0 : amt);
      } else if (typ === 'expense') {
        spentThisMonth += Math.abs(isNaN(amt) ? 0 : amt);
      } else {
        // Fallback on sign only if type missing/unknown
        if (!isNaN(amt)) {
          if (amt >= 0) incomeThisMonth += Math.abs(amt);
          else spentThisMonth += Math.abs(amt);
        }
      }
    }

    const totalUpcomingBills = subs.reduce((acc, s) => acc + (Number(s.amount) || 0), 0);

    // Planned savings heuristic (safe for missing dates/amounts)
    const today = dayjs();
    const plannedSavings = goals.reduce((acc, g) => {
      const target = Number(g?.targetAmount);
      const saved = Number(g?.savedAmount);
      const targetNum = isNaN(target) ? 0 : target;
      const savedNum = isNaN(saved) ? 0 : saved;
      const remaining = Math.max(0, targetNum - savedNum);
      const monthsDiff = dayjs(g?.targetDate || endOfMonth).diff(today, 'month');
      const monthsLeft = Math.max(1, isNaN(monthsDiff) ? 1 : monthsDiff);
      const monthly = remaining > 0 ? remaining / monthsLeft : 0;
      return acc + (isNaN(monthly) ? 0 : monthly);
    }, 0);

    // Safe-to-spend should reflect available cash: prefer account balance, otherwise fall back to net flows
    const flowNet = Math.max(0, incomeThisMonth - spentThisMonth);
    const base = totalBalance > 0 ? totalBalance : flowNet;
    let safeToSpend = base - totalUpcomingBills - plannedSavings;
    if (!isFinite(safeToSpend)) safeToSpend = 0;
    safeToSpend = Math.max(0, Math.round(safeToSpend));

    // Top spending category this month
    const byCat = new Map();
    for (const t of monthTx) {
      const amt = Number(t.amount) || 0;
      const typ = (t.type || '').toString().toLowerCase();
      const isExpense = typ === 'expense' || amt < 0;
      if (!isExpense) continue;
      const key = t.category ? t.category.name : 'Uncategorized';
      byCat.set(key, (byCat.get(key) || 0) + Math.abs(amt));
    }
    let topCategory = '—';
    let maxTotal = 0;
    for (const [name, total] of byCat.entries()) {
      if (total > maxTotal) {
        maxTotal = total;
        topCategory = name;
      }
    }

    res.render('dashboard', {
      title: 'Dashboard',
      cards: {
        totalBalance,
        incomeThisMonth,
        spentThisMonth,
        upcomingBills: subs.length,
        topCategory
      },
      recentTx,
      safeToSpend,
      goals,
      // Expose components for breakdown UI
      breakdown: {
        totalBalance,
        totalUpcomingBills,
        plannedSavings
      },
      nextPayDate: dayjs().endOf('month').format('MMM D')
    });
  } catch (e) {
    console.error(e);
    res
      .status(500)
      .render('dashboard', {
        title: 'Dashboard',
        error: 'Failed to load dashboard',
        cards: { totalBalance: 0, incomeThisMonth: 0, spentThisMonth: 0, upcomingBills: 0, topCategory: '—' },
        recentTx: [],
        safeToSpend: 0,
        goals: [],
        nextPayDate: ''
      });
  }
});

module.exports = router;
