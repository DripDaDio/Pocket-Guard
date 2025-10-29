const express = require('express');
const router = express.Router();

// Show form to create/link a new account (prototype)
router.get('/new', (req, res) => {
  if (!req.session || !req.session.userId) return res.redirect('/login');
  res.render('accounts/new', { title: 'Link a Bank Account', error: null });
});

// Handle creation of a mock account
router.post('/', async (req, res) => {
  const prisma = req.prisma;
  try {
    const userId = req.session?.userId;
    if (!userId) return res.redirect('/login');

    const { bankName, accountName, type, last4, currentBalance, generateTx } = req.body;
    const data = {
      userId,
      bankName: bankName?.trim() || 'Mock Bank',
      accountName: accountName?.trim() || 'My Account',
      type: ['CHECKING', 'SAVINGS', 'CREDIT'].includes(type) ? type : 'CHECKING',
      last4: (last4 || '').trim() || null,
      currentBalance: isNaN(Number(currentBalance)) ? 0 : Number(currentBalance)
    };
    const account = await prisma.account.create({ data });
    if (typeof generateTx !== 'undefined') {
      const dayjs = require('dayjs');
      const today = dayjs();
      const txs = [
        { description: 'Coffee Shop', amount: 6.5, type: 'EXPENSE' },
        { description: 'Groceries', amount: 42.3, type: 'EXPENSE' },
        { description: 'Salary', amount: 1200, type: 'INCOME' }
      ];
      await prisma.$transaction(
        txs.map((t, i) => prisma.transaction.create({
          data: {
            userId,
            accountId: account.id,
            date: today.subtract(7 - i * 2, 'day').toDate(),
            description: t.description,
            amount: t.amount,
            type: t.type
          }
        }))
      );
    }
    await prisma.user.update({ where: { id: userId }, data: { isAccountsLinked: true } });
    res.redirect('/profile');
  } catch (e) {
    console.error('Create account error:', e);
    res.status(500).render('accounts/new', { title: 'Link a Bank Account', error: 'Failed to create account' });
  }
});

module.exports = router;
// Delete an account (prototype)
router.post('/:id/delete', async (req, res) => {
  const prisma = req.prisma;
  try {
    const userId = req.session?.userId;
    if (!userId) return res.redirect('/login');
    const { id } = req.params;
    const acct = await prisma.account.findFirst({ where: { id, userId } });
    if (!acct) return res.redirect('/profile');
    await prisma.$transaction([
      prisma.transaction.deleteMany({ where: { userId, accountId: id } }),
      prisma.account.delete({ where: { id } })
    ]);
    const remaining = await prisma.account.count({ where: { userId } });
    if (remaining === 0) {
      await prisma.user.update({ where: { id: userId }, data: { isAccountsLinked: false } });
    }
    res.redirect('/profile');
  } catch (e) {
    console.error('Delete account error:', e);
    res.redirect('/profile');
  }
});
