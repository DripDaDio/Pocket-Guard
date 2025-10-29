const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const dayjs = require('dayjs');
const prisma = new PrismaClient();

async function main() {
  const email = 'demo@pocketguard.test';
  const passwordHash = await bcrypt.hash('demo123', 10);

  // Clean existing demo
  await prisma.transaction.deleteMany({ where: { user: { email } } });
  await prisma.account.deleteMany({ where: { user: { email } } });
  await prisma.goal.deleteMany({ where: { user: { email } } });
  await prisma.subscription.deleteMany({ where: { user: { email } } });
  await prisma.budget.deleteMany({ where: { user: { email } } });
  await prisma.category.deleteMany({ where: { user: { email } } });
  await prisma.user.deleteMany({ where: { email } });

  const user = await prisma.user.create({ data: { email, passwordHash, name: 'Demo User', isAccountsLinked: true } });

  const cats = await prisma.$transaction([
    prisma.category.create({ data: { name: 'Groceries' } }),
    prisma.category.create({ data: { name: 'Dining Out' } }),
    prisma.category.create({ data: { name: 'Rent' } }),
    prisma.category.create({ data: { name: 'Utilities' } }),
    prisma.category.create({ data: { name: 'Entertainment' } }),
    prisma.category.create({ data: { name: 'Salary' } })
  ]);
  const mapCat = Object.fromEntries(cats.map(c => [c.name, c]));

  const checking = await prisma.account.create({ data: { userId: user.id, accountName: 'Everyday Checking', bankName: 'Mock Bank', currentBalance: 2500, type: 'CHECKING', last4: '1234' } });
  const credit = await prisma.account.create({ data: { userId: user.id, accountName: 'Rewards Card', bankName: 'Mock Bank', currentBalance: -350, type: 'CREDIT', last4: '5678' } });

  const start = dayjs().startOf('month');
  const txs = [
    { date: start.add(1, 'day'), description: 'ACME Corp Salary', amount: 3200, type: 'INCOME', categoryId: mapCat['Salary'].id, accountId: checking.id },
    { date: start.add(2, 'day'), description: 'Whole Foods', amount: 86.40, type: 'EXPENSE', categoryId: mapCat['Groceries'].id, accountId: checking.id },
    { date: start.add(3, 'day'), description: 'Coffee Shop', amount: 8.75, type: 'EXPENSE', categoryId: mapCat['Dining Out'].id, accountId: checking.id },
    { date: start.add(4, 'day'), description: 'Rent Payment', amount: 1200, type: 'EXPENSE', categoryId: mapCat['Rent'].id, accountId: checking.id, isRecurring: true },
    { date: start.add(5, 'day'), description: 'Streaming Service', amount: 15.99, type: 'EXPENSE', categoryId: mapCat['Entertainment'].id, accountId: credit.id, isRecurring: true },
    { date: start.add(8, 'day'), description: 'Electric Utility', amount: 62.10, type: 'EXPENSE', categoryId: mapCat['Utilities'].id, accountId: checking.id },
    { date: start.add(10, 'day'), description: 'Dinner Out', amount: 42.35, type: 'EXPENSE', categoryId: mapCat['Dining Out'].id, accountId: credit.id },
  ];
  await prisma.$transaction(txs.map(t => prisma.transaction.create({ data: { ...t, userId: user.id, date: t.date.toDate() } })));

  await prisma.$transaction([
    prisma.goal.create({ data: { userId: user.id, name: 'Emergency Fund', targetAmount: 1000, savedAmount: 300, targetDate: dayjs().add(4, 'month').toDate() } }),
    prisma.goal.create({ data: { userId: user.id, name: 'Paris Vacation', targetAmount: 2500, savedAmount: 1100, targetDate: dayjs().add(8, 'month').toDate() } }),
  ]);

  await prisma.$transaction([
    prisma.subscription.create({ data: { userId: user.id, name: 'Netflix', amount: 15.99, dueDate: dayjs().add(3, 'day').toDate(), frequency: 'monthly', status: 'ACTIVE' } }),
    prisma.subscription.create({ data: { userId: user.id, name: 'Gym', amount: 29.99, dueDate: dayjs().add(6, 'day').toDate(), frequency: 'monthly', status: 'ACTIVE' } }),
  ]);

  await prisma.$transaction([
    prisma.budget.create({ data: { userId: user.id, categoryId: mapCat['Groceries'].id, amount: 400 } }),
    prisma.budget.create({ data: { userId: user.id, categoryId: mapCat['Dining Out'].id, amount: 150 } }),
    prisma.budget.create({ data: { userId: user.id, categoryId: mapCat['Entertainment'].id, amount: 80 } }),
  ]);

  console.log('Seeded demo data. Login with:', email, 'password: demo123');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
