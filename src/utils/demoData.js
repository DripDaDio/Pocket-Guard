const bcrypt = require('bcrypt');
const dayjs = require('dayjs');

const DEMO_EMAIL = 'demo@pocketguard.test';

async function ensureDemoUser(prisma) {
  let user = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (!user) {
    const hash = await bcrypt.hash('demo123', 10);
    user = await prisma.user.create({ data: { email: DEMO_EMAIL, name: 'Demo User', passwordHash: hash, isAccountsLinked: true } });
  }
  return user;
}

async function ensureAccounts(prisma, userId) {
  const existing = await prisma.account.findMany({ where: { userId } });
  let checking = existing.find(a => a.accountName === 'Everyday Checking');
  let credit = existing.find(a => a.accountName === 'Rewards Card');
  if (!checking) {
    checking = await prisma.account.create({ data: { userId, accountName: 'Everyday Checking', bankName: 'Mock Bank', currentBalance: 2500, type: 'CHECKING', last4: '1234' } });
  }
  if (!credit) {
    credit = await prisma.account.create({ data: { userId, accountName: 'Rewards Card', bankName: 'Mock Bank', currentBalance: -350, type: 'CREDIT', last4: '5678' } });
  }
  return { checking, credit };
}

async function ensureCategories(prisma) {
  const names = ['Groceries','Dining Out','Rent','Utilities','Entertainment','Transport','Shopping','Health','Salary','Bonus'];
  const found = await prisma.category.findMany({ where: { name: { in: names } } });
  const have = new Set(found.map(c => c.name));
  const toCreate = names.filter(n => !have.has(n));
  const created = await Promise.all(toCreate.map(name => prisma.category.create({ data: { name } })));
  const all = [...found, ...created];
  const map = Object.fromEntries(all.map(c => [c.name, c]));
  return map;
}

function pick(arr) { return arr[Math.floor(Math.random()*arr.length)]; }
function rand(min, max) { return Math.floor(Math.random()*(max-min+1))+min; }

async function addRandomTransactions(prisma, userId, accounts, categories, opts={}) {
  // If transactions already exist for this user, skip seeding to avoid duplicates
  const existingCount = await prisma.transaction.count({ where: { userId } });
  if (existingCount > 0) return 0;
  const months = Number(opts.months || 3);
  const perMonth = Number(opts.perMonth || 25);
  const merchants = {
    Groceries: ['Whole Foods','Reliance Fresh','Food Bazaar','FreshMart'],
    'Dining Out': ['Burger House','Cafe Latte','Pizza Hub','Sushi Go','Taco Villa'],
    Utilities: ['Electric Utility','Water Board','Gas Service','Broadband ISP'],
    Entertainment: ['Cinema City','Streaming Service','Concert Tickets'],
    Transport: ['Metro Card','Fuel Station','RideShare'],
    Shopping: ['MegaMart','Online Store','Clothes Co'],
    Health: ['Pharmacy','Clinic'],
  };

  const incomeSources = ['ACME Corp Salary','Freelance','Bonus'];

  const tx = [];
  for (let m=0; m<months; m++) {
    const start = dayjs().subtract(m, 'month').startOf('month');
    // one salary income per month
    tx.push({
      date: start.add(rand(0,2),'day').toDate(),
      description: pick(incomeSources),
      amount: rand(2500,4000),
      type: 'INCOME',
      categoryId: categories['Salary']?.id,
      accountId: accounts.checking.id,
    });
    // random expenses
    for (let i=0; i<perMonth; i++) {
      const cat = pick(['Groceries','Dining Out','Utilities','Entertainment','Transport','Shopping','Health']);
      const desc = pick(merchants[cat] || ['Expense']);
      const amt = {
        Groceries: rand(20,120),
        'Dining Out': rand(6,60),
        Utilities: rand(20,150),
        Entertainment: rand(8,80),
        Transport: rand(8,70),
        Shopping: rand(15,200),
        Health: rand(5,90),
      }[cat] || rand(10,100);
      const accountId = Math.random() < 0.3 ? accounts.credit.id : accounts.checking.id;
      tx.push({
        date: start.add(rand(0,27), 'day').toDate(),
        description: desc,
        amount: Number(amt),
        type: 'EXPENSE',
        categoryId: categories[cat]?.id,
        accountId,
      });
    }
  }
  await prisma.$transaction(tx.map(t => prisma.transaction.create({ data: { ...t, userId } })));
  return tx.length;
}

async function addRandomBudgets(prisma, userId, categories) {
  const budgetCats = ['Groceries','Dining Out','Entertainment','Transport','Shopping','Health'];
  let count = 0;
  for (const name of budgetCats) {
    if (!categories[name]) continue;
    const amount = { Groceries: 400, 'Dining Out': 180, Entertainment: 120, Transport: 160, Shopping: 250, Health: 120 }[name] || 150;
    const categoryId = categories[name].id;
    const existing = await prisma.budget.findFirst({ where: { userId, categoryId } });
    if (existing) {
      await prisma.budget.update({ where: { id: existing.id }, data: { amount } });
    } else {
      await prisma.budget.create({ data: { userId, categoryId, amount } });
    }
    count++;
  }
  return count;
}

async function addRandomSubscriptions(prisma, userId) {
  const subs = [
    { name: 'Netflix', amount: 15.99 },
    { name: 'Spotify', amount: 9.99 },
    { name: 'Gym', amount: 29.99 },
    { name: 'Cloud Storage', amount: 2.99 },
  ];
  let count = 0;
  for (let i = 0; i < subs.length; i++) {
    const s = subs[i];
    const existing = await prisma.subscription.findFirst({ where: { userId, name: s.name } });
    if (existing) {
      await prisma.subscription.update({ where: { id: existing.id }, data: { amount: s.amount } });
    } else {
      await prisma.subscription.create({ data: { userId, name: s.name, amount: s.amount, dueDate: dayjs().add(i+2, 'day').toDate(), frequency: 'monthly', status: 'ACTIVE' } });
    }
    count++;
  }
  return count;
}

async function addRandomGoals(prisma, userId) {
  const goals = [
    { name: 'Emergency Fund', targetAmount: 1000, savedAmount: rand(100,600) },
    { name: 'New Laptop', targetAmount: 1200, savedAmount: rand(200,800) },
    { name: 'Trip to Goa', targetAmount: 800, savedAmount: rand(150,500) },
  ];
  let count = 0;
  for (let i = 0; i < goals.length; i++) {
    const g = goals[i];
    const existing = await prisma.goal.findFirst({ where: { userId, name: g.name } });
    if (existing) {
      await prisma.goal.update({ where: { id: existing.id }, data: { targetAmount: g.targetAmount, savedAmount: g.savedAmount } });
    } else {
      await prisma.goal.create({ data: { userId, name: g.name, targetAmount: g.targetAmount, savedAmount: g.savedAmount, targetDate: dayjs().add((i+1)*2, 'month').toDate() } });
    }
    count++;
  }
  return count;
}

async function resetDemoData(prisma, userId) {
  // Delete in safe FK order, ensuring account-linked transactions are purged before accounts
  const accounts = await prisma.account.findMany({ where: { userId }, select: { id: true } });
  const accountIds = accounts.map(a => a.id);
  if (accountIds.length) {
    await prisma.transaction.deleteMany({ where: { accountId: { in: accountIds } } });
  }
  await prisma.transaction.deleteMany({ where: { userId } });
  await prisma.subscription.deleteMany({ where: { userId } });
  await prisma.budget.deleteMany({ where: { userId } });
  await prisma.goal.deleteMany({ where: { userId } });
  await prisma.account.deleteMany({ where: { userId } });
}

async function populate(prisma, { reset=false, months=3, perMonth=25 } = {}) {
  const user = await ensureDemoUser(prisma);
  if (reset) await resetDemoData(prisma, user.id);
  const accounts = await ensureAccounts(prisma, user.id);
  const categories = await ensureCategories(prisma);
  const txCount = await addRandomTransactions(prisma, user.id, accounts, categories, { months, perMonth });
  const budgetCount = await addRandomBudgets(prisma, user.id, categories);
  const subCount = await addRandomSubscriptions(prisma, user.id);
  const goalCount = await addRandomGoals(prisma, user.id);
  return { userId: user.id, txCount, budgetCount, subCount, goalCount };
}

module.exports = { DEMO_EMAIL, ensureDemoUser, populate };
