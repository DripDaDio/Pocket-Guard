const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// In-memory reset token store: token -> { userId, expiresAt }
const crypto = require('crypto');
const resetTokens = new Map();

router.get('/login', (req, res) => {
  if (req.session && req.session.userId) return res.redirect('/dashboard');
  const success = req.query.success ? 'Password reset successful. Please log in.' : null;
  res.render('auth', { mode: 'login', title: 'Login', success });
});

router.get('/register', (req, res) => {
  if (req.session && req.session.userId) return res.redirect('/dashboard');
  res.render('auth', { mode: 'register', title: 'Register' });
});

router.post('/register', async (req, res, next) => {
  try {
    const name = (req.body.name || '').trim();
    const emailRaw = req.body.email || '';
    const email = emailRaw.trim().toLowerCase();
    const password = req.body.password || '';
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.render('auth', { mode: 'register', error: 'Email already registered' });
    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name, email, passwordHash: hash, isAccountsLinked: false }
    });
    req.session.userId = user.id;
    res.redirect('/onboarding/link-accounts');
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    let user = await prisma.user.findUnique({ where: { email } });

    // Auto-provision demo account if seed hasn't been run
    if (!user && email === 'demo@pocketguard.test') {
      try {
        const hash = await bcrypt.hash('demo123', 10);
        user = await prisma.user.create({
          data: { email, name: 'Demo User', passwordHash: hash, isAccountsLinked: false }
        });
      } catch (e) {
        // ignore if race condition or constraint, we'll re-fetch
        user = await prisma.user.findUnique({ where: { email } });
      }
    }

    if (!user) return res.render('auth', { mode: 'login', error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.passwordHash || user.password || '');
    if (!ok) return res.render('auth', { mode: 'login', error: 'Invalid credentials' });
    // Normalize session shape
    req.session.userId = user.id;
    res.redirect('/dashboard');
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// Forgot password
router.get('/forgot', (req, res) => {
  if (req.session && req.session.userId) return res.redirect('/dashboard');
  res.render('forgot', { title: 'Forgot Password', sent: null, error: null });
});

router.post('/forgot', async (req, res) => {
  const prisma = req.prisma;
  const { email } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.render('forgot', { title: 'Forgot Password', sent: null, error: 'No account found with that email.' });
    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = Date.now() + 1000 * 60 * 30; // 30 minutes
    resetTokens.set(token, { userId: user.id, expiresAt });
    // In a real app send by email. For dev, display the link.
    const link = `/reset/${token}`;
    res.render('forgot', { title: 'Forgot Password', sent: link, error: null });
  } catch (e) {
    console.error(e);
    res.status(500).render('forgot', { title: 'Forgot Password', sent: null, error: 'Failed to process request' });
  }
});

router.get('/reset/:token', (req, res) => {
  const { token } = req.params;
  const info = resetTokens.get(token);
  if (!info || info.expiresAt < Date.now()) {
    resetTokens.delete(token);
    return res.status(400).render('errors/500', { title: 'Server Error', error: new Error('Reset link invalid or expired') });
  }
  res.render('reset', { title: 'Reset Password', token, error: null });
});

router.post('/reset/:token', async (req, res) => {
  const prisma = req.prisma;
  const { token } = req.params;
  const { password } = req.body;
  const info = resetTokens.get(token);
  if (!info || info.expiresAt < Date.now()) {
    resetTokens.delete(token);
    return res.status(400).render('errors/500', { title: 'Server Error', error: new Error('Reset link invalid or expired') });
  }
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.update({ where: { id: info.userId }, data: { passwordHash } });
    resetTokens.delete(token);
    res.redirect('/login?success=1');
  } catch (e) {
    console.error(e);
    res.status(500).render('reset', { title: 'Reset Password', token, error: 'Failed to reset password' });
  }
});

module.exports = router;
