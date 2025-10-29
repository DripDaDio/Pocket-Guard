document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.cat .fill').forEach(el => {
    const w = Number(el.getAttribute('data-width')) || 0;
    el.style.width = `${w}%`;
  });
});
