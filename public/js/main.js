document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-width]').forEach(el => {
    const w = Number(el.getAttribute('data-width')) || 0;
    el.style.width = `${w}%`;
  });

  // Button ripple effect
  document.body.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn, button');
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    const size = Math.max(rect.width, rect.height);
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
    btn.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
  });

  // Scroll reveal (robust + earlier trigger + stagger support)
  (function setupReveals() {
    const items = Array.from(document.querySelectorAll('.reveal'));
    if (!items.length) return;

    const markVisible = (el) => {
      if (el.classList.contains('reveal-visible')) return;
      el.classList.add('reveal-visible');
      // Stagger children if container opts-in
      if (el.hasAttribute('data-stagger')) {
        const children = el.querySelectorAll(':scope > *');
        children.forEach((child, i) => {
          child.style.transitionDelay = `${Math.min(i * 60, 480)}ms`;
          child.classList.add('reveal');
          // ensure child transitions apply
          requestAnimationFrame(() => child.classList.add('reveal-visible'));
        });
      }
    };

    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            markVisible(en.target);
            io.unobserve(en.target);
          }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
      items.forEach((el) => io.observe(el));
    } else {
      // Fallback: simple on-scroll check
      const check = () => {
        const vh = window.innerHeight || document.documentElement.clientHeight;
        items.forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.top < vh * 0.9 && r.bottom > 0) markVisible(el);
        });
      };
      window.addEventListener('scroll', check, { passive: true });
      window.addEventListener('resize', check);
      check();
    }
  })();

  // Hero -> Overview bridge activation
  (function heroOverviewBridge(){
    const welcome = document.querySelector('.welcome');
    const hero = document.querySelector('.welcome .hero');
    const overview = document.querySelector('#overview');
    if (!welcome || !hero || !overview) return;
    const activate = (on) => welcome.classList.toggle('bridge-active', !!on);
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries)=>{
        entries.forEach(en=>{
          // When overview is approaching, light the ribbon
          if (en.isIntersecting || en.boundingClientRect.top < (window.innerHeight*0.75)) activate(true);
          if (en.boundingClientRect.top > window.innerHeight) activate(false);
        });
      },{rootMargin:'-10% 0px -70% 0px', threshold:[0,0.1]});
      io.observe(overview);
    } else {
      const check = () => {
        const r = overview.getBoundingClientRect();
        activate(r.top < window.innerHeight*0.75);
      };
      window.addEventListener('scroll', check, {passive:true});
      window.addEventListener('resize', check);
      check();
    }
  })();

  // Smooth “wipe” when clicking Overview anchors
  (function anchorWipe(){
    const links = Array.from(document.querySelectorAll('a[href^="#overview"]'));
    if (!links.length) return;
    const makeWipe = () => {
      let el = document.querySelector('.scroll-wipe');
      if (!el) {
        el = document.createElement('div');
        el.className = 'scroll-wipe';
        document.body.appendChild(el);
      }
      return el;
    };
    const smoothScrollTo = (el, {duration=900}={}) => {
      const start = window.pageYOffset;
      const targetTop = el.getBoundingClientRect().top + start;
      const startTime = performance.now();
      const easeInOut = (t) => t<.5 ? 2*t*t : -1+(4-2*t)*t; // easeInOutQuad
      const step = (now) => {
        const p = Math.min((now - startTime)/duration, 1);
        const y = start + (targetTop - start) * easeInOut(p);
        window.scrollTo(0, y);
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };

    const startWipeAndScroll = (e, target) => {
      const wipe = makeWipe();
      wipe.classList.add('in');
      setTimeout(()=>{
        smoothScrollTo(target, {duration: 1100});
        setTimeout(()=> wipe.classList.remove('in'), 620);
      }, 80);
    };

    links.forEach(a=>{
      a.addEventListener('click', (e)=>{
        // Allow middle/command click to open new tab without effect
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        const target = document.querySelector('#overview');
        if (!target) return;
        startWipeAndScroll(e, target);
      });
    });
    // Bind scroll cue button
    document.querySelectorAll('[data-scroll-to]')
      .forEach(btn => btn.addEventListener('click', (e) => {
        const sel = btn.getAttribute('data-scroll-to');
        const target = document.querySelector(sel);
        if (!target) return;
        e.preventDefault();
        startWipeAndScroll(e, target);
      }));
  })();

  // Gauge mood classes based on value vs spend
  const gauge = document.querySelector('.gauge-circle');
  if (gauge) {
    const value = Number(gauge.getAttribute('data-value') || '0');
    const spend = Number(gauge.getAttribute('data-monthly-spend') || '0');
    let mood = 'good';
    const ratio = spend > 0 ? value / (spend * 1.2) : (value > 0 ? 1 : 0);
    if (ratio < 0.3) mood = 'warn';
    else if (ratio < 0.7) mood = 'neutral';
    gauge.classList.add(mood);
    if (value > 0) gauge.classList.add('pulse');
  }

  // Bottom nav animated indicator
  const nav = document.querySelector('.pg-bottom-nav');
  if (nav) {
    const setIndicator = () => {
      const active = nav.querySelector('.nav-item.active') || nav.querySelector('.nav-item');
      if (!active) return;
      const rect = active.getBoundingClientRect();
      const parentRect = nav.getBoundingClientRect();
      nav.style.setProperty('--nav-x', `${rect.left - parentRect.left}px`);
      nav.style.setProperty('--nav-w', `${rect.width}px`);
    };
    setIndicator();
    window.addEventListener('resize', setIndicator);
  }

  // Toast notifications helper
  const toastContainer = document.querySelector('.toast-container');
  function showToast(message, type = 'info', options = {}) {
    if (!toastContainer) return;
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.setAttribute('role', 'status');
    t.innerHTML = `
      <div class="icon"><span class="material-icons-round">${type === 'error' ? 'error' : type === 'success' ? 'check_circle' : 'info'}</span></div>
      <div class="content">${message}</div>
      <button class="close" aria-label="Close"><span class="material-icons-round">close</span></button>
    `;
    toastContainer.appendChild(t);
    const remove = () => t.remove();
    t.querySelector('.close')?.addEventListener('click', remove);
    const timeout = options.timeout ?? 4000;
    if (timeout > 0) setTimeout(remove, timeout);
    return t;
  }
  window.toast = { show: showToast };

  // Parse ?toast= message from query for lightweight flash
  try {
    const params = new URLSearchParams(location.search);
    const msg = params.get('toast');
    const type = params.get('type') || 'info';
    if (msg) showToast(decodeURIComponent(msg), type);
  } catch {}

  // Remove skeletons post paint (if any were server-rendered)
  document.querySelectorAll('.skeleton').forEach(el => el.classList.remove('skeleton'));

  // Password visibility toggles: any input[type=password] with data-toggle="password"
  document.querySelectorAll('input[type="password"][data-toggle="password"]').forEach((input) => {
    const label = input.closest('label.float') || input.parentElement;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pw-toggle';
    btn.setAttribute('aria-label', 'Toggle password visibility');
    btn.innerHTML = '<span class="material-icons-round">visibility</span>';
    (label || input).appendChild(btn);
    btn.addEventListener('click', () => {
      const isPw = input.type === 'password';
      input.type = isPw ? 'text' : 'password';
      btn.innerHTML = `<span class="material-icons-round">${isPw ? 'visibility_off' : 'visibility'}</span>`;
      input.focus();
    });
  });

  // Subtle parallax on .parallax-hover
  document.querySelectorAll('.parallax-hover').forEach((el) => {
    let raf = 0;
    el.addEventListener('mousemove', (e) => {
      const r = el.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width - 0.5) * 6;
      const y = ((e.clientY - r.top) / r.height - 0.5) * 6;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      });
    });
    el.addEventListener('mouseleave', () => {
      el.style.transform = 'translate3d(0,0,0)';
    });
  });

  // Lightweight accordion toggles on Welcome
  document.querySelectorAll('.welcome .accordion .acc-item').forEach((item) => {
    const btn = item.querySelector('.acc-btn');
    const panel = item.querySelector('.acc-panel');
    if (!btn || !panel) return;
    const setHeight = (open) => {
      if (open) {
        panel.style.height = 'auto';
        const h = panel.clientHeight;
        panel.style.height = '0px';
        // ensure transition
        requestAnimationFrame(() => {
          panel.style.height = h + 'px';
        });
      } else {
        panel.style.height = panel.clientHeight + 'px';
        requestAnimationFrame(() => {
          panel.style.height = '0px';
        });
      }
    };
    btn.addEventListener('click', () => {
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      const willOpen = !expanded;
      btn.setAttribute('aria-expanded', String(willOpen));
      setHeight(willOpen);
    });
    panel.addEventListener('transitionend', () => {
      if (btn.getAttribute('aria-expanded') === 'true') {
        panel.style.height = 'auto';
      }
    });
  });
});
