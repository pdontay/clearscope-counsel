/* ClearScope Visual Influencer Discovery
   Uses the local public-field catalog until a Worker endpoint is configured. */
(function () {
  "use strict";

  var form = document.querySelector("[data-influencer-search]");
  if (!form) return;

  var creators = Array.isArray(window.CLEAR_SCOPE_CREATORS)
    ? window.CLEAR_SCOPE_CREATORS
    : [];
  var localProfilePhotos = {
    "@cad.gif": "assets/creator-cad-gif.jpg",
    "@dewintermetalworks": "assets/creator-dewintermetalworks.jpg",
    "@talaardalan": "assets/creator-talaardalan.jpg",
    "@nicolemwilkins": "assets/creator-nicolemwilkins.jpg",
    "@chrissiglow": "assets/creator-chrissiglow.jpg",
    "@jolenegoring": "assets/creator-jolenegoring.jpg",
    "@balreetmann": "assets/creator-balreetmann.jpg",
    "@camisophiaaaaa": "assets/creator-camisophiaaaaa.jpg",
  };
  creators.forEach(function (creator) {
    if (localProfilePhotos[creator.handle])
      creator.photoUrl = localProfilePhotos[creator.handle];
  });
  var endpoint = window.CLEAR_SCOPE_INFLUENCER_API || "";
  var SEARCH_TIMEOUT_MS = 8000;
  var PAGE_SIZE = 4;
  var LABEL_LIVE = "AI-assisted matches";
  var LABEL_LOCAL = "curated catalog matches";
  var LABEL_FALLBACK = "curated catalog matches";
  var queryInput = form.querySelector("[name='creator-query']");
  var resultsEl = document.querySelector("[data-creator-results]");
  var statusEl = document.querySelector("[data-creator-status]");
  var countEl = document.querySelector("[data-catalog-count]");
  var loaderEl = document.querySelector("[data-creator-loader]");
  var paginationEl = document.querySelector("[data-creator-pagination]");
  var previousButton = document.querySelector("[data-page-previous]");
  var nextButton = document.querySelector("[data-page-next]");
  var pageStatus = document.querySelector("[data-page-status]");
  var dialog = document.querySelector("[data-premier-dialog]");
  var dialogCreator = dialog && dialog.querySelector("[data-dialog-creator]");
  var dialogCta = dialog && dialog.querySelector("[data-dialog-cta]");
  var inFlight = null;
  var loadingToken = 0;
  var currentResults = [];
  var currentSourceLabel = "";
  var currentPage = 0;

  var stopWords = {
    a: true,
    an: true,
    and: true,
    for: true,
    i: true,
    in: true,
    of: true,
    our: true,
    the: true,
    to: true,
    with: true,
  };

  var sectorTerms = {
    Healthcare:
      "telehealth doctor clinician medical health coach mental health patient advocate caregiving home care social assistance therapy counseling",
    Manufacturing:
      "factory tour made in usa how it is made industrial manufacturing engineering fabrication welding supply chain aerospace 3d printing",
    Retail:
      "small business shop small boutique owner retail shopping ecommerce e-commerce dtc direct to consumer handmade founder",
    Wellness:
      "wellness yoga pilates nutrition dietitian fitness strength coach healthy lifestyle recovery",
    Automotive:
      "car cars auto automotive vehicle jdm drift drifting supercar exotic car review car build garage horsepower racing motorsport",
    Missouri:
      "missouri st louis saint louis kansas city midwest local stl kc",
    Modeling:
      "model modeling fashion model runway editorial swimwear fitness model photoshoot campaign brand ambassador",
    Lifestyle:
      "travel technology tech gadgets food nutrition parenting mom blogger lifestyle vlog",
    "Sustainable Fashion":
      "sustainable fashion eco-friendly circular fashion slow fashion ethical fashion upcycling secondhand thrift zero waste",
    "Finance & Investing":
      "finance investing personal finance stock market crypto cryptocurrency fintech wealth money startup coach financial literacy",
    "Art & Creative":
      "art artist painting drawing portrait watercolor gallery creative craft illustration",
    "Business Coaching":
      "business coach sales coach marketing coach real estate coach entrepreneur coaching lead generation growth strategy",
    "Food & Beverage":
      "food foodie recipe cooking chef restaurant review baking home cook culinary",
    "Beauty & Skincare":
      "beauty skincare makeup cosmetics skin care routine glam beauty tips",
    "Home & DIY":
      "home diy interior design renovation home decor craft home improvement",
    "Pets & Animals":
      "pet pets dog dogs cat cats animal rescue pet care pet influencer",
    "Pranks & Comedy":
      "prank pranks comedy funny skit sketch viral challenge reaction",
    "Writers & Authors":
      "writer writing author book books novel publishing bookstagram booktok literary",
    Fitness:
      "fitness gym workout bodybuilding strength training powerlifting personal trainer muscle",
    "Farming & Agriculture":
      "farm farming farmer agriculture homestead homesteading ranch ranching rural crops livestock",
  };

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9@]+/g, " ")
      .trim();
  }

  function tokens(value) {
    return normalize(value)
      .split(/\s+/)
      .filter(function (token) {
        return token.length > 1 && !stopWords[token];
      });
  }

  function formatFollowers(value) {
    if (typeof value !== "number" || !isFinite(value)) return "Not listed";
    if (value >= 1000000)
      return (value / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
    if (value >= 1000)
      return (value / 1000).toFixed(1).replace(/\.0$/, "") + "K";
    return String(value);
  }

  function formatEngagement(value) {
    if (typeof value !== "number" || !isFinite(value)) return "Not listed";
    var percentage = value * 100;
    return percentage.toFixed(percentage < 1 ? 2 : 1) + "%";
  }

  function initials(name, handle) {
    var parts = String(name || handle || "")
      .replace(/[^A-Za-z0-9 ]/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return "@";
    return (
      parts[0].charAt(0) + (parts[1] ? parts[1].charAt(0) : parts[0].charAt(1))
    ).toUpperCase();
  }

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function contactUrl(service, creator) {
    var params = new URLSearchParams();
    params.set("service", service);
    params.set("creator", creator.handle || "");
    params.set(
      "message",
      service === "Free creator contract checklist"
        ? "Please send me the free contract checklist for working with " +
            (creator.handle || "this creator") +
            "."
        : "I would like a flat-fee influencer agreement for a possible collaboration with " +
            (creator.handle || "this creator") +
            ".",
    );
    return "contact.html?" + params.toString() + "#quote";
  }

  function creatorText(creator) {
    return normalize(
      [
        creator.name,
        creator.handle,
        creator.sector,
        creator.niche,
        creator.searchDocument,
        sectorTerms[creator.sector],
      ].join(" "),
    );
  }

  function scoreCreator(creator, query) {
    var text = creatorText(creator);
    var queryTokens = tokens(query);
    var score = 0;

    queryTokens.forEach(function (token) {
      if (text.indexOf(token) !== -1) score += token.length > 6 ? 5 : 3;
      if (normalize(creator.niche).indexOf(token) !== -1) score += 4;
      if (normalize(creator.name).indexOf(token) !== -1) score += 2;
    });

    if (query && text.indexOf(normalize(query)) !== -1) score += 12;
    if (creator.premier) score += 0.75;
    if (creator.followers) score += Math.log10(creator.followers) / 20;
    return score;
  }

  function featuredCreators() {
    var preferredHandles = [
      "@dewintermetalworks",
      "@talaardalan",
      "@nicolemwilkins",
      "@chrissiglow",
      "@jolenegoring",
      "@balreetmann",
      "@camisophiaaaaa",
      "@cad.gif",
    ];
    return preferredHandles
      .map(function (handle) {
        return creators.find(function (creator) {
          return creator.handle === handle;
        });
      })
      .filter(function (creator) {
        return Boolean(creator);
      })
      .slice(0, 8);
  }

  function localSearch(query) {
    if (!query) return featuredCreators();
    return creators
      .map(function (creator) {
        return { creator: creator, score: scoreCreator(creator, query) };
      })
      .filter(function (item) {
        return item.score > 1.25;
      })
      .sort(function (a, b) {
        return b.score - a.score;
      })
      .slice(0, 8)
      .map(function (item) {
        return item.creator;
      });
  }

  function normalizeApiCreator(creator) {
    return {
      name: creator.name || creator.full_name || creator.handle || "Creator",
      handle: creator.handle || "",
      sector: creator.sector || creator.industry || "Creator",
      niche: creator.niche || creator.sector || "Creator",
      followers: Number(creator.followers || creator.follower_count) || null,
      engagementRate:
        typeof creator.engagementRate === "number"
          ? creator.engagementRate
          : typeof creator.engagement_rate === "number"
            ? creator.engagement_rate
            : null,
      photoUrl: creator.photoUrl || creator.photo_url || "",
      profileUrl: creator.profileUrl || creator.profile_url || "",
      premier: Boolean(creator.premier || creator.is_premier),
      searchDocument: "",
    };
  }

  function setStatus(message, state) {
    statusEl.textContent = message;
    if (state) statusEl.setAttribute("data-state", state);
    else statusEl.removeAttribute("data-state");
  }

  function openPremierDialog(creator) {
    if (!dialog) return;
    dialogCreator.textContent =
      "Selected profile: " + (creator.handle || creator.name);
    dialogCta.href = contactUrl("Free creator contract checklist", creator);
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function closeDialog() {
    if (!dialog) return;
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  function buildAvatar(creator) {
    var avatar = element("div", "creator-avatar");
    var fallback = element(
      "span",
      "creator-avatar-fallback",
      initials(creator.name, creator.handle),
    );
    avatar.appendChild(fallback);

    if (creator.photoUrl) {
      var image = document.createElement("img");
      image.src = creator.photoUrl;
      image.alt = "";
      image.loading = "lazy";
      image.decoding = "async";
      image.referrerPolicy = "no-referrer";
      image.addEventListener("load", function () {
        avatar.classList.add("has-photo");
      });
      image.addEventListener("error", function () {
        image.remove();
      });
      avatar.appendChild(image);
    }

    return avatar;
  }

  function buildCard(creator) {
    var card = element(
      "article",
      "creator-card" + (creator.premier ? " creator-card--premier" : ""),
    );
    var heading = element("div", "creator-card-head");
    heading.appendChild(buildAvatar(creator));

    var identity = element("div", "creator-identity");
    identity.appendChild(element("h3", "creator-name", creator.name));
    identity.appendChild(element("p", "creator-handle", creator.handle));
    heading.appendChild(identity);
    card.appendChild(heading);

    var tags = element("div", "creator-tags");
    tags.appendChild(element("span", "creator-tag", creator.niche));
    if (creator.premier)
      tags.appendChild(element("span", "creator-premier-tag", "Premier profile"));
    card.appendChild(tags);

    var stats = element("dl", "creator-stats");
    [
      ["Followers", formatFollowers(creator.followers)],
      ["Engagement", formatEngagement(creator.engagementRate)],
    ].forEach(function (stat) {
      var wrapper = element("div", "creator-stat");
      wrapper.appendChild(element("dt", "", stat[0]));
      wrapper.appendChild(element("dd", "", stat[1]));
      stats.appendChild(wrapper);
    });
    card.appendChild(stats);

    if (creator.premier) {
      var insights = element("section", "premier-insights");
      insights.setAttribute(
        "aria-label",
        "Preview of additional information included with this Premier profile",
      );
      insights.appendChild(
        element("p", "premier-insights-title", "Premier intelligence preview"),
      );
      [
        "Audience demographics",
        "Average content performance",
        "Brand-fit notes",
        "Contact pathway",
      ].forEach(function (label, index) {
        var row = element("div", "premier-insight-row");
        row.appendChild(element("span", "", label));
        var obscured = element("i", "premier-insight-obscured");
        obscured.style.setProperty("--preview-width", 48 + index * 9 + "%");
        obscured.setAttribute("aria-hidden", "true");
        row.appendChild(obscured);
        insights.appendChild(row);
      });
      insights.appendChild(
        element(
          "p",
          "visually-hidden",
          "Premier profiles include audience demographics, average content performance, brand-fit notes, and a contact pathway. Request access to review the full profile.",
        ),
      );
      card.appendChild(insights);
    }

    var actions = element("div", "creator-actions");
    if (creator.premier) {
      var premierButton = element(
        "button",
        "btn btn-accent",
        "Unlock premier profile",
      );
      premierButton.type = "button";
      premierButton.addEventListener("click", function () {
        openPremierDialog(creator);
      });
      actions.appendChild(premierButton);
    } else {
      var agreement = element("a", "btn btn-secondary", "Draft an agreement");
      agreement.href = contactUrl("Influencer agreement drafting", creator);
      actions.appendChild(agreement);
      if (creator.profileUrl) {
        var profile = element("a", "creator-profile-link", "Open Instagram ↗");
        profile.href = creator.profileUrl;
        profile.target = "_blank";
        profile.rel = "noopener noreferrer";
        profile.setAttribute(
          "aria-label",
          "Open " + creator.handle + " on Instagram in a new tab",
        );
        actions.appendChild(profile);
      }
    }
    card.appendChild(actions);
    return card;
  }

  function updatePagination() {
    var totalPages = Math.max(1, Math.ceil(currentResults.length / PAGE_SIZE));
    var hasMultiplePages = totalPages > 1;
    paginationEl.hidden = !hasMultiplePages;
    pageStatus.textContent = "Page " + (currentPage + 1) + " of " + totalPages;
    previousButton.disabled = currentPage === 0;
    nextButton.disabled = currentPage >= totalPages - 1;
  }

  function renderPage(shouldFocus) {
    resultsEl.textContent = "";
    if (!currentResults.length) {
      setStatus(
        "No close matches yet. Try broader content language or another niche.",
        "empty",
      );
      paginationEl.hidden = true;
      return;
    }

    var fragment = document.createDocumentFragment();
    currentResults
      .slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE)
      .forEach(function (creator) {
      fragment.appendChild(buildCard(creator));
    });
    resultsEl.appendChild(fragment);

    setStatus(
      currentResults.length +
        (currentResults.length === 1 ? " creator" : " creators") +
        " shown · " +
        currentSourceLabel,
    );
    updatePagination();
    if (shouldFocus) {
      resultsEl.setAttribute("tabindex", "-1");
      resultsEl.focus({ preventScroll: true });
      resultsEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function render(results, sourceLabel) {
    currentResults = results;
    currentSourceLabel = sourceLabel;
    currentPage = 0;
    renderPage(false);
  }

  function loadingDuration(resultCount) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return 250;
    return Math.min(1800, Math.max(750, 650 + resultCount * 90));
  }

  function beginLoading() {
    loadingToken += 1;
    loaderEl.hidden = false;
    resultsEl.setAttribute("aria-busy", "true");
    resultsEl.textContent = "";
    paginationEl.hidden = true;
    setStatus("Reviewing creator profiles…");
    return { token: loadingToken, startedAt: Date.now() };
  }

  function finishLoading(state, results, sourceLabel) {
    var remaining = Math.max(
      0,
      loadingDuration(results.length) - (Date.now() - state.startedAt),
    );
    window.setTimeout(function () {
      if (state.token !== loadingToken) return;
      loaderEl.hidden = true;
      resultsEl.removeAttribute("aria-busy");
      render(results, sourceLabel);
    }, remaining);
  }

  function runSearch() {
    var query = queryInput.value.trim();
    var loadingState = beginLoading();

    if (!endpoint) {
      finishLoading(loadingState, localSearch(query), LABEL_LOCAL);
      return;
    }

    if (inFlight) inFlight.abort();
    var controller = new AbortController();
    inFlight = controller;
    var timedOut = false;
    var timer = setTimeout(function () {
      timedOut = true;
      controller.abort();
    }, SEARCH_TIMEOUT_MS);
    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: query || "creator",
        limit: 8,
      }),
      signal: controller.signal,
    })
      .then(function (response) {
        if (!response.ok) throw new Error("Search unavailable");
        return response.json();
      })
      .then(function (data) {
        var results = Array.isArray(data.results)
          ? data.results.map(normalizeApiCreator)
          : [];
        finishLoading(loadingState, results, LABEL_LIVE);
      })
      .catch(function (error) {
        // A newer search superseded this one: stay silent, let the newer one render.
        if (error.name === "AbortError" && !timedOut) return;
        finishLoading(loadingState, localSearch(query), LABEL_FALLBACK);
      })
      .finally(function () {
        clearTimeout(timer);
        if (inFlight === controller) inFlight = null;
      });
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    runSearch();
  });

  previousButton.addEventListener("click", function () {
    if (currentPage === 0) return;
    currentPage -= 1;
    renderPage(true);
  });

  nextButton.addEventListener("click", function () {
    if ((currentPage + 1) * PAGE_SIZE >= currentResults.length) return;
    currentPage += 1;
    renderPage(true);
  });

  if (dialog) {
    dialog.querySelectorAll("[data-close-dialog]").forEach(function (button) {
      button.addEventListener("click", closeDialog);
    });
    dialog.addEventListener("click", function (event) {
      if (event.target === dialog) closeDialog();
    });
  }

  Array.prototype.forEach.call(
    document.querySelectorAll(".baton-loader > div"),
    function (baton, index) {
      baton.style.setProperty("--baton-index", index);
    },
  );

  if (countEl)
    countEl.textContent = "+" + (creators.length - (creators.length % 50));
  var initialLoadingState = beginLoading();
  finishLoading(initialLoadingState, featuredCreators(), "featured picks");
})();
