/* ClearScope Counsel — minimal, dependency-free behavior.
   Everything degrades gracefully: with JS off, the site is fully usable. */
(function () {
  'use strict';
  var root = document.documentElement;

  /* ---- Theme toggle (persists; respects OS default) ---- */
  var toggle = document.querySelector('[data-theme-toggle]');
  var icon = document.querySelector('[data-theme-icon]');
  function applyTheme(theme) {
    root.setAttribute('data-theme', theme);
    if (icon) icon.textContent = theme === 'dark' ? '☀' : '☾';
    if (toggle) {
      toggle.setAttribute('aria-pressed', String(theme === 'dark'));
      toggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    }
  }
  var savedTheme = null;
  try { savedTheme = localStorage.getItem('cs-theme'); } catch (e) {}
  applyTheme(savedTheme || root.getAttribute('data-theme') || 'light');
  if (toggle) {
    toggle.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('cs-theme', next); } catch (e) {}
      applyTheme(next);
    });
  }

  /* ---- Mobile menu ---- */
  var header = document.querySelector('.site-header');
  var menuBtn = document.querySelector('[data-menu-toggle]');
  if (header && menuBtn) {
    function setMenu(open) {
      if (open) header.setAttribute('data-menu-open', ''); else header.removeAttribute('data-menu-open');
      menuBtn.setAttribute('aria-expanded', String(open));
      menuBtn.textContent = open ? '✕' : '☰';
    }
    menuBtn.addEventListener('click', function () {
      setMenu(!header.hasAttribute('data-menu-open'));
    });
    header.querySelectorAll('[data-nav-links] a').forEach(function (a) {
      a.addEventListener('click', function () { setMenu(false); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && header.hasAttribute('data-menu-open')) setMenu(false);
    });
  }

  /* ---- Current year ---- */
  document.querySelectorAll('[data-year]').forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });

  /* ---- Reveal on scroll (skipped when reduced motion is requested) ---- */
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var items = document.querySelectorAll('[data-reveal]');
  if (!reduce && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    items.forEach(function (el) { io.observe(el); });
  } else {
    items.forEach(function (el) { el.classList.add('is-visible'); });
  }


  /* ---- Lightweight demo forms + FAQ support for secondary pages ---- */
  document.querySelectorAll('[data-consultation-form], [data-resource-form]').forEach(function(form){
    form.addEventListener('submit', function(e){
      var status=form.querySelector('[data-form-status]');
      var btn=form.querySelector('[type="submit"]');

      // Always validate first.
      if(!form.checkValidity()){
        e.preventDefault();
        if(status){ status.textContent='Please complete the required fields.'; status.classList.add('error'); }
        form.reportValidity();
        return;
      }

      // Is a real backend connected? (Formspree endpoint with a real form ID.)
      var action=form.getAttribute('action')||'';
      var configured=/formspree\.io\/f\//.test(action) && action.indexOf('your-form-id')===-1;

      if(!configured){
        // No backend yet — keep the demo behavior so nothing is silently lost.
        e.preventDefault();
        if(status){ status.textContent='Demo only — connect this form to a backend (see DEPLOY.md) before launch.'; status.classList.remove('error'); }
        form.reset();
        return;
      }

      // Connected: submit by AJAX so the visitor stays on the page.
      e.preventDefault();
      if(status){ status.textContent='Sending…'; status.classList.remove('error'); }
      if(btn){ btn.disabled=true; }
      fetch(action,{ method:'POST', body:new FormData(form), headers:{ 'Accept':'application/json' } })
        .then(function(res){
          if(res.ok){
            if(status){ status.textContent='Thanks — your inquiry has been sent. We’ll be in touch shortly.'; status.classList.remove('error'); }
            form.reset();
          } else {
            return res.json().then(function(d){
              var msg=(d&&d.errors&&d.errors.map(function(x){return x.message;}).join(', '))||'Something went wrong. Please email contact@clearscopecounsel.com.';
              if(status){ status.textContent=msg; status.classList.add('error'); }
            });
          }
        })
        .catch(function(){
          if(status){ status.textContent='Network error. Please email contact@clearscopecounsel.com.'; status.classList.add('error'); }
        })
        .then(function(){ if(btn){ btn.disabled=false; } });
    });
  });
  document.querySelectorAll('[data-faq]').forEach(function(item){
    var btn=item.querySelector('button');
    if(!btn) return;
    btn.addEventListener('click', function(){
      var open=item.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', String(open));
      var symbol=btn.querySelector('span:last-child');
      if(symbol) symbol.textContent=open?'−':'+';
    });
  });

  /* ---- Billable vs Flat Fee chart: play on view + replay ---- */
  document.querySelectorAll('[data-fee-chart]').forEach(function(chart){
    if (reduce) return;                  // reduced motion: leave the final static state
    chart.classList.add('anim-ready');   // hide animatable parts so JS can reveal them
    function play(){
      chart.classList.remove('is-playing');
      void chart.offsetWidth;            // force reflow so the animation can restart
      chart.classList.add('is-playing');
    }
    if ('IntersectionObserver' in window){
      var fio = new IntersectionObserver(function(entries){
        entries.forEach(function(e){ if(e.isIntersecting){ play(); fio.unobserve(e.target); } });
      }, { threshold: 0.35 });
      fio.observe(chart);
    } else { play(); }
    var replay = chart.querySelector('[data-fee-replay]');
    if (replay) replay.addEventListener('click', play);
  });

  /* ---- "First question to fixed quote" flow: replay each time it scrolls into view ---- */
  document.querySelectorAll('[data-flow-viz]').forEach(function(viz){
    if (reduce) return;
    viz.classList.add('anim-ready');
    function play(){ viz.classList.remove('is-playing'); void viz.offsetWidth; viz.classList.add('is-playing'); }
    if ('IntersectionObserver' in window){
      var seen = false;
      var o = new IntersectionObserver(function(entries){
        entries.forEach(function(e){
          if (e.isIntersecting) { if (!seen) { seen = true; play(); } }
          else { seen = false; viz.classList.remove('is-playing'); }  // left view: re-arm so it replays on return
        });
      }, { threshold: 0.3 });
      o.observe(viz);
    } else { play(); }
  });

  /* ---- Homepage process journey: draw + reveal on view, replay on re-entry ---- */
  document.querySelectorAll('[data-journey]').forEach(function(j){
    if (reduce) return;
    j.classList.add('anim-ready');
    function play(){ j.classList.remove('is-playing'); void j.offsetWidth; j.classList.add('is-playing'); }
    if ('IntersectionObserver' in window){
      var seen = false;
      var o = new IntersectionObserver(function(entries){
        entries.forEach(function(e){
          if (e.isIntersecting) { if (!seen) { seen = true; play(); } }
          else { seen = false; j.classList.remove('is-playing'); }
        });
      }, { threshold: 0.25 });
      o.observe(j);
    } else { play(); }
  });
})();
