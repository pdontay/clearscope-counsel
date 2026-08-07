/* ClearScope Night — scroll engine for the landing page.

   One rAF-throttled read of scroll position drives every moving part, so
   nothing runs on a timer and nothing can fall out of sync with where the
   visitor actually is. Native scrolling is never intercepted: no preventDefault,
   no scroll hijacking, no smooth-scroll library. With reduced motion requested
   the whole engine stands down and CSS shows the finished state. */
(function () {
  'use strict';

  var body = document.body;
  if (!body.classList.contains('landing')) return;

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* WebKit re-rasterises an SVG filter on the CPU whenever the filtered
     element's geometry changes. The glyph trace re-dashes 32 filtered paths per
     frame, so Safari pays for a full feGaussianBlur raster 32 times a frame and
     the light stutters; Blink caches and GPU-accelerates the same work, which is
     why it only shows up in Safari. Detect the engine and lighten the two things
     that dominate that cost: blur radius and frame rate. */
  var isWebKit = typeof CSS !== 'undefined'
    && typeof CSS.supports === 'function'
    && CSS.supports('-webkit-hyphens', 'none')
    && !CSS.supports('-moz-appearance', 'none')
    && !/\bChrome\/|\bChromium\/|\bEdg\//.test(navigator.userAgent);

  var header  = document.querySelector('.site-header');
  var hero    = document.querySelector('.ln-hero');
  var glyph   = document.querySelector('.ln-glyph');
  var moments = Array.prototype.slice.call(document.querySelectorAll('.ln-moment'));
  var ledger  = document.querySelector('.ln-ledger');
  var lines   = Array.prototype.slice.call(document.querySelectorAll('.ln-line'));
  var figs    = Array.prototype.slice.call(document.querySelectorAll('.ln-fig'));
  var railDots = Array.prototype.slice.call(document.querySelectorAll('.ln-rail a'));
  var rail    = document.querySelector('.ln-rail');
  var day     = document.querySelector('.ln-day');
  var portrait = document.querySelector('.ln-portrait');

  /* The approved Figma Motion export uses four clean vector contours. They are
     measured as one cumulative route so the two lights move at one physical
     speed and only one contour per light is active at a time. */
  var glyphShapes = [
    {
      id: 'c',
      tx: 85.95,
      ty: 82.55,
      d: 'M147.654 0.0533741C150.221 -0.222017 154.034 0.48965 152.398 4.04654C149.786 9.72793 146.201 15.1896 143.303 20.7499C142.305 22.6657 141.139 24.6776 139.997 26.5109C138.413 27.1735 135.304 27.8739 133.53 28.3422C130.516 29.1142 127.535 30.0114 124.596 31.0316C108.807 36.6442 94.2742 45.3022 81.8213 56.5141C53.7674 81.997 37.0288 117.612 35.3123 155.473C33.437 189.919 45.3235 223.7 68.3562 249.381C95.3445 279.391 132.258 296.193 172.76 294.006C195.514 293.061 217.914 285.905 235.609 271.278C239.881 267.748 241.112 273.869 241.559 276.696C244.525 295.444 235.851 310.429 220.995 321.213C209.664 329.135 196.578 334.179 182.862 335.907C143.535 340.927 98.2383 326.947 67.0371 302.802C30.3282 274.394 6.92434 234.801 1.15896 188.608C-4.10544 143.757 8.7034 98.6569 36.7559 63.2694C63.7503 28.1801 103.707 5.40323 147.654 0.0533741Z'
    },
    {
      id: 's',
      tx: 174.95,
      ty: 189.9,
      d: 'M75.0921 0.0365184C88.0633 -0.340435 102.7 2.20619 114.609 7.42958C116.552 8.28285 118.166 9.39394 119.709 10.848C123.452 14.3751 133.835 27.9447 135.522 32.682C135.866 33.6476 136.088 34.8649 135.529 35.8002C135.012 36.6698 133.859 37.0409 132.895 36.9601C132.299 36.9103 119.714 30.2279 117.104 29.121C102.202 22.8009 85.5731 20.0482 69.6161 23.6491C59.2777 25.9821 49.0853 31.3214 43.3541 40.5312C39.9388 46.0197 38.3793 52.4135 39.941 58.7846C46.1576 84.1449 94.0301 89.1864 115.314 92.4311C124.379 93.7934 133.4 95.434 142.368 97.348C161.122 101.516 180.671 108.559 195.239 121.557C204.294 129.636 208.696 137.851 211.55 149.475L229.36 149.433C230.661 149.44 233.627 149.431 234.47 150.397C236.628 152.875 232.341 158.071 230.878 160.192C222.372 172.563 212.263 183.749 200.812 193.461C182.302 208.759 160.617 221.525 136.628 225.488C133.862 225.944 128.688 227.331 126.354 225.519C125.854 225.131 125.507 224.641 125.505 223.981C125.497 222.756 126.508 221.623 127.385 220.886C130.107 218.591 133.666 216.955 136.689 215.026C142.556 211.279 148.566 206.516 153.281 201.374C159.828 194.238 164.355 185.695 163.842 175.788C161.857 137.451 85.3216 123.588 56.1561 115.864C49.4842 114.147 42.9164 112.048 36.4845 109.579C28.6842 106.535 20.7538 102.216 14.558 96.5375C5.66221 88.4955 0.42198 77.182 0.0435619 65.1972C-1.29677 31.8993 28.5123 6.80434 59.14 1.63686C64.837 0.675677 69.2792 0.272847 75.0921 0.0365184Z'
    },
    {
      id: 'a',
      tx: 152.8,
      ty: 80.8,
      d: 'M96.4408 0.000908073C97.288 0.00261706 98.8139 -0.0664701 99.3607 0.718198C102.137 4.70526 104.402 9.14129 106.805 13.3776L121.675 39.322L180.135 140.613L192.449 161.909C194.537 165.509 196.682 169.091 198.677 172.738C199.649 174.511 199.905 176.349 198.081 177.658C197.308 178.21 196.348 178.432 195.411 178.276C194.263 178.075 193.384 177.301 192.693 176.41C188.968 171.608 185.357 166.457 181.802 161.525L162.364 134.577C141.477 105.402 120.84 76.0502 100.452 46.5248L97.5663 42.3061C95.1371 46.3952 91.6166 51.3683 88.9047 55.33L76.1618 74.0788L24.4818 150.072C18.5858 158.699 12.683 167.643 6.33365 175.895C4.02676 177.738 -1.14292 175.695 0.227686 172.316C2.24966 167.331 5.704 161.831 8.32632 157.13L25.4784 126.349L72.85 41.3129C80.1386 28.2087 87.4039 15.0632 94.639 1.92816C95.1737 0.956722 95.5228 0.6054 96.4408 0.000908073Z'
    },
    {
      id: 't',
      tx: 261.85,
      ty: 82.3,
      d: 'M2.29049 0C11.5507 0.264893 27.0415 3.37281 35.811 5.68848C72.6152 15.6167 105.093 37.4556 128.174 67.7935C131.814 72.5796 135.245 77.5955 138.506 82.6443C139.898 84.7974 139.195 86.5977 136.956 87.5852C127.115 87.8801 115.564 87.6506 105.618 87.5918C104.666 86.7251 104.1 85.8928 103.357 84.8503C99.102 78.8765 94.6709 72.9453 89.6025 67.6252C73.6137 50.7019 53.6113 38.0884 31.4482 30.9531C28.1328 29.9102 24.7759 29.0142 21.3823 28.2676C18.8237 27.7056 15.7353 27.1904 13.3086 26.3689C11.5703 24.2688 8.98728 19.3489 7.46873 16.8076C5.374 13.1729 3.17427 9.59278 1.09908 5.94605C-0.448774 3.22437 -0.622112 1.59399 2.29049 0Z'
    }
  ];

  var glyphLayers = [
    { id: 'far',  color: '#A07830', width: 16,  primary: .09, counter: .054, primaryTail: .082, counterTail: .070, filter: 'url(#cs-far)' },
    { id: 'body', color: '#D4AA40', width: 4.5, primary: .79, counter: .474, primaryTail: .058, counterTail: .049, filter: 'url(#cs-body)' },
    { id: 'core', color: '#F8F0DD', width: 1.2, primary: .95, counter: .570, primaryTail: .024, counterTail: .020, filter: '' },
    { id: 'tip',  color: '#FFFFFF', width: 2.8, primary: .93, counter: .558, primaryTail: .010, counterTail: .009, filter: 'url(#cs-tip)' }
  ];

  var glyphLoop = 15.5;
  var svgNamespace = 'http://www.w3.org/2000/svg';

  function svgElement(name, attributes) {
    var element = document.createElementNS(svgNamespace, name);
    Object.keys(attributes || {}).forEach(function (attribute) {
      element.setAttribute(attribute, attributes[attribute]);
    });
    return element;
  }

  function appendGlyphFilter(defs, id, deviation, bounds) {
    /* setAttribute is case-sensitive on SVG, so the camelCase spelling this
       used to carry never applied and the filters silently ran in linearRGB
       (the spec default). Naming it correctly and asking for sRGB skips a
       per-pixel colourspace conversion in both directions every frame, which is
       the single cheapest win available here and costs almost nothing visually
       on a soft brass glow. */
    var filter = svgElement('filter', {
      id: id,
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      'color-interpolation-filters': 'sRGB'
    });
    filter.appendChild(svgElement('feGaussianBlur', {
      in: 'SourceGraphic',
      stdDeviation: deviation
    }));
    defs.appendChild(filter);
  }

  function applyGlyphDash(element, arcStart, arcEnd, segmentStart, segmentEnd, totalLength) {
    if (!element) return;

    var pathLength = segmentEnd - segmentStart;
    var normalizedStart = ((arcStart % totalLength) + totalLength) % totalLength;
    var normalizedEnd = ((arcEnd % totalLength) + totalLength) % totalLength;
    var visibleStart = -1;
    var visibleEnd = -1;

    if (normalizedStart <= normalizedEnd) {
      var overlapStart = Math.max(normalizedStart, segmentStart);
      var overlapEnd = Math.min(normalizedEnd, segmentEnd);
      if (overlapEnd > overlapStart) {
        visibleStart = overlapStart - segmentStart;
        visibleEnd = overlapEnd - segmentStart;
      }
    } else {
      var firstStart = Math.max(normalizedStart, segmentStart);
      var firstEnd = Math.min(totalLength, segmentEnd);
      if (firstEnd > firstStart) {
        visibleStart = firstStart - segmentStart;
        visibleEnd = firstEnd - segmentStart;
      } else {
        var secondStart = Math.max(0, segmentStart);
        var secondEnd = Math.min(normalizedEnd, segmentEnd);
        if (secondEnd > secondStart) {
          visibleStart = secondStart - segmentStart;
          visibleEnd = secondEnd - segmentStart;
        }
      }
    }

    if (visibleStart < 0 || visibleEnd - visibleStart < .5) {
      element.setAttribute('stroke-dasharray', '0 ' + pathLength.toFixed(1));
      return;
    }

    var dashLength = visibleEnd - visibleStart;
    element.setAttribute(
      'stroke-dasharray',
      dashLength.toFixed(1) + ' ' + (pathLength - dashLength).toFixed(1)
    );
    element.setAttribute('stroke-dashoffset', (-visibleStart).toFixed(1));
  }

  function initGlyphTrace(mark) {
    if (!mark) return null;

    var svg = mark.querySelector('svg');
    var host = mark.closest('.ln-hero');
    if (!svg || !host) return null;

    /* Scroll never changes the mark's position. Clear any legacy inline
       transform before mounting the approved light-only animation. */
    mark.style.removeProperty('transform');

    svg.setAttribute('viewBox', '78 73 340 354');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    var defs = svgElement('defs');
    /* The far halo is the expensive one: a 16px blur over a region 25x the
       path's own box, rasterised eight times a frame. WebKit does that on the
       CPU, so it gets a smaller radius over a 9x region. At .09 alpha behind
       three brighter layers the softer falloff is not readable as a change. */
    appendGlyphFilter(defs, 'cs-far', isWebKit ? '9' : '16', isWebKit
      ? { x: '-100%', y: '-100%', width: '300%', height: '300%' }
      : { x: '-200%', y: '-200%', width: '500%', height: '500%' });
    appendGlyphFilter(defs, 'cs-body', '2.5', {
      x: '-60%', y: '-60%', width: '220%', height: '220%'
    });
    appendGlyphFilter(defs, 'cs-tip', '1.2', {
      x: '-100%', y: '-100%', width: '300%', height: '300%'
    });

    var baseGroup = svgElement('g', { 'aria-hidden': 'true' });
    var basePaths = [];
    glyphShapes.forEach(function (shape) {
      var path = svgElement('path', {
        class: 'g-route-base',
        d: shape.d,
        transform: 'translate(' + shape.tx + ' ' + shape.ty + ')',
        stroke: 'rgba(200,162,88,' + (reduce ? '.50' : '.24') + ')',
        'stroke-width': '1.2',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        'data-route-shape': shape.id
      });
      baseGroup.appendChild(path);
      basePaths.push(path);
    });

    var primaryRefs = {};
    var counterRefs = {};
    glyphLayers.forEach(function (layer) {
      var primaryGroup = svgElement('g', { 'aria-hidden': 'true' });
      var counterGroup = svgElement('g', { 'aria-hidden': 'true' });
      primaryRefs[layer.id] = {};
      counterRefs[layer.id] = {};

      glyphShapes.forEach(function (shape) {
        var shared = {
          class: 'g-filament g-filament-' + layer.id,
          d: shape.d,
          transform: 'translate(' + shape.tx + ' ' + shape.ty + ')',
          stroke: layer.color,
          'stroke-width': String(layer.width),
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-dasharray': '0 99999'
        };
        if (layer.filter) shared.filter = layer.filter;

        var primaryPath = svgElement('path', shared);
        primaryPath.setAttribute('opacity', String(layer.primary));
        primaryGroup.appendChild(primaryPath);
        primaryRefs[layer.id][shape.id] = primaryPath;

        var counterPath = svgElement('path', shared);
        counterPath.setAttribute('opacity', String(layer.counter));
        counterGroup.appendChild(counterPath);
        counterRefs[layer.id][shape.id] = counterPath;
      });

      svg.appendChild(primaryGroup);
      svg.appendChild(counterGroup);
    });

    svg.replaceChildren(defs, baseGroup);
    glyphLayers.forEach(function (layer) {
      var primaryGroup = svgElement('g', {
        'aria-hidden': 'true',
        'data-filament-group': 'primary-' + layer.id
      });
      var counterGroup = svgElement('g', {
        'aria-hidden': 'true',
        'data-filament-group': 'counter-' + layer.id
      });

      glyphShapes.forEach(function (shape) {
        primaryGroup.appendChild(primaryRefs[layer.id][shape.id]);
        counterGroup.appendChild(counterRefs[layer.id][shape.id]);
      });

      svg.appendChild(primaryGroup);
      svg.appendChild(counterGroup);
    });

    mark.setAttribute('data-motion-logo', '');

    var lengths = basePaths.map(function (path) { return path.getTotalLength(); });
    var starts = [];
    var total = 0;
    lengths.forEach(function (length) {
      starts.push(total);
      total += length;
    });

    if (reduce || !total) return svg;

    var raf = 0;
    var startTime = null;
    var visible = true;
    var pointer = { targetX: 0, targetY: 0, x: 0, y: 0 };
    var finePointer = window.matchMedia('(pointer:fine)').matches;
    /* The trace is a 15.5s ambient loop, so it carries no motion detail that
       needs 60fps. Halving the rate on WebKit halves the filter rasterisation
       and the pointer tilt still eases smoothly, because its own easing is
       frame-rate independent enough at this speed. */
    var minFrameMs = isWebKit ? 32 : 0;
    var lastFrame = 0;

    function render(time) {
      raf = 0;
      if (!visible || document.hidden) return;
      if (minFrameMs && lastFrame && time - lastFrame < minFrameMs) {
        raf = window.requestAnimationFrame(render);
        return;
      }
      lastFrame = time;
      if (startTime === null) startTime = time;

      pointer.x += (pointer.targetX - pointer.x) * .055;
      pointer.y += (pointer.targetY - pointer.y) * .055;
      mark.style.setProperty('--g-tilt-x', (pointer.x * 9).toFixed(2) + 'px');
      mark.style.setProperty('--g-tilt-y', (pointer.y * 9).toFixed(2) + 'px');

      var elapsed = (time - startTime) / 1000;
      var progress = (elapsed % glyphLoop) / glyphLoop;
      var primaryHead = progress * total;
      var counterHead = (((.5 - progress) % 1) + 1) % 1 * total;

      glyphShapes.forEach(function (shape, index) {
        var segmentStart = starts[index];
        var segmentEnd = segmentStart + lengths[index];

        glyphLayers.forEach(function (layer) {
          applyGlyphDash(
            primaryRefs[layer.id][shape.id],
            primaryHead - layer.primaryTail * total,
            primaryHead,
            segmentStart,
            segmentEnd,
            total
          );
          applyGlyphDash(
            counterRefs[layer.id][shape.id],
            counterHead,
            counterHead + layer.counterTail * total,
            segmentStart,
            segmentEnd,
            total
          );
        });
      });

      raf = window.requestAnimationFrame(render);
    }

    function wake() {
      if (visible && !document.hidden && !raf) raf = window.requestAnimationFrame(render);
    }

    if (typeof IntersectionObserver === 'function') {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (visible) wake();
        else if (raf) {
          window.cancelAnimationFrame(raf);
          raf = 0;
        }
      }, { rootMargin: '8%' }).observe(host);
    }

    document.addEventListener('visibilitychange', wake);

    if (finePointer) {
      host.addEventListener('pointermove', function (event) {
        var rect = host.getBoundingClientRect();
        pointer.targetX = Math.max(
          -1,
          Math.min(1, (event.clientX - rect.left - rect.width / 2) / (rect.width / 2))
        );
        pointer.targetY = Math.max(
          -1,
          Math.min(1, (event.clientY - rect.top - rect.height / 2) / (rect.height / 2))
        );
      }, { passive: true });
      host.addEventListener('pointerleave', function () {
        pointer.targetX = 0;
        pointer.targetY = 0;
      }, { passive: true });
    }

    wake();
    return svg;
  }

  initGlyphTrace(glyph);

  /* Rail targets, resolved once. */
  var railTargets = railDots.map(function (a) {
    return document.getElementById(a.getAttribute('href').slice(1));
  });

  var lastMoment = -1, lastLedger = -1, lastRail = -1, landed = null, onLight = null;

  function setOn(list, index) {
    for (var i = 0; i < list.length; i++) {
      if (i === index) list[i].setAttribute('data-on', '');
      else list[i].removeAttribute('data-on');
    }
  }

  function frame() {
    ticking = false;
    var y = window.pageYOffset;
    var vh = window.innerHeight;

    /* Header lands once the hero is behind us. */
    if (header && hero) {
      var wantLanded = y > hero.offsetHeight - 90;
      if (wantLanded !== landed) {
        landed = wantLanded;
        if (wantLanded) header.setAttribute('data-landed', '');
        else header.removeAttribute('data-landed');
      }
    }

    /* ---- Orientation state ----
       Everything below this point is motion and stands down under reduced
       motion. These two are not: which act you are in, and whether the rail is
       legible against what is behind it, are facts about position, not
       animation. Gating them on `reduce` left the rail frozen on the first dot
       and ivory-on-cream for the visitors least able to tolerate that. */

    /* Rail: which act are we in. */
    if (railTargets.length) {
      var on = 0;
      for (var k = 0; k < railTargets.length; k++) {
        if (railTargets[k] && railTargets[k].getBoundingClientRect().top <= vh * 0.4) on = k;
      }
      if (on !== lastRail) { lastRail = on; setOn(railDots, on); }
    }

    /* The rail is fixed at the middle of the viewport, so when the daylight act
       passes that line the dots are ivory-on-cream and simply vanish — the one
       control that answers "how far in am I" stops answering. Flip them to ink
       for exactly the span the light section occupies that line. */
    if (rail && day) {
      var dr = day.getBoundingClientRect(), midline = vh * 0.5;
      var wantLight = dr.top <= midline && dr.bottom >= midline;
      if (wantLight !== onLight) {
        onLight = wantLight;
        if (wantLight) rail.setAttribute('data-on-light', '');
        else rail.removeAttribute('data-on-light');
      }
    }

    if (reduce) return;

    /* Moments: whichever statement sits closest to the reading line is the
       bright one. Position-driven, so scrolling fast can never skip it. */
    if (moments.length) {
      var readLine = vh * 0.46, best = -1, bestDist = Infinity;
      for (var i = 0; i < moments.length; i++) {
        var r = moments[i].getBoundingClientRect();
        if (r.bottom < 0 || r.top > vh) continue;
        var d = Math.abs(r.top + r.height / 2 - readLine);
        if (d < bestDist) { bestDist = d; best = i; }
      }
      if (best !== lastMoment) { lastMoment = best; setOn(moments, best); }
    }

    /* Ledger: progress through the pinned section picks the enlarged figure
       and the matching line. Every price stays on screen the whole time. */
    if (ledger && lines.length) {
      var lr = ledger.getBoundingClientRect();
      var span = ledger.offsetHeight - vh;
      var idx = -1;
      if (span > 0 && lr.top <= 0 && lr.bottom >= vh) {
        var p = Math.min(0.9999, Math.max(0, -lr.top / span));
        idx = Math.floor(p * lines.length);
      } else if (lr.top > 0 && lr.top < vh) {
        idx = 0;
      } else if (lr.bottom < vh && lr.bottom > 0) {
        idx = lines.length - 1;
      }
      if (idx !== lastLedger) {
        lastLedger = idx;
        setOn(lines, idx);
        setOn(figs, idx);
      }
    }

    /* Portrait settles to its true scale as it arrives. */
    if (portrait) {
      var pr = portrait.getBoundingClientRect();
      if (pr.top < vh * 0.85 && pr.bottom > 0) portrait.setAttribute('data-on', '');
    }

  }

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(frame);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  frame();
})();
