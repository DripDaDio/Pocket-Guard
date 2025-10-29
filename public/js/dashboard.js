document.addEventListener('DOMContentLoaded', () => {
  // New circular gauge animation
  const circle = document.querySelector('.gauge-circle .meter .fg');
  const container = document.querySelector('.gauge-circle');
  const valueEl = document.getElementById('safeValue');
  if (circle && container && valueEl) {
    const dashArray = Number(circle.getAttribute('stroke-dasharray')) || 264;
    const safeVal = Number(container.getAttribute('data-value') || '0');
    const monthlySpendHint = Number(container.getAttribute('data-monthly-spend') || '0');
    const maxHint = monthlySpendHint > 0 ? monthlySpendHint * 1.2 : Math.max(10000, Math.abs(safeVal) * 1.5);
    const pct = Math.max(0, Math.min(1, safeVal / (maxHint || 1)));
    const targetOffset = dashArray * (1 - pct);

    // Animate ring
    requestAnimationFrame(() => {
      circle.style.strokeDashoffset = String(targetOffset);
    });

    // Animate value count-up with INR formatting
    const formatter = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
    const duration = 1000;
    const start = performance.now();
    const startVal = 0;
    function step(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const cur = Math.round(startVal + (safeVal - startVal) * eased);
      valueEl.textContent = formatter.format(cur);
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
});
