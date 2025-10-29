const express = require('express');
const router = express.Router();

router.get('/link-accounts', async (req, res) => {
  res.render('onboarding/link-accounts', { title: 'Link Accounts' });
});

router.post('/link-accounts', async (req, res) => {
  const prisma = req.prisma;
  try {
    await prisma.user.update({ where: { id: req.session.userId }, data: { isAccountsLinked: true } });
    res.redirect('/onboarding/set-goals');
  } catch (e) {
    console.error(e);
    res.status(500).render('onboarding/link-accounts', { title: 'Link Accounts', error: 'Failed to link accounts' });
  }
});

router.get('/set-goals', (req, res) => {
  res.render('onboarding/set-goals', { title: 'Set Goals' });
});

router.post('/set-goals', async (req, res) => {
  const prisma = req.prisma;
  const { goals } = req.body; // Expect JSON string or array of { name, targetAmount, targetDate }
  try {
    let goalList = [];
    if (typeof goals === 'string') {
      try { goalList = JSON.parse(goals); } catch { goalList = []; }
    } else if (Array.isArray(goals)) {
      goalList = goals;
    }
    for (const g of goalList) {
      if (!g.name || !g.targetAmount) continue;
      await prisma.goal.create({ data: {
        userId: req.session.userId,
        name: g.name,
        targetAmount: g.targetAmount,
        targetDate: g.targetDate ? new Date(g.targetDate) : null
      }});
    }
    res.redirect('/dashboard');
  } catch (e) {
    console.error(e);
    res.status(500).render('onboarding/set-goals', { title: 'Set Goals', error: 'Failed to save goals' });
  }
});

module.exports = router;
