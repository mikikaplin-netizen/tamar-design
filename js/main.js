(function () {
  const canvas = document.getElementById('bg-canvas');
  const ctx = canvas.getContext('2d');
  const sectionEls = Array.from(document.querySelectorAll('.stage-section'));
  const indicatorEls = Array.from(document.querySelectorAll('.indicator-line'));
  const hamburgerBtn = document.getElementById('hamburger-btn');
  const menuOverlay = document.getElementById('menu-overlay');

  const sections = sectionEls.map((el, i) => ({
    el,
    index: i,
    frameDir: el.dataset.frameDir,
    frameCount: parseInt(el.dataset.frameCount, 10),
    contentEl: el.querySelector('.section-content'),
    images: [],
    loading: false,
  }));

  function pad(n) {
    return String(n).padStart(4, '0');
  }

  // Loading every frame of every section at once (5 sections x 76 frames of
  // decoded image data) is enough memory pressure to make scrolling stall and
  // can push mobile browsers to silently drop already-decoded images. So we
  // only ever keep the active section and its two neighbors in memory, and we
  // trickle each section's requests in through a small queue instead of
  // firing 76 at once.
  const MAX_CONCURRENT_LOADS = 8;

  function loadSection(section) {
    if (!section || section.loading || section.images.length) return;
    section.loading = true;
    section.loadGen = (section.loadGen || 0) + 1;
    const gen = section.loadGen;
    const urls = [];
    for (let i = 1; i <= section.frameCount; i++) urls.push(`${section.frameDir}/${pad(i)}.jpg`);
    section.images = new Array(urls.length);

    let nextIndex = 0;
    function loadNext() {
      if (section.loadGen !== gen || nextIndex >= urls.length) return;
      const i = nextIndex++;
      const img = new Image();
      img.decoding = 'async';
      img.onload = img.onerror = loadNext;
      img.src = urls[i];
      section.images[i] = img;
    }

    for (let k = 0; k < Math.min(MAX_CONCURRENT_LOADS, urls.length); k++) loadNext();
  }

  function unloadSection(section) {
    if (!section) return;
    section.loadGen = (section.loadGen || 0) + 1; // invalidate any in-flight loader
    section.images.forEach((img) => {
      if (img) img.src = '';
    });
    section.images = [];
    section.loading = false;
  }

  function syncLoadedWindow(centerIndex) {
    const keep = new Set([centerIndex - 1, centerIndex, centerIndex + 1]);
    sections.forEach((section, i) => {
      if (keep.has(i)) loadSection(section);
      else unloadSection(section);
    });
  }

  // Preload the first section immediately, and prime the next one.
  syncLoadedWindow(0);

  let dpr = 1;

  function resizeCanvas() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
  }

  function drawImageCover(img) {
    if (!img || !img.complete || !img.naturalWidth) return;
    const cw = window.innerWidth;
    const ch = window.innerHeight;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const scale = Math.max(cw / iw, ch / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    const dx = (cw - dw) / 2;
    const dy = (ch - dh) / 2;
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(img, dx, dy, dw, dh);
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function easeInCubic(t) {
    return t * t * t;
  }

  // Returns how the fixed text block should look for a given scroll progress
  // (0-1) through its section: it fades and slides gently into its resting
  // spot, holds still while the section is active, then fades out the same way.
  function textStateFor(progress, isFirst, isLast) {
    const ENTRY_END = 0.15;
    const EXIT_START = 0.85;
    const SLIDE_PX = 28;

    if (!isFirst && progress < ENTRY_END) {
      const eased = easeOutCubic(progress / ENTRY_END);
      return { opacity: eased, translateY: (1 - eased) * SLIDE_PX };
    }
    if (!isLast && progress > EXIT_START) {
      const eased = easeInCubic((progress - EXIT_START) / (1 - EXIT_START));
      return { opacity: 1 - eased, translateY: -eased * SLIDE_PX };
    }
    return { opacity: 1, translateY: 0 };
  }

  let lastDrawnImage = null;
  let activeIndex = -1;
  let ticking = false;

  function update() {
    ticking = false;
    const scrollY = window.scrollY;
    let newActive = activeIndex;

    sections.forEach((section) => {
      const start = section.el.offsetTop;
      const height = section.el.offsetHeight;
      const isLast = section.index === sections.length - 1;
      const within = isLast ? scrollY >= start : scrollY >= start && scrollY < start + height;

      if (within) {
        newActive = section.index;
        const progress = Math.min(1, Math.max(0, (scrollY - start) / height));
        const frameIndex = Math.min(section.frameCount - 1, Math.floor(progress * section.frameCount));
        const img = section.images[frameIndex];
        if (img && img.complete && img.naturalWidth) {
          drawImageCover(img);
          lastDrawnImage = img;
        } else if (lastDrawnImage) {
          drawImageCover(lastDrawnImage);
        }
        if (section.contentEl) {
          const isFirst = section.index === 0;
          const state = textStateFor(progress, isFirst, isLast);
          section.contentEl.style.opacity = String(state.opacity);
          section.contentEl.style.transform = `translateY(${state.translateY}px)`;
          section.contentEl.style.visibility = state.opacity > 0.01 ? 'visible' : 'hidden';
        }
      } else if (section.contentEl) {
        section.contentEl.style.opacity = '0';
        section.contentEl.style.visibility = 'hidden';
      }
    });

    if (newActive !== activeIndex) {
      activeIndex = newActive;
      indicatorEls.forEach((btn, i) => btn.classList.toggle('active', i === activeIndex));
      syncLoadedWindow(activeIndex);
    }
  }

  function onScroll() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', () => {
    resizeCanvas();
    update();
  });

  resizeCanvas();

  const firstImg = sections[0].images[0];
  if (firstImg.complete) {
    update();
  } else {
    firstImg.addEventListener('load', update, { once: true });
  }
  update();

  // A normal wheel/trackpad scroll scrubs the video frame-by-frame as usual.
  // A single fast flick, though, auto-completes the current section's video
  // (plays it through to its end, or back to its start when flicking up)
  // instead of just coasting to wherever momentum happens to stop.
  const FLICK_VELOCITY_THRESHOLD = 1.8; // px/ms of wheel movement to count as a "flick"
  const FLICK_SAMPLE_WINDOW = 220; // ms of recent wheel events considered for velocity
  const FLICK_MIN_REMAINING = 60; // px — skip if already basically at the section edge
  const AUTO_SCROLL_DURATION = 550; // ms
  const AUTO_SCROLL_GRACE_MS = 250; // ignore wheel input right after triggering — it's
  // almost always the tail end of the same flick gesture, not a new user action

  let wheelSamples = [];
  let autoScrollRAF = null;
  let autoScrollActive = false;
  let autoScrollStartTime = 0;

  function cancelAutoScroll() {
    if (autoScrollRAF) cancelAnimationFrame(autoScrollRAF);
    autoScrollRAF = null;
    autoScrollActive = false;
  }

  function animateScrollTo(target, duration) {
    cancelAutoScroll();
    autoScrollActive = true;
    autoScrollStartTime = performance.now();
    const startY = window.scrollY;
    const distance = target - startY;
    const startTime = performance.now();

    function step(now) {
      const t = Math.min(1, (now - startTime) / duration);
      window.scrollTo(0, startY + distance * easeOutCubic(t));
      if (t < 1 && autoScrollActive) {
        autoScrollRAF = requestAnimationFrame(step);
      } else {
        cancelAutoScroll();
      }
    }
    autoScrollRAF = requestAnimationFrame(step);
  }

  function findActiveSection(scrollY) {
    return sections.find((section) => {
      const start = section.el.offsetTop;
      const height = section.el.offsetHeight;
      const isLast = section.index === sections.length - 1;
      return isLast ? scrollY >= start : scrollY >= start && scrollY < start + height;
    });
  }

  function handleWheel(e) {
    const now = performance.now();

    if (autoScrollActive) {
      // Ignore wheel input for a short grace period — it's almost always the
      // tail of the same flick that triggered this animation. After that,
      // treat further input as the user taking back control.
      if (now - autoScrollStartTime > AUTO_SCROLL_GRACE_MS) {
        cancelAutoScroll();
        wheelSamples = [];
      }
      return;
    }

    wheelSamples.push({ t: now, deltaY: e.deltaY });
    while (wheelSamples.length && now - wheelSamples[0].t > FLICK_SAMPLE_WINDOW) wheelSamples.shift();

    if (wheelSamples.length < 2) return;
    const totalDelta = wheelSamples.reduce((sum, s) => sum + s.deltaY, 0);
    const dt = now - wheelSamples[0].t;
    if (dt <= 0) return;
    const velocity = totalDelta / dt;
    if (Math.abs(velocity) < FLICK_VELOCITY_THRESHOLD) return;

    const section = findActiveSection(window.scrollY);
    if (!section) return;

    const start = section.el.offsetTop;
    const height = section.el.offsetHeight;
    const direction = velocity > 0 ? 1 : -1;
    const target = direction > 0 ? start + height - 2 : start + 2;
    if (Math.abs(target - window.scrollY) < FLICK_MIN_REMAINING) return;

    wheelSamples = [];
    animateScrollTo(target, AUTO_SCROLL_DURATION);
  }

  window.addEventListener('wheel', handleWheel, { passive: true });

  // Section indicator navigation
  indicatorEls.forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index, 10);
      const target = sections[idx].el.offsetTop;
      window.scrollTo({ top: target + 2, behavior: 'smooth' });
    });
  });

  // Hamburger menu
  function openMenu() {
    hamburgerBtn.setAttribute('aria-expanded', 'true');
    menuOverlay.classList.add('open');
    menuOverlay.setAttribute('aria-hidden', 'false');
  }

  function closeMenu() {
    hamburgerBtn.setAttribute('aria-expanded', 'false');
    menuOverlay.classList.remove('open');
    menuOverlay.setAttribute('aria-hidden', 'true');
  }

  hamburgerBtn.addEventListener('click', () => {
    const isOpen = hamburgerBtn.getAttribute('aria-expanded') === 'true';
    if (isOpen) closeMenu();
    else openMenu();
  });

  menuOverlay.querySelectorAll('a').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      closeMenu();
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
  });
})();
