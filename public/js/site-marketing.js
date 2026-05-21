(function () {
  'use strict';

  function initSiteHeader() {
    var header = document.querySelector('.site-header');
    if (!header) return;
    var toggle = document.getElementById('siteNavToggle');
    var drawer = document.getElementById('siteNavDrawer');
    var overlay = document.getElementById('siteNavOverlay');

    var alwaysSolid = document.body.classList.contains('site-subpage');

    function setScrolled() {
      if (alwaysSolid) {
        header.classList.add('site-header--solid');
        return;
      }
      var y = window.scrollY || document.documentElement.scrollTop;
      header.classList.toggle('site-header--solid', y > 48);
    }

    setScrolled();
    window.addEventListener('scroll', setScrolled, { passive: true });

    function closeDrawer() {
      if (!toggle || !drawer) return;
      toggle.setAttribute('aria-expanded', 'false');
      drawer.classList.remove('is-open');
      if (overlay) overlay.classList.remove('is-open');
      document.body.classList.remove('site-nav-open');
    }

    function openDrawer() {
      if (!toggle || !drawer) return;
      toggle.setAttribute('aria-expanded', 'true');
      drawer.classList.add('is-open');
      if (overlay) overlay.classList.add('is-open');
      document.body.classList.add('site-nav-open');
    }

    if (toggle && drawer) {
      toggle.addEventListener('click', function () {
        var open = toggle.getAttribute('aria-expanded') === 'true';
        if (open) closeDrawer();
        else openDrawer();
      });
    }
    if (overlay) overlay.addEventListener('click', closeDrawer);

    if (drawer) {
      drawer.querySelectorAll('a').forEach(function (a) {
        a.addEventListener('click', closeDrawer);
      });
    }
  }

  function initScrollReveal() {
    var nodes = document.querySelectorAll('.reveal-on-scroll');
    if (!nodes.length || !('IntersectionObserver' in window)) {
      nodes.forEach(function (el) {
        el.classList.add('is-visible');
      });
      return;
    }
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            io.unobserve(entry.target);
          }
        });
      },
      { root: null, rootMargin: '0px 0px -12% 0px', threshold: 0.08 }
    );
    nodes.forEach(function (el) {
      io.observe(el);
    });
  }

  function initHeroParallax() {
    var hero = document.querySelector('.hero');
    var mark = document.querySelector('.hero-watermark');
    if (!hero || !mark) return;
    function tick() {
      var y = window.scrollY || document.documentElement.scrollTop;
      var heroRect = hero.getBoundingClientRect();
      var progress = Math.max(0, Math.min(1, 1 - heroRect.bottom / (heroRect.height + window.innerHeight * 0.5)));
      var offset = y * 0.12 + progress * 8;
      mark.style.setProperty('--parallax-y', offset.toFixed(1) + 'px');
    }
    tick();
    window.addEventListener('scroll', tick, { passive: true });
    window.addEventListener('resize', tick, { passive: true });
  }

  function initFounderSection() {
    var wrap = document.getElementById('founderSection');
    if (!wrap) return;
    var quoteEl = document.getElementById('founderQuoteSlot');
    var photoSlot = document.getElementById('founderPhotoSlot');
    var DEFAULT =
      "Great teams are not built on policies, but on trust, vision, and the courage to grow together.";
    var quote = DEFAULT;
    try {
      var stored = localStorage.getItem('founder_quote');
      if (stored) quote = stored;
    } catch (_e) {}
    if (quoteEl) quoteEl.textContent = quote;
    var photo = null;
    try {
      photo = localStorage.getItem('founder_photo');
    } catch (_e2) {}
    if (photoSlot) {
      photoSlot.innerHTML = '';
      if (photo) {
        var img = document.createElement('img');
        img.className = 'founder-section__photo';
        img.alt = '';
        img.src = photo;
        photoSlot.appendChild(img);
      } else {
        var div = document.createElement('div');
        div.className = 'founder-section__initials';
        div.textContent = 'AM';
        div.setAttribute('aria-hidden', 'true');
        photoSlot.appendChild(div);
      }
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    initSiteHeader();
    initScrollReveal();
    initHeroParallax();
    initFounderSection();
  });
})();
