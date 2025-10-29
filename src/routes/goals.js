const express = require('express');
const router = express.Router();

router.get('/', async (req, res) => {
  const prisma = req.prisma;
  try {
    const goals = await prisma.goal.findMany({ where: { userId: req.session.userId } });
    res.render('goals', { title: 'Goals', goals });
  } catch (e) {
    console.error(e);
    res.status(500).render('goals', { title: 'Goals', goals: [], error: 'Failed to load goals' });
  }
});

router.post('/create', async (req, res) => {
  const prisma = req.prisma;
  const { name, targetAmount, targetDate } = req.body;
  try {
    await prisma.goal.create({ data: { userId: req.session.userId, name, targetAmount: Number(targetAmount), targetDate: targetDate ? new Date(targetDate) : null } });
    res.redirect('/goals');
  } catch (e) {
    console.error(e);
    res.status(500).redirect('/goals');
  }
});

router.post('/:id/add-funds', async (req, res) => {
  const prisma = req.prisma;
  const { id } = req.params;
  const { amount } = req.body;
  try {
    const goal = await prisma.goal.update({ where: { id }, data: { savedAmount: { increment: Number(amount) } } });
    const progress = Math.min(100, Math.round((Number(goal.savedAmount) / Number(goal.targetAmount)) * 100));
    res.json({ ok: true, goal: { id: goal.id, savedAmount: Number(goal.savedAmount), targetAmount: Number(goal.targetAmount), progress } });
  } catch (e) {
    console.error(e);
    res.status(400).json({ ok: false, error: 'Failed to add funds' });
  }
});

module.exports = router;
