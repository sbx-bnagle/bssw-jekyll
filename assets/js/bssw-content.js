/*
 * Content post-processing that the Rails app did server-side in
 * MarkdownUtility.update_images (Parallactic/bssw.io):
 *
 *   - "[caption text]" next to an <img> becomes <span class="caption">
 *   - <img class="... lightbox"> is wrapped in <a data-toggle="lightbox">
 *   - Cloudinary size presets by class (logo / portrait / header) are
 *     emulated with CSS sizing, since images are served from /images.
 *
 * Runs immediately (not on DOM ready) so the bundle's ready handlers see the
 * final markup. Exposed as window.BSSWContent.enhance(root) so the
 * contributor editor's preview can run the exact same transform.
 */
(function () {
  'use strict';

  var CAPTION = /\[(.*?)\]/;

  function addCaption(img) {
    var parent = img.parentNode;
    if (!parent || !CAPTION.test(parent.textContent || '')) return;
    Array.prototype.slice.call(parent.childNodes).forEach(function (child) {
      if (child.nodeType !== 3) return;
      var m = child.nodeValue.match(CAPTION);
      if (!m) return;
      var span = document.createElement('span');
      span.className = 'caption';
      span.textContent = m[1];
      var before = document.createTextNode(child.nodeValue.slice(0, m.index));
      var after = document.createTextNode(child.nodeValue.slice(m.index + m[0].length));
      parent.insertBefore(before, child);
      parent.insertBefore(span, child);
      parent.insertBefore(after, child);
      parent.removeChild(child);
    });
  }

  function addLightbox(img) {
    var link = document.createElement('a');
    link.href = img.getAttribute('src');
    link.setAttribute('data-toggle', 'lightbox');
    img.parentNode.insertBefore(link, img);
    link.appendChild(img);
  }

  function sizePreset(img) {
    var cls = ' ' + img.className + ' ';
    if (cls.indexOf(' logo ') >= 0) {           // w_200,h_200,c_fit
      img.style.maxWidth = '200px';
      img.style.maxHeight = '200px';
    } else if (cls.indexOf(' portrait ') >= 0) { // w_600,h_600,c_fill
      img.style.aspectRatio = '1 / 1';
      img.style.objectFit = 'cover';
      img.style.maxWidth = '600px';
    } else if (cls.indexOf(' header ') >= 0) {   // w_1600,h_585,c_fill
      img.style.aspectRatio = '1600 / 585';
      img.style.objectFit = 'cover';
    }
  }

  function enhance(root) {
    var imgs = (root || document).querySelectorAll('.content img');
    Array.prototype.forEach.call(imgs, function (img) {
      if (img.getAttribute('data-bssw-enhanced')) return;
      img.setAttribute('data-bssw-enhanced', '1');
      sizePreset(img);
      addCaption(img);
      if (/\blightbox\b/.test(img.className) && !(img.parentNode && img.parentNode.getAttribute('data-toggle') === 'lightbox')) {
        addLightbox(img);
      }
    });
  }

  window.BSSWContent = { enhance: enhance };
  enhance(document);
})();
