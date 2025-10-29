document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.goal .add-funds').forEach(form => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const goal = form.closest('.goal');
      const id = goal.dataset.id;
      const amount = Number(form.querySelector('input[name="amount"]').value || 0);
      if (!amount) return;
      const loading = document.createElement('span');
      loading.className = 'spinner';
      form.appendChild(loading);
      const res = await fetch(`/goals/${id}/add-funds`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount })
      });
      const data = await res.json();
      if (data.ok) {
        const percent = data.goal.progress;
        goal.querySelector('.fill').style.width = `${percent}%`;
        const fmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
        const stats = goal.querySelector('.stats');
        stats.textContent = `${percent}% • ${fmt.format(data.goal.savedAmount)} / ${fmt.format(data.goal.targetAmount)}`;
        // success flash
        stats.style.transition = 'background .2s ease';
        stats.style.background = 'rgba(76,175,80,.12)';
        setTimeout(() => { stats.style.background = 'transparent'; }, 400);
        form.reset();
      }
      loading.remove();
    });
  });
});
