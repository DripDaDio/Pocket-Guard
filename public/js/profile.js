document.addEventListener('DOMContentLoaded', () => {
  // safer confirms for destructive actions
  document.querySelectorAll('.profile form[onsubmit*="Delete"], .profile .btn-ghost').forEach(el => {
    el.addEventListener('click', (e) => {
      const target = e.currentTarget;
      if (target.tagName === 'FORM') return; // forms handle their own onsubmit
      if (!confirm('Are you sure?')) e.preventDefault();
    });
  });

  // flash a toast when preferences are saved (server would redirect with success)
  const params = new URLSearchParams(window.location.search);
  if (params.get('saved') === '1') {
    window.toast && window.toast.success('Preferences saved');
  }
});
