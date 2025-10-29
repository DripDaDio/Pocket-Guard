// Ensure env is loaded early and from the project root explicitly
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });
const _keyLen = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').length;
if (process.env.NODE_ENV !== 'production') {
  console.log(`.env loaded from ${path.join(__dirname, '.env')} (Gemini key len: ${_keyLen})`);
}
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const { PrismaClient } = require('@prisma/client');
const app = express();
const prisma = new PrismaClient();

// Config
const PORT = process.env.PORT || 8080;
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev_secret_change_me';

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Security & Middleware
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}
app.use(helmet({ contentSecurityPolicy: false }));

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 7,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production'
    }
  })
);
// Global rate limit (soft)
const globalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 1000 });
app.use(globalLimiter);
app.use(morgan('dev'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// INR formatter and helpers for all views
app.use((req, res, next) => {
  res.locals.inr = (n) => {
    try {
      return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(n || 0));
    } catch {
      return `₹ ${Number(n || 0).toFixed(2)}`;
    }
  };
  res.locals.path = req.path || '/';
  res.locals.currentUserId = req.session?.userId || null;
  next();
});

// Locals helper
app.use((req, res, next) => {
  res.locals.currentUser = null; // legacy template support
  next();
});

// Simple auth guard
function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) return res.redirect('/login');
  next();
}

// Routes
const authRoutes = require('./src/routes/auth');
const onboardingRoutes = require('./src/routes/onboarding');
const dashboardRoutes = require('./src/routes/dashboard');
const budgetingRoutes = require('./src/routes/budgeting');
const goalsRoutes = require('./src/routes/goals');
const profileRoutes = require('./src/routes/profile');
const apiRoutes = require('./src/routes/api');
const accountsRoutes = require('./src/routes/accounts');
const { Parser } = require('json2csv');
const { populate: populateDemo } = require('./src/utils/demoData');
const { hasKey: hasGeminiKey } = require('./src/utils/gemini');

app.use((req, res, next) => { req.prisma = prisma; next(); });

app.use('/', authRoutes); // /login, /register, /logout
app.use('/onboarding', requireAuth, onboardingRoutes);
app.use('/dashboard', requireAuth, dashboardRoutes);
app.use('/budgeting', requireAuth, budgetingRoutes);
app.use('/goals', requireAuth, goalsRoutes);
app.use('/profile', requireAuth, profileRoutes);
// Route-specific rate limits
const authLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 50, standardHeaders: true, legacyHeaders: false });
const apiLimiter = rateLimit({ windowMs: 1 * 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false });

app.use(['/login','/register'], authLimiter);
app.use('/api', apiLimiter, requireAuth, apiRoutes);
app.use('/accounts', requireAuth, accountsRoutes);

// Settings alias
app.get('/settings', requireAuth, (req, res) => res.redirect('/profile'));

// (Removed dev populate route per request)

// Export transactions as CSV
app.get('/export/transactions.csv', requireAuth, async (req, res, next) => {
  try {
    const tx = await prisma.transaction.findMany({ where: { userId: req.session.userId }, include: { category: true, account: true } });
    const rows = tx.map(t => ({
      date: t.date.toISOString().slice(0,10),
      description: t.description,
      amount: Number(t.amount),
      type: t.type,
      category: t.category ? t.category.name : '',
      account: t.account ? t.account.accountName : ''
    }));
    const parser = new Parser({ fields: ['date','description','amount','type','category','account'] });
    const csv = parser.parse(rows);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="transactions.csv"');
    res.send(csv);
  } catch (e) {
    next(e);
  }
});

// Simple buddy route
app.get('/buddy', requireAuth, (req, res) => {
  const gemActive = hasGeminiKey();
  res.render('buddy', { title: 'Your Finance Buddy', geminiActive: gemActive });
});

// Welcome page
app.get('/', (req, res) => {
  if (req.session && req.session.userId) return res.redirect('/dashboard');
  res.render('welcome', { title: 'Pocket Guard' });
});

// Errors
app.use((req, res) => {
  res.status(404).render('errors/404', { title: 'Page Not Found' });
});

app.use((err, req, res, next) => {
  console.error(err);
  const isDev = process.env.NODE_ENV !== 'production';
  res.status(500).render('errors/500', { title: 'Server Error', error: isDev ? err : null });
});

// Start server with EADDRINUSE resilience (handy in dev)
function start(port, attemptsLeft = 7) {
  const server = app.listen(port);
  server.on('listening', () => {
    const addr = server.address();
    const actualPort = typeof addr === 'string' ? port : addr.port;
    console.log(`Pocket Guard listening on http://localhost:${actualPort}`);
    console.log('Demo login: demo@pocketguard.test / demo123');
  });
  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE' && attemptsLeft > 0) {
      const nextPort = Number(port) + 1;
      console.warn(`Port ${port} in use. Trying ${nextPort}...`);
      setTimeout(() => start(nextPort, attemptsLeft - 1), 250);
    } else if (err && err.code === 'EADDRINUSE') {
      console.warn(`Ports around ${port} are busy. Falling back to a random free port...`);
      const fallback = app.listen(0, () => {
        const addr = fallback.address();
        const actualPort = typeof addr === 'string' ? port : addr.port;
        console.log(`Pocket Guard listening on http://localhost:${actualPort}`);
        console.log('Demo login: demo@pocketguard.test / demo123');
      });
      fallback.on('error', (e) => {
        console.error('Failed to start server:', e);
        process.exit(1);
      });
    } else {
      console.error('Failed to start server:', err);
      process.exit(1);
    }
  });
}

// Auto-populate demo data on startup in development, quietly
async function bootstrap() {
  try {
    if (process.env.NODE_ENV !== 'production') {
      // In dev, avoid resetting on every restart to prevent FK races; seed if missing
      const demoReset = String(process.env.DEMO_RESET || '').toLowerCase() === 'true';
      await populateDemo(prisma, { months: 3, perMonth: 25, reset: demoReset });
      console.log('Demo data populated.');
    }
  } catch (e) {
    console.warn('Demo data population skipped:', e.message);
  } finally {
    try {
      console.log(`AI Buddy: Gemini ${hasGeminiKey() ? 'ON' : 'OFF (using canned replies)'}`);
      const _k = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').length;
      const _m = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
      console.log(`Gemini key loaded: ${_k > 0 ? 'yes' : 'no'}, model: ${_m}`);
    } catch {}
  }
}

bootstrap().finally(() => start(PORT));
