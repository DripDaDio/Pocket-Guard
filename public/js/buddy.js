document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-text');
  const log = document.getElementById('chat-log');
  const resetBtn = document.getElementById('buddy-reset');

  function addBubble(text, isAi) {
    const div = document.createElement('div');
    div.className = `bubble ${isAi ? 'ai' : 'me'}`;
    div.textContent = text;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  function clearChat() {
    if (log) log.innerHTML = '';
  }

  async function loadHistory() {
    try {
      const controller = new AbortController();
      const tm = setTimeout(() => controller.abort(), 10000);
      const res = await fetch('/api/buddy/history', { method: 'GET', signal: controller.signal });
      clearTimeout(tm);
      const data = await res.json();
      if (data && Array.isArray(data.history) && data.history.length) {
        // Render in order
        for (const h of data.history) {
          const role = (h && typeof h.role === 'string') ? h.role.toLowerCase() : 'user';
          const text = (h && typeof h.text === 'string') ? h.text : '';
          addBubble(text, role === 'assistant');
        }
      }
    } catch (e) {
      // Silently ignore history load errors to avoid blocking UI
    }
  }

  // Load any existing chat history on page open
  loadHistory();

  if (form) form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = (input.value || '').trim();
    if (!msg) return;
    addBubble(msg, false);
    input.value = '';
    const loading = document.createElement('span');
    loading.className = 'spinner';
    form.appendChild(loading);
    try {
      const typing = document.querySelector('.buddy .typing');
      if (typing) typing.hidden = false;
  const controller = new AbortController();
  const tm = setTimeout(() => controller.abort(), 18000);
  const res = await fetch('/api/buddy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: msg }), signal: controller.signal });
  clearTimeout(tm);
  const data = await res.json();
      addBubble(data.reply || '…', true);
    } catch (e) {
  addBubble('Sorry, I couldn’t respond right now. Please try again in a moment.', true);
    } finally { loading.remove(); const typing = document.querySelector('.buddy .typing'); if (typing) typing.hidden = true; }
  });

  if (resetBtn) resetBtn.addEventListener('click', async () => {
    try {
      resetBtn.disabled = true;
      const controller = new AbortController();
      const tm = setTimeout(() => controller.abort(), 8000);
      await fetch('/api/buddy/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal });
      clearTimeout(tm);
      clearChat();
    } catch (e) {
      // No-op
    } finally {
      resetBtn.disabled = false;
    }
  });
});
