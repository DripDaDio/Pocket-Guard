const express = require('express');
const dayjs = require('dayjs');
const router = express.Router();

router.get('/', async (req, res) => {
  const prisma = req.prisma;
  const userId = req.session.userId;
  const startOfMonth = dayjs().startOf('month').toDate();
  const endOfMonth = dayjs().endOf('month').toDate();
  try {
    const [budgets, categories, transactions, subscriptions] = await Promise.all([
      prisma.budget.findMany({ where: { userId }, include: { category: true } }),
      prisma.category.findMany({ where: { OR: [{ userId }, { userId: null }] } }),
      prisma.transaction.findMany({ where: { userId, date: { gte: startOfMonth, lte: endOfMonth } }, include: { category: true } }),
      prisma.subscription.findMany({ where: { userId }, orderBy: { dueDate: 'asc' } })
    ]);

    const spendByCategory = {};
    for (const tx of transactions) {
      if (tx.type !== 'EXPENSE') continue;
      const key = tx.category?.id || 'uncategorized';
      spendByCategory[key] = (spendByCategory[key] || 0) + Number(tx.amount);
    }

    const items = budgets.map(b => {
      const spent = spendByCategory[b.categoryId] || 0;
      const remaining = Math.max(0, Number(b.amount) - spent);
      const utilization = Number(b.amount) ? Math.min(100, Math.round((spent / Number(b.amount)) * 100)) : 0;
      let ai = '';
      if (utilization > 90) ai = `You're on track to overspend on ${b.category.name}. Consider cutting back.`;
      else if (utilization > 70) ai = `Heads up: ${b.category.name} is trending high this month.`;
      return { budget: b, spent, remaining, utilization, ai };
    });

    const totalBudgeted = budgets.reduce((a, b) => a + Number(b.amount), 0);
    const totalSpent = Object.values(spendByCategory).reduce((a, v) => a + v, 0);

    res.render('budgeting', {
      title: 'Budgeting',
      period: dayjs().format('MMMM YYYY'),
      items,
      totalBudgeted,
      totalSpent,
      totalRemaining: Math.max(0, totalBudgeted - totalSpent),
      subscriptions
    });
  } catch (e) {
    console.error(e);
    res.status(500).render('budgeting', { title: 'Budgeting', error: 'Failed to load budgets', items: [], totalBudgeted: 0, totalSpent: 0, totalRemaining: 0, subscriptions: [] });
  }
});

module.exports = router;
