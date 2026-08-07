/* ClearScope Counsel — minimal, dependency-free behavior.
   Everything degrades gracefully: with JS off, the site is fully usable. */
(function () {
  'use strict';
  var root = document.documentElement;
  /* Reveal styles are gated behind html.js so content is never hidden without JS.
     js-reveal-live cancels the CSS auto-reveal fallback that fires if this file
     ever fails to load on a page that set html.js inline. */
  root.classList.add('js', 'js-reveal-live');

  /* ---- Theme toggle (persists; respects OS default) ---- */
  var toggle = document.querySelector('[data-theme-toggle]');
  function applyTheme(theme) {
    root.setAttribute('data-theme', theme);
    /* Icon swap is CSS-driven via [data-theme] (see .theme-icon in styles.css). */
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
      menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
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

  /* ---- Reveal (skipped when reduced motion is requested) ----
     Above-the-fold elements reveal immediately on load — never wait for a
     scroll event that may not come. Optional data-reveal-delay="ms" staggers
     the load-in. Only below-fold elements are handed to the observer. */
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var items = document.querySelectorAll('[data-reveal]');
  function show(el) {
    var d = el.getAttribute('data-reveal-delay');
    if (d) el.style.transitionDelay = d + 'ms';
    el.classList.add('is-visible');
  }
  if (!reduce && 'IntersectionObserver' in window) {
    var vh = window.innerHeight || root.clientHeight;
    var below = [];
    /* Read every rect first, then write. Interleaving them — measure, reveal,
       measure, reveal — invalidates layout on each reveal and forces a fresh
       synchronous layout on the next measure, once per [data-reveal] element.
       Lighthouse attributed ~500ms of forced reflow to this loop. */
    var above = [];
    items.forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.top < vh && r.bottom > 0) { above.push(el); } else { below.push(el); }
    });
    above.forEach(show);
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    below.forEach(function (el) { io.observe(el); });
  } else {
    items.forEach(function (el) { el.classList.add('is-visible'); });
  }

  /* ---- Organic hero contour field ----
     Each horizontal control point stays anchored while its height flexes at a
     slightly different cadence. That makes the field breathe and fold locally
     instead of translating a sine wave across the screen. The loop is capped
     near 30fps and stops when offscreen. */
  document.querySelectorAll('[data-mesh-wave]').forEach(function (mesh) {
    var lines = Array.prototype.slice.call(mesh.querySelectorAll('[data-mesh-line]'));
    if (!lines.length || reduce) return;

    var visible = true;
    var frameId = 0;
    var lastPaint = 0;
    var startTime = performance.now();

    function spline(points) {
      var path = 'M' + points[0].x.toFixed(1) + ' ' + points[0].y.toFixed(1);
      for (var i = 0; i < points.length - 1; i++) {
        var p0 = points[Math.max(0, i - 1)];
        var p1 = points[i];
        var p2 = points[i + 1];
        var p3 = points[Math.min(points.length - 1, i + 2)];
        var c1x = p1.x + (p2.x - p0.x) / 6;
        var c1y = p1.y + (p2.y - p0.y) / 6;
        var c2x = p2.x - (p3.x - p1.x) / 6;
        var c2y = p2.y - (p3.y - p1.y) / 6;
        path += ' C' + c1x.toFixed(1) + ' ' + c1y.toFixed(1) +
                ' ' + c2x.toFixed(1) + ' ' + c2y.toFixed(1) +
                ' ' + p2.x.toFixed(1) + ' ' + p2.y.toFixed(1);
      }
      return path;
    }

    function contour(lineIndex, time) {
      var seconds = (time - startTime) / 1000;
      var points = [];
      var nodeIndex = 0;
      for (var x = -120; x <= 1520; x += 160) {
        var fixedShape = Math.sin(nodeIndex * .78) * 31 +
                         Math.sin(nodeIndex * .37 + 1.2) * 13;
        var localPhase = nodeIndex * .83 + Math.sin(nodeIndex * 1.17) * .55;
        var localAmplitude = 12 + Math.sin(nodeIndex * .61 + 1) * 5;
        var flex = Math.sin(seconds * .22 + localPhase) * localAmplitude +
                   Math.sin(seconds * .115 - nodeIndex * .49) * 7;
        var strand = Math.sin(seconds * .17 + nodeIndex * .71 + lineIndex * .28) * 2.8;
        points.push({
          x: x,
          y: 202 + lineIndex * 28 + fixedShape + flex + strand
        });
        nodeIndex++;
      }
      return spline(points);
    }

    function render(time) {
      frameId = 0;
      if (!visible || document.hidden) return;
      if (time - lastPaint >= 32) {
        lastPaint = time;
        lines.forEach(function (line, index) {
          line.setAttribute('d', contour(index, time));
        });
      }
      frameId = window.requestAnimationFrame(render);
    }

    function wake() {
      if (visible && !document.hidden && !frameId) {
        frameId = window.requestAnimationFrame(render);
      }
    }

    if ('IntersectionObserver' in window) {
      var meshObserver = new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (visible) wake();
        else if (frameId) {
          window.cancelAnimationFrame(frameId);
          frameId = 0;
        }
      }, { rootMargin: '8%' });
      meshObserver.observe(mesh.closest('.ra-hero') || mesh);
    }

    document.addEventListener('visibilitychange', wake);
    mesh.setAttribute('data-mesh-live', '');
    wake();
  });

  /* ---- Regulatory particle field ----
     Based on the ten-ring, descending-dot construction authored in Figma's
     Vector Pattern Lab. It is drawn at device resolution, pauses offscreen,
     and uses a static frame when reduced motion is requested. */
  document.querySelectorAll('[data-regulatory-particles]').forEach(function (canvas) {
    var context = canvas.getContext('2d');
    if (!context) return;

    var width = 0;
    var height = 0;
    var pixelRatio = 1;
    var visible = true;
    var frameId = 0;
    var lastPaint = 0;
    var startTime = performance.now();
    var tau = Math.PI * 2;
    var palette = [
      'rgba(208,186,161,.78)',
      'rgba(31,92,88,.54)',
      'rgba(208,186,161,.64)',
      'rgba(214,90,60,.46)'
    ];

    function fieldSet() {
      if (width < 700) {
        return [
          { x: .74, y: .79, scale: .56, rings: 10, density: 92, inner: .34, speed: .026, phase: .2, alpha: .86 },
          { x: 1.01, y: .18, scale: .2, rings: 6, density: 48, inner: .38, speed: -.036, phase: 1.5, alpha: .52 },
          { x: .02, y: .98, scale: .24, rings: 7, density: 54, inner: .36, speed: .032, phase: 2.7, alpha: .44 }
        ];
      }
      return [
        { x: .8, y: .49, scale: .38, rings: 10, density: 110, inner: .34, speed: .024, phase: .2, alpha: .9 },
        { x: .985, y: .055, scale: .14, rings: 7, density: 58, inner: .38, speed: -.034, phase: 1.5, alpha: .68 },
        { x: .58, y: 1.015, scale: .15, rings: 6, density: 52, inner: .36, speed: .03, phase: 2.7, alpha: .54 },
        { x: 1.015, y: .94, scale: .13, rings: 5, density: 46, inner: .4, speed: -.04, phase: .9, alpha: .42 }
      ];
    }

    function drawField(field, seconds) {
      var outer = Math.min(width, height) * field.scale;
      var inner = outer * field.inner;
      var centerX = width * field.x;
      var centerY = height * field.y;
      var breath = 1 + Math.sin(seconds * .28 + field.phase) * .012;
      var turn = seconds * field.speed + field.phase;

      context.save();
      context.globalAlpha = field.alpha;
      for (var ring = 0; ring < field.rings; ring++) {
        var ringProgress = field.rings === 1 ? 0 : ring / (field.rings - 1);
        var radius = (inner + (outer - inner) * Math.pow(ringProgress, .92)) * breath;
        var dotCount = Math.round(field.density * (.66 + ringProgress * .34));
        var ringOffset = turn * (ring % 2 ? -.72 : 1) + ring * (7 * Math.PI / 180);
        context.fillStyle = palette[(ring + Math.round(field.phase)) % palette.length];

        for (var dot = 0; dot < dotCount; dot++) {
          var angle = ringOffset + dot / dotCount * tau;
          var descending = 1 - (dot % 11) / 10;
          var modulation = .82 + Math.sin(dot * .37 + ring * .91 + field.phase) * .18;
          var dotRadius = (.72 + descending * 2.25) * modulation * (.62 + outer / 320 * .38);
          var radialRipple = Math.sin(angle * 3 + ring * .58 + field.phase) * outer * .006;
          var pointRadius = radius + radialRipple;
          context.beginPath();
          context.arc(
            centerX + Math.cos(angle) * pointRadius,
            centerY + Math.sin(angle) * pointRadius,
            Math.max(.58, dotRadius),
            0,
            tau
          );
          context.fill();
        }
      }
      context.restore();
    }

    function paint(time) {
      frameId = 0;
      if (!visible || document.hidden) return;
      if (time - lastPaint >= 32) {
        lastPaint = time;
        context.clearRect(0, 0, width, height);
        var seconds = reduce ? 0 : (time - startTime) / 1000;
        fieldSet().forEach(function (field) { drawField(field, seconds); });
      }
      if (!reduce) frameId = window.requestAnimationFrame(paint);
    }

    function wake() {
      if (visible && !document.hidden && !frameId) frameId = window.requestAnimationFrame(paint);
    }

    function resize() {
      var bounds = canvas.getBoundingClientRect();
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      wake();
    }

    if ('ResizeObserver' in window) {
      var particleResizeObserver = new ResizeObserver(resize);
      particleResizeObserver.observe(canvas);
    } else {
      window.addEventListener('resize', resize);
    }
    if ('IntersectionObserver' in window) {
      var particleObserver = new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (visible) wake();
        else if (frameId) {
          window.cancelAnimationFrame(frameId);
          frameId = 0;
        }
      }, { rootMargin: '8%' });
      particleObserver.observe(canvas.closest('.rw-hero') || canvas);
    }
    document.addEventListener('visibilitychange', wake);
    resize();
    canvas.setAttribute('data-particles-live', '');
  });

  /* ---- Contact form routing from deep-linked service CTAs ---- */
  var consultationForm = document.querySelector('[data-consultation-form]');
  if (consultationForm && window.URLSearchParams) {
    var contactParams = new URLSearchParams(window.location.search);
    var requestedService = contactParams.get('service');
    var requestedMessage = contactParams.get('message');
    var serviceField = consultationForm.querySelector('[name="service"]');
    var messageField = consultationForm.querySelector('[name="message"]');

    if (requestedService && serviceField) {
      var matchingOption = Array.prototype.some.call(serviceField.options, function(option) {
        return option.value === requestedService;
      });
      if (matchingOption) serviceField.value = requestedService;
    }

    if (requestedMessage && messageField && !messageField.value) {
      messageField.value = requestedMessage;
    }

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

  /* ---- Motion bands ----
     A band's still image is the complete, real picture; the clip is an
     enhancement laid over it. Nothing about the clip is fetched until the
     band is near the viewport, and under reduced motion the video element is
     removed outright — so the still is not a "fallback", it is the default. */
  document.querySelectorAll('[data-media-band]').forEach(function (band) {
    var video = band.querySelector('video');
    if (!video) return;
    if (reduce) { video.parentNode.removeChild(video); return; }

    var wired = false;
    function start() {
      if (!wired) {
        wired = true;
        video.querySelectorAll('source[data-src]').forEach(function (s) {
          s.src = s.getAttribute('data-src');
        });
        video.load();
      }
      var p = video.play();
      /* Autoplay refused (data saver, low power mode): the still stays put. */
      if (p && p.catch) p.catch(function () {});
    }
    video.addEventListener('playing', function () { band.classList.add('is-playing'); });

    if ('IntersectionObserver' in window) {
      var mo = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) start();
          else if (wired) video.pause();
        });
      }, { threshold: 0.2, rootMargin: '250px 0px' });
      mo.observe(band);
    } else { start(); }
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
