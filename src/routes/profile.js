const express = require('express');
const router = express.Router();

router.get('/', async (req, res) => {
  const prisma = req.prisma;
  try {
    const sessionUserId = req.session?.userId;
    if (!sessionUserId) return res.redirect('/login');

    const [user, accounts] = await Promise.all([
      prisma.user.findUnique({ where: { id: sessionUserId } }),
      prisma.account.findMany({ where: { userId: sessionUserId } })
    ]);

    if (!user) {
      // Session exists but user not found (deleted?) – clear session and ask to login
      req.session.destroy(() => {
        res.redirect('/login');
      });
      return;
    }

  const success = req.query.success ? 'Preferences updated' : null;
  res.render('profile', { title: 'Profile & Settings', user, accounts, error: null, success });
  } catch (e) {
    console.error('Profile route error:', e);
    res.status(500).render('profile', { title: 'Profile & Settings', user: null, accounts: [], error: 'Failed to load profile' });
  }
});

// Simple alias for /settings -> /profile
router.get('/settings', (req, res) => res.redirect('/profile'));

// Save notification preferences
router.post('/preferences', async (req, res) => {
  const prisma = req.prisma;
  try {
    const sessionUserId = req.session?.userId;
    if (!sessionUserId) return res.redirect('/login');
    const data = {
      notifyOverspend: typeof req.body.notifyOverspend !== 'undefined',
      notifyBills: typeof req.body.notifyBills !== 'undefined',
      notifyWeekly: typeof req.body.notifyWeekly !== 'undefined',
      notifyGoals: typeof req.body.notifyGoals !== 'undefined'
    };
    await prisma.user.update({ where: { id: sessionUserId }, data });
    res.redirect('/profile?success=1');
  } catch (e) {
    console.error('Update preferences error:', e);
    res.redirect('/profile?error=1');
  }
});

module.exports = router;
