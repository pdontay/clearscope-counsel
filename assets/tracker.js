/* ClearScope Counsel — Regulatory Watch tracker renderer.
   Fetches assets/tracker-entries.json and renders cards. Works standalone
   on regulatory-watch.html (with filters) or embedded on a service page
   via data-tracker-embed="finra" data-tracker-limit="3" (no filters). */
(function () {
  'use strict';

  var STATUS_LABELS = {
    'effective': 'Effective',
    'comment-open': 'Comment Period Open',
    'in-effect': 'In Effect',
    'proposed': 'Proposed'
  };

  var TRACK_LABELS = {
    finra: 'FINRA & Securities',
    missouri: 'Missouri Founders',
    crossover: 'Crossover'
  };

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function formatDate(iso) {
    try {
      var d = new Date(iso + 'T00:00:00');
      return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) { return iso; }
  }

  function entryCard(entry) {
    var statusClass = 'status-' + entry.status;
    var actionItems = (entry.action_items || []).map(function (item) {
      return '<li>' + escapeHtml(item) + '</li>';
    }).join('');

    return (
      '<article class="card tracker-card" data-track="' + entry.track + '">' +
        '<div class="tag-list">' +
          '<span class="tag ' + statusClass + '">' + escapeHtml(entry.status_label || STATUS_LABELS[entry.status] || entry.status) + '</span>' +
          '<span class="tag tag-track">' + escapeHtml(TRACK_LABELS[entry.track] || entry.track) + '</span>' +
        '</div>' +
        '<h3>' + escapeHtml(entry.headline) + '</h3>' +
        '<p class="tracker-date">' + formatDate(entry.date_posted) + '</p>' +
        '<p>' + escapeHtml(entry.the_change) + '</p>' +
        '<p><strong>Why it matters:</strong> ' + escapeHtml(entry.why_it_matters) + '</p>' +
        (actionItems ? '<p class="tracker-action-label"><strong>What to do now</strong></p><ol class="tracker-actions">' + actionItems + '</ol>' : '') +
        (entry.sifma_note ? '<p class="tracker-sifma"><strong>SIFMA note:</strong> ' + escapeHtml(entry.sifma_note) + '</p>' : '') +
        '<div class="tracker-footer">' +
          '<a class="tracker-source" href="' + escapeHtml(entry.source_url) + '" target="_blank" rel="noopener">' + escapeHtml(entry.source_name) + ' →</a>' +
          (entry.cta_link ? '<a class="arrow tracker-cta" href="' + escapeHtml(entry.cta_link) + '">' + escapeHtml(entry.cta_text || 'Need help with this?') + ' →</a>' : '') +
        '</div>' +
      '</article>'
    );
  }

  function render(grid, entries) {
    if (!entries.length) {
      grid.innerHTML = '<p class="tracker-loading">No entries in this track yet — check back soon.</p>';
      return;
    }
    grid.innerHTML = entries.map(entryCard).join('');
  }

  function sortByDateDesc(entries) {
    return entries.slice().sort(function (a, b) {
      return new Date(b.date_posted) - new Date(a.date_posted);
    });
  }

  function init(grid) {
    var embed = grid.getAttribute('data-tracker-embed');
    var limit = parseInt(grid.getAttribute('data-tracker-limit'), 10) || 0;
    var filters = document.querySelector('[data-tracker-filters]');

    fetch('assets/tracker-entries.json')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var sorted = sortByDateDesc(data);

        if (embed) {
          var filtered = sorted.filter(function (e) { return e.track === embed || e.track === 'crossover'; });
          if (limit) filtered = filtered.slice(0, limit);
          render(grid, filtered);
          return;
        }

        render(grid, sorted);

        if (filters) {
          filters.addEventListener('click', function (evt) {
            var btn = evt.target.closest('[data-filter]');
            if (!btn) return;
            var track = btn.getAttribute('data-filter');
            Array.prototype.forEach.call(filters.querySelectorAll('[data-filter]'), function (b) {
              b.setAttribute('aria-pressed', String(b === btn));
            });
            var next = track === 'all' ? sorted : sorted.filter(function (e) { return e.track === track; });
            render(grid, next);
          });
        }
      })
      .catch(function () {
        grid.innerHTML = '<p class="tracker-loading">Couldn&rsquo;t load tracker entries right now. Refresh, or check back shortly.</p>';
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var grids = document.querySelectorAll('[data-tracker-grid]');
    Array.prototype.forEach.call(grids, init);
  });
})();
