document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('goals-form');
  const list = document.getElementById('goal-items');
  const addBtn = document.getElementById('add-goal');
  const hidden = document.getElementById('goals-json');

  function addGoalRow(data = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'goal-row';
    wrap.innerHTML = `
      <input placeholder="Goal name" class="name" value="${data.name || ''}">
      <input type="number" step="0.01" class="amount" placeholder="Target amount" value="${data.targetAmount || ''}">
      <input type="date" class="date" value="${data.targetDate || ''}">
      <button type="button" class="btn btn-ghost remove">Remove</button>
    `;
    wrap.querySelector('.remove').addEventListener('click', () => wrap.remove());
    list.appendChild(wrap);
  }

  if (addBtn) addBtn.addEventListener('click', () => addGoalRow());
  if (form) form.addEventListener('submit', (e) => {
    const rows = Array.from(list.querySelectorAll('.goal-row')).map(row => ({
      name: row.querySelector('.name').value,
      targetAmount: Number(row.querySelector('.amount').value || 0),
      targetDate: row.querySelector('.date').value
    })).filter(g => g.name && g.targetAmount > 0);
    hidden.value = JSON.stringify(rows);
  });

  // Seed with a couple of examples
  if (list && list.children.length === 0) {
    addGoalRow({ name: 'Emergency Fund', targetAmount: 1000 });
    addGoalRow({ name: 'Vacation', targetAmount: 2000 });
  }
});
