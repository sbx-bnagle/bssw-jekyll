/*
 * Client-side equivalents of the Rails listing views, so the original
 * query-string URLs keep working on a static host:
 *
 *   /items?topic=<slug> | ?category=<slug> | ?recent=true | ?author=<slug>
 *   /items/search?search_string=<q>
 *   /blog_posts?track=<slug>
 *   /events?past=true
 *
 * Markup mirrors app/views/resources/*, blog_posts/*, events/* in
 * Parallactic/bssw.io. Data comes from the inline #bssw-data JSON
 * (see _includes/site_json.html).
 */
(function () {
  'use strict';

  var dataEl = document.getElementById('bssw-data');
  if (!dataEl) return;
  var DATA = JSON.parse(dataEl.textContent);
  var params = new URLSearchParams(window.location.search);
  var root = document.getElementById('bssw-listing');
  var listing = document.body.getAttribute('data-listing') ||
    (root && root.getAttribute('data-listing')) || 'items';

  // Site may be served from a subpath (GitHub Pages project site). Templates
  // use root-relative links as on bssw.io; prefix them with the base path.
  var BASE = (document.documentElement.getAttribute('data-baseurl') || '').replace(/\/$/, '');
  function rebase(html) {
    if (!BASE) return html;
    return String(html).replace(/(\s(?:href|src)=)(["'])\/(?!\/)/g, function (m, attr, q, offset, str) {
      return str.substr(offset + m.length, BASE.length) === BASE.slice(1) + '/' ? m : attr + q + BASE + '/';
    }).replace(/(url\(\s*["']?)\/(?!\/)/g, '$1' + BASE + '/');
  }
  var ORIGIN = window.location.origin + BASE;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function topicIndex() {
    var idx = {};
    DATA.categories.forEach(function (c) {
      c.topics.forEach(function (t) { idx[t.slug] = { topic: t, category: c }; });
    });
    return idx;
  }
  var TOPICS = topicIndex();

  function topicList(item) {
    return (item.topics || []).map(function (s) { return TOPICS[s] ? TOPICS[s].topic.name : s; }).join(', ');
  }

  function byTitle(a, b) {
    return a.title.localeCompare(b.title, 'en', { sensitivity: 'base' });
  }

  // Rails standard_scope: pinned first, then name ASC.
  function standardSort(items) {
    return items.slice().sort(function (a, b) {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return byTitle(a, b);
    });
  }

  function byDateDesc(a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; }

  function formatDate(iso, longMonth) {
    var p = iso.split('-').map(Number);
    var d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    var month = d.toLocaleString('en-US', { month: longMonth ? 'long' : 'short', timeZone: 'UTC' });
    var day = longMonth ? String(p[2]) : String(p[2]).padStart(2, '0');
    return month + ' ' + day + ', ' + p[0];
  }

  // ---------------------------------------------------------- templates --

  function pagination(n, where) {
    return '<div>\n  <div class="pagination pagination-' + where + ' col-md-12">\n  1-' + n + ' of ' + n +
      ' Items\n  </div>\n</div>\n';
  }

  // resources/_listing
  function listingRow(item, opts) {
    var href = ORIGIN + '/items/' + item.slug;
    var meta;
    if (opts.recent) {
      meta =
        '\t\t<div class=\'col-3\'>\n\t\t  <p class="small-caps">\n\t\t    ' + formatDate(item.date, true) +
        '\n\t\t  </p>\n\t\t</div>\n\t        <div class="col-3">\n\t\t  <p class="small-caps">\n\t\t    <strong>Type of Item</strong>\n\t\t    ' +
        esc(item.type) + '\n\t\t  </p>\n\t\t</div>\n\t\t<div class=\'col-6\t\'>\n\t\t  <p class="small-caps">\n\t\t    <strong>Topics:</strong>\n\t\t    ' +
        esc(topicList(item)) + '\n\t\t  </p>\n\t\t</div>\n';
    } else {
      meta =
        '\t\t<div class="col-xl-12 col-lg-12 col-md-12 col-sm-12 col-12">\n\t\t  <p class="topics small-caps">\n' +
        '                      <strong>&nbsp; </strong>\n\t\t    ' + esc(topicList(item)) + '\n\t\t  </p>\n\t\t</div>\n';
    }
    return '  <div class="resource">\n    <div class="container">\n      <a href="' + href + '">\n\t<div class="row">\n' +
      '          <div class="col-xl-12 col-lg-12 col-md-12 col-sm-12 col-12">\n' +
      (item.pinned && !opts.recent ? '              <span class="recommended"><span class="dot"></span> Recommended</span>\n' : '') +
      '            <div class="row">\n              <div class="col-xl-12 col-lg-12 col-md-12 col-sm-12 col-12">\n\t\t<h3>' +
      esc(item.title) + '</h3>\n              </div>\n            </div>\n            <div class="row">\n' + meta +
      '            </div>\n          </div>\n\t</div>\n      </a>\n    </div>\n  </div>\n';
  }

  // resources/_author_listing
  function authorRow(item) {
    return '<div class="resource search-row">\n    <div class="container">\n\t<a href="' + ORIGIN + '/items/' + item.slug + '">\n' +
      '\t    <div class="row">\n\t\t<div class="col-xl-12 col-lg-12 col-md-12 col-sm-12 col-12">\n\t\t    <h3>' + esc(item.title) +
      '\n\t\t    </h3>\n\t\t</div>\n\t    </div>\n\t    <div class="row">\n\t\t<div class="col-xl-12 col-lg-12 col-md-12 col-sm-12 col-12">\n' +
      '\t\t    <p class="small-caps">\n\t\t\t<strong>Type of Item</strong>\n\t\t\t    ' + esc(item.type) +
      '\n\t\t    </p>\n\t\t</div>\n\t    </div>\n\t</a>\n    </div>\n</div>\n';
  }

  function breadcrumbs() {
    return '\t\t\t    <div class="page-heading all"> \n\t\t\t\t<div class="breadcrumbs">\n\t\t\t\t    <ul>\n' +
      '\t\t\t\t\t<li><a href="/">Home</a></li>\n\t\t\t\t\t<li><a href="/items">Resources</a></li>\n\t\t\t\t    </ul>\n\t\t\t\t</div>\n';
  }

  function sidebarHTML() {
    var sb = document.querySelector('.sidebar-col');
    return sb ? sb.outerHTML : '';
  }

  // resources/index (topic / category / recent / all)
  function renderIndex(opts) {
    var items = DATA.items.slice();
    var heading;
    if (opts.topic) {
      var t = TOPICS[opts.topic];
      items = items.filter(function (i) { return (i.topics || []).indexOf(opts.topic) >= 0; });
      heading = '\t\t\t\t    <h1>' + esc(t ? t.topic.name : opts.topic) + '</h1>\n\t\t\t\t    ' + esc(t ? t.topic.overview : '') + '\n';
    } else if (opts.category) {
      var cat = DATA.categories.filter(function (c) { return c.slug === opts.category; })[0];
      var slugs = cat ? cat.topics.map(function (x) { return x.slug; }) : [];
      items = items.filter(function (i) { return (i.topics || []).some(function (s) { return slugs.indexOf(s) >= 0; }); });
      heading = '\t\t\t\t    <h1>' + esc(cat ? cat.name : opts.category) + '</h1>\n\t\t\t\t    <p> \n' + esc(cat ? cat.overview : '') + '</p>\n';
    } else if (opts.recent) {
      heading = '\t\t\t\t    <h1>Recent Resources</h1>\n';
    } else {
      heading = '\t\t\t\t    <h1 class="all_resources">All Resources</h1>\n';
    }
    items = opts.recent ? items.sort(byDateDesc) : standardSort(items);
    var mainClass = (opts.topic || opts.category) ? '' : 'all_resources_page';
    var colClass = opts.recent ? '' : 'col-xl-9 col-lg-9 col-md-9';
    return '<div class="container">\n    <div class="row">\n\t<div class="main ' + mainClass + '" >\n\t    <div class="container">\n\t\t<div class="row">\n' +
      '\t\t    <div class="' + colClass + ' col-sm-12 col-12">\n' + breadcrumbs() + heading + '\t\t\t    </div>\n' +
      '\t\t\t    <div id=\'resources\' >\n' + pagination(items.length, 'top') + '<div class="resources">\n' +
      items.map(function (i) { return listingRow(i, opts); }).join('') + '</div>\n' + pagination(items.length, 'bottom') +
      '\t\t\t    </div>\n\t\t    </div>\n' + (opts.recent ? '' : sidebarHTML()) +
      '\n\t\t</div>\n\t    </div>\n\t</div>    \n    </div>\n</div>\n';
  }

  // resources/_author_hero + author listing
  function renderAuthor(slug) {
    var a = DATA.authors[slug] || { name: slug };
    var items = DATA.items.filter(function (i) { return (i.authors || []).indexOf(slug) >= 0; }).sort(byDateDesc);
    var counts = { Resource: 0, 'Blog Post': 0, Event: 0 };
    items.forEach(function (i) { counts[i.type] = (counts[i.type] || 0) + 1; });
    function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }
    var listings = [
      counts.Resource ? plural(counts.Resource, 'resource') : null,
      counts['Blog Post'] ? plural(counts['Blog Post'], 'blog post') : null,
      counts.Event ? plural(counts.Event, 'event') : null
    ].filter(Boolean).join(', ');
    var website = a.website || (a.github ? 'https://github.com/' + a.github : null);
    var hero =
      '<div class="main post-event-hero fellows-hero">\n    <div class="container">\n\t<div class="row">\n\t    <div class="col-12">\n' +
      '\t\t<div class="page-heading">\n\t\t    <div class="row">\n\t\t\t<div class="col-12">\n\t\t\t    <div class="breadcrumbs">\n\t\t\t\t<ul>\n' +
      '\t\t\t\t    <li><a href="/">Home</a></li>\n\t\t\t\t    <li><a href="/items/contributors">Contributors</a></li>\n' +
      '\t\t\t\t    <li class="active"> ' + esc(a.name) + '</li>\n\t\t\t\t</ul>\n\t\t\t    </div>\n\t\t\t</div>\n\t\t    </div>\n' +
      '\t\t    <h1 > ' + esc(a.name) + '</h1>\n\t\t</div>\n\t\t<div class="row">\n' +
      (a.avatar ? '\t\t\t<div class=\'col-xl-3 col-lg-3 col-md-5 col-sm-12 col-12\'>\n\t\t\t    <img class="fellows-photo" src="' + esc(a.avatar) + '" />\n\t\t\t</div>\n' : '') +
      '\t\t    <div class="col-xl-8 col-lg-8 col-md-7 col-sm-12 col-12">\n\t\t\t<div class="fellows-info">\n\t\t\t    <div class="fellows-info-inner">\n\t\t\t\t<p>\n' +
      (a.affiliation ? '\t\t\t\t\t<strong>Affiliation(s):</strong> ' + esc(a.affiliation) + '<br />\n' : '') +
      '\t\t\t\t    <strong>Contribution' + (items.length === 1 ? '' : 's') + ':</strong>\n\t\t\t\t    ' + listings + '\n\t\t\t\t</p>\n' +
      (website ? '\t\t\t\t\t<p class="offsite mt-0"><a href="' + esc(website) + '">' + (/github\.com/.test(website) ? 'GitHub' : 'Website') + '</a></p>\n' : '') +
      '\t\t\t    </div>\n\t\t\t</div>\n\t\t    </div>\n\t\t</div>\n\t    </div>\n\t    <p style="clear: both;"></p>\n\t</div>\t    \n    </div>\n</div>\n';
    // Rails' markup closes the column before #resources (unbalanced ERB); kept as-is.
    var body =
      '<div class="container">\n    <div class="row">\n\t<div class="main " >\n\t    <div class="container">\n\t\t<div class="row">\n' +
      '\t\t    <div class="col-xl-9 col-lg-9 col-md-9 col-sm-12 col-12">\n\t\t\t    </div>\n' +
      '\t\t\t    <div id=\'resources\' class=\'container\'>\n' + pagination(items.length, 'top') + '<div class="resources">\n' +
      items.map(authorRow).join('') + '</div>\n' + pagination(items.length, 'bottom') + '\t\t\t    </div>\n' +
      '\t\t</div>\n\t    </div>\n\t</div>    \n    </div>\n</div>\n';
    document.title = a.name;
    return hero + body;
  }

  // ------------------------------------------------------------- search --

  function searchTerms(q) {
    var terms = [];
    q.replace(/"([^"]+)"|(\S+)/g, function (_, phrase, word) { terms.push((phrase || word).toLowerCase()); });
    return terms;
  }

  function highlight(text, terms) {
    var out = esc(text);
    terms.forEach(function (t) {
      var re = new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig');
      out = out.replace(re, '<mark>$1</mark>');
    });
    return out;
  }

  // ~10-word excerpt around the first hit, like Algolia's attributesToSnippet.
  function snippet(text, terms) {
    var words = (text || '').split(/\s+/);
    var lower = words.map(function (w) { return w.toLowerCase(); });
    var at = 0;
    for (var i = 0; i < lower.length; i++) {
      if (terms.some(function (t) { return lower[i].indexOf(t.split(' ')[0]) >= 0; })) { at = i; break; }
    }
    var from = Math.max(0, at - 5);
    var chunk = words.slice(from, from + 12).join(' ');
    return (from > 0 ? '\u2026 ' : '') + highlight(chunk, terms) + (from + 12 < words.length ? ' \u2026' : '');
  }

  function authorNames(item) {
    var names = (item.authors || []).map(function (s) { return (DATA.authors[s] || {}).name || s; });
    if (!names.length) return 'BSSw Community';
    if (names.length < 3) return names.join(' and ');
    return names.slice(0, -1).join(', ') + ', and ' + names[names.length - 1];
  }

  function trackNames(item) {
    var names = (item.tracks || []).map(function (s) {
      var t = DATA.tracks.filter(function (x) { return x.slug === s; })[0];
      return t ? t.name : s;
    });
    if (names.length < 3) return names.join(' and ');
    return names.slice(0, -1).join(', ') + ', and ' + names[names.length - 1];
  }

  // resources/_search_result
  function searchRow(item, terms) {
    var facets = ['location', 'organizers'].filter(function (f) { return item[f]; }).map(function (f) {
      return '\t\t\t\t\t<p class=\'small-caps\'><strong>' + f + '</strong>\n\t\t\t\t\t    ' + highlight(item[f], terms) + '\n\t\t\t\t\t</p>\n';
    }).join('');
    return '<div class="event-blog-row search-row">\n    <div class="container">\n\t<div class="row">\n\t    <div class="col-xl-12 col-lg-12 col-md-12 col-sm-12 col-12">\n' +
      '\t\t<a href="' + ORIGIN + '/items/' + item.slug + '">\n\t\t    <div class="row">\n\t\t\t<div class="col-xl-12 col-lg-12 col-md-12 col-sm-12 col-12">\n' +
      '\t\t\t    <h3>\n\t\t\t\t' + highlight(item.title, terms) + '\n\t\t\t    </h3>\n' +
      ((item.tracks || []).length ? '\t\t\t\t    <h4>' + esc(trackNames(item)) + '\n\t\t\t\t    </h4>\n' : '') +
      '\t\t\t</div>\n\t\t    </div>\n\t\t    <div class="row">\n\t\t\t<div class="col-xl-12 col-lg-12 col-md-12 col-sm-12 col-12">\n' +
      '\t\t\t    <p class="search-results-content">\n\t\t\t\t<p class=\'small-caps\'>\n\t\t\t\t    By ' + highlight(authorNames(item), terms) + '\n\t\t\t\t</p>\n' +
      facets +
      '\t\t\t\t<p class=\'search-results-content\'>\n\t\t\t\t    ' + snippet(item.text, terms) + '\n\t\t\t\t</p>\n' +
      '\t\t\t\t<p class="topics small-caps">\n\t\t\t\t    <strong>Type of Item</strong>\n\t\t\t\t\t' + esc(item.type) + '\n\t\t\t\t</p>\n' +
      (item.date ? '\t\t\t\t    <p class=\'topics small-caps\'\n\t\t\t\t    >\n\t\t\t\t\t<strong>Published</strong>\n\t\t\t\t\t' + item.date + '\n\t\t\t\t    </p>\n' : '') +
      '\t\t\t</div>\n\t\t    </div>\n\t\t</a>\n\t    </div>\n\t</div>\n    </div>\n</div>\n';
  }

  function renderSearch(q) {
    var terms = searchTerms(q);
    var results = DATA.items.filter(function (i) {
      var hay = [i.title, topicList(i), authorNames(i), i.location, i.organizers, i.text].join(' ').toLowerCase();
      return terms.length && terms.every(function (t) { return hay.indexOf(t) >= 0; });
    }).sort(byDateDesc);
    var deck = document.querySelector('.hero-search .deck');
    if (deck) {
      deck.innerHTML = results.length
        ? '\n\t    <p>\n\t\tResults found for <i>' + esc(q) + '</i> (' + results.length + ')\n\t    </p>\n'
        : '\n\t    <p>No results found </p>\n';
    }
    var list = document.querySelector('#resources .resources');
    if (list) list.innerHTML = rebase(results.map(function (i) { return searchRow(i, terms); }).join(''));
    document.querySelectorAll('#resources .pagination').forEach(function (p) {
      p.innerHTML = '\n  1-' + results.length + ' of ' + results.length + ' Items\n  ';
    });
  }

  // ------------------------------------------------------------- blog ----

  function renderTrack(slug) {
    var track = DATA.tracks.filter(function (t) { return t.slug === slug; })[0];
    document.querySelectorAll('#posts .event-blog-row').forEach(function (row) {
      var tracks = (row.getAttribute('data-tracks') || '').split(' ');
      if (tracks.indexOf(slug) < 0) row.parentNode.removeChild(row);
      else {
        var h4 = row.querySelector('h4');
        if (h4) h4.parentNode.removeChild(h4); // Rails hides track labels when filtering
      }
    });
    var h1 = document.querySelector('.hero h1');
    if (h1 && track) h1.textContent = track.name;
    var deck = document.querySelector('.hero .col-xl-9 > p');
    if (deck && track) deck.innerHTML = '<p>' + esc(track.description) + '</p>';
  }

  // ------------------------------------------------------------ events ---

  // events/index?past=true: Past Events hero, "View Upcoming Events", past rows.
  function showPastEvents() {
    var heroTpl = document.getElementById('events-past-hero');
    var rowsTpl = document.getElementById('events-past-rows');
    var hero = document.querySelector('.hero');
    if (heroTpl && hero) hero.parentNode.replaceChild(heroTpl.content.cloneNode(true), hero);
    var link = document.querySelector('.events-sub-nav .nav-link');
    if (link) { link.setAttribute('href', BASE + '/events'); link.textContent = 'View Upcoming Events'; }
    var events = document.getElementById('events');
    if (rowsTpl && events) {
      events.innerHTML = '';
      events.appendChild(rowsTpl.content.cloneNode(true));
    }
    document.title = 'Past Events';
  }

  // ---------------------------------------------------------- dispatch ---

  function replaceRoot(html) {
    if (!root) return;
    var tmp = document.createElement('div');
    tmp.innerHTML = rebase(html);
    var frag = document.createDocumentFragment();
    while (tmp.firstChild) frag.appendChild(tmp.firstChild);
    root.parentNode.replaceChild(frag, root);
  }

  if (listing === 'items') {
    if (params.get('author')) replaceRoot(renderAuthor(params.get('author')));
    else if (params.get('topic')) replaceRoot(renderIndex({ topic: params.get('topic') }));
    else if (params.get('category')) replaceRoot(renderIndex({ category: params.get('category') }));
    else if (params.get('recent')) replaceRoot(renderIndex({ recent: true }));
    // Rails' application.js opens the sidebar section for the current topic
    // at document-ready; re-run it against the re-rendered sidebar.
    var which = window.location.pathname.replace(/\/$/, '') + window.location.search;
    if (window.jQuery && window.location.search) {
      var $ = window.jQuery;
      $(function () {
        var link = $('a[href=\'' + which + '\']');
        link.parent().addClass('active').parent().parent().parent().addClass('show');
        link.parent().addClass('active').parent().parent().parent().siblings().children().children().removeClass('collapsed');
      });
    }
  } else if (listing === 'search') {
    renderSearch(params.get('search_string') || '');
  } else if (listing === 'blog' && params.get('track')) {
    renderTrack(params.get('track'));
  } else if (listing === 'events' && params.get('past') === 'true') {
    showPastEvents();
  }
})();
