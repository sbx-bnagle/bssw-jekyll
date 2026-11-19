/*
 * Live preview bridge for the contributor editor.
 *
 * /preview/blog-post is a real Jekyll render of _layouts/blog_post.html, so
 * the preview uses the production CSS, fonts and JS. The editor embeds it in
 * an iframe and posts the draft:
 *
 *   iframe.contentWindow.postMessage({
 *     type: 'bssw:preview',
 *     post: { title, date, authors: [slug], deck_html, topics: [slug],
 *             tracks: [slug], hero_image, hero_image_caption, body_html,
 *             authors_data: { slug: {name} } }   // optional, for new authors
 *   }, 'https://bssw.io');
 *
 * The frame answers {type:'bssw:preview-ready'} on load and
 * {type:'bssw:preview-rendered', height} after each render.
 * Markup produced here mirrors the Liquid includes (author_list, topics,
 * blog_post hero/meta); keep them in sync.
 */
(function () {
  'use strict';

  var DATA = JSON.parse(document.getElementById('bssw-data').textContent);
  // Site may be served from a subpath (GitHub Pages project site). Templates
  // use root-relative links as on bssw.io; prefix them with the base path.
  var BASE = (document.documentElement.getAttribute('data-baseurl') || '').replace(/\/$/, '');
  function rebase(html) {
    if (!BASE) return html;
    return String(html).replace(/(\s(?:href|src)=)(["'])\/(?!\/)/g, function (m, attr, q, offset, str) {
      return str.substr(offset + m.length, BASE.length) === BASE.slice(1) + '/' ? m : attr + q + BASE + '/';
    }).replace(/(url\(\s*["']?)\/(?!\/)/g, '$1' + BASE + '/');
  }
  var allowed = [];
  try { allowed = JSON.parse(document.body.getAttribute('data-preview-origins') || '[]'); } catch (e) { allowed = []; }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function sentence(list) {
    if (list.length < 2) return list.join('');
    if (list.length === 2) return list[0] + ' and ' + list[1];
    return list.slice(0, -1).join(', ') + ', and ' + list[list.length - 1];
  }
  function crumb(title) { // rails_crumb
    return title.slice(0, 35).replace(/\s\w+\s*$/, '...');
  }
  function fmtDate(iso) {
    if (!iso) return '';
    var p = String(iso).split('-').map(Number);
    var d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    return d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }) + ' ' + String(p[2]).padStart(2, '0') + ', ' + p[0];
  }

  function authorsHTML(slugs) {
    if (!slugs || !slugs.length) return 'BSSw Community';
    return sentence(slugs.map(function (s) {
      var a = DATA.authors[s] || { name: s };
      return '<a class=\'author\' href=\'/items?author=' + esc(s) + '\'>' + esc(a.name) + '</a>';
    }));
  }

  function topicsHTML(slugs) { // _includes/topics.html
    if (!slugs || !slugs.length) return '';
    var byCat = [];
    slugs.forEach(function (t) {
      DATA.categories.forEach(function (c) {
        if (c.topics.some(function (x) { return x.slug === t; }) && byCat.indexOf(c) < 0) byCat.push(c);
      });
    });
    var i = 0;
    var inner = byCat.map(function (c) {
      var subs = slugs.map(function (t) { return c.topics.filter(function (x) { return x.slug === t; })[0]; })
        .filter(Boolean).map(function (topic) {
          return '\n\t\t\t    <div class="sub-topic" id="sub-topic-' + (i++) + '"><a href="/items?topic=' + topic.slug + '">' + esc(topic.name) + '</a>\n\t\t\t    </div>';
        }).join('');
      return '\n\t\t\t<div class="topic">\n\t\t\t    <a href="/items?category=' + c.slug + '">' + esc(c.name) + '</a>\n\t\t\t</div>' + subs;
    }).join('');
    return '\n    <div class="topics-wrapper">\n\t<div class="topics">\n\t    <div class="row">\n\t\t<span class="topics-heading">TOPICS</span>' + inner + '\n\t    </div>\n\t</div>\n    </div>\n';
  }

  function tracksHTML(slugs) {
    if (!slugs || !slugs.length) return '';
    var links = slugs.map(function (s) {
      var t = DATA.tracks.filter(function (x) { return x.slug === s; })[0];
      return '<a href="/blog_posts?track=' + esc(s) + '">' + esc(t ? t.name : s) + '</a>';
    });
    return '\n\t<div class="row">\n\t    <div class="col-xl-6">\n\t\t<div class="small-caps">\n\t\t    <strong>Track</strong>\n\t\t    ' + sentence(links) + '\n\t\t</div>\n\t    </div>\n\t</div>';
  }

  function heroHTML(post) {
    if (post.hero_image) {
      return '\n    <div class="container blog-image-container">\n\t<div class=\'image-wrapper\' style=\'background-image:url(' + esc(post.hero_image) + '); \'></div>\n\t<div class="row">\n\t    <div class="col-xl-12 col-lg-12 col-md-12 col-sm-12 col-12">\n\t\t<p class=\'caption\'>\n\t\t    ' + esc(post.hero_image_caption || '') + '</p>\n\t    </div>\n\t</div>\n    </div>';
    }
    return '\n\t<div class="row">\n\t    <div class="col-xl-9 col-lg-9 col-md-12 col-sm-12 col-12">\n\t\t<div class="post-content">\n\t\t    <p>' + (post.deck_html || '') + '</p>\n\t\t</div>\n\t    </div>\n    </div>';
  }

  function render(post) {
    // Authors added in the draft branch aren't in this build's data yet.
    if (post.authors_data) Object.keys(post.authors_data).forEach(function (k) { DATA.authors[k] = post.authors_data[k]; });
    var heading = document.querySelector('.page-heading');
    heading.querySelector('h1').textContent = post.title || 'Untitled draft';
    heading.querySelector('.breadcrumbs li.active').textContent = '        ' + crumb(post.title || 'Untitled draft');
    document.title = post.title || 'Untitled draft';

    var heroCol = document.querySelector('.single-post-hero .container > .row > .col-xl-12');
    heroCol.innerHTML = rebase(heroHTML(post));

    var meta = document.querySelector('.blog-meta');
    var cols = meta.querySelectorAll(':scope > .row:first-child > div');
    cols[0].querySelector('.small-caps').innerHTML = '<strong>Published</strong>' + fmtDate(post.date);
    cols[1].querySelector('.small-caps').innerHTML = rebase('\n\t\t\t<strong>\n\t\t\t    Author' + ((post.authors || []).length > 1 ? 's' : '') + '</strong>\n\t\t\t' + authorsHTML(post.authors));
    cols[2].innerHTML = rebase(topicsHTML(post.topics));
    Array.prototype.slice.call(meta.querySelectorAll(':scope > .row')).slice(1).forEach(function (r) { r.remove(); });
    meta.insertAdjacentHTML('beforeend', rebase(tracksHTML(post.tracks)));

    var content = document.querySelector('.post-event-content .content');
    content.innerHTML = rebase((post.hero_image ? '<p>' + (post.deck_html || '') + '</p>\n' : '') + (post.body_html || ''));
    if (window.BSSWContent) window.BSSWContent.enhance(content.parentNode);

    var footer = document.querySelector('.blog-post-footer');
    if (footer) footer.innerHTML = '';
  }

  window.addEventListener('message', function (e) {
    if (allowed.indexOf(e.origin) < 0) return;
    var msg = e.data;
    if (!msg || msg.type !== 'bssw:preview' || !msg.post) return;
    render(msg.post);
    e.source.postMessage({ type: 'bssw:preview-rendered', height: document.documentElement.scrollHeight }, e.origin);
  });

  if (window.parent !== window) {
    allowed.forEach(function (origin) {
      try { window.parent.postMessage({ type: 'bssw:preview-ready' }, origin); } catch (err) { /* origin mismatch */ }
    });
  }
  window.BSSWPreview = { render: render }; // for local testing from the console
})();
