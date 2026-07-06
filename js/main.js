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

  function loadSection(section) {
    if (!section || section.loading || section.images.length) return;
    section.loading = true;
    for (let i = 1; i <= section.frameCount; i++) {
      const img = new Image();
      img.src = `${section.frameDir}/${pad(i)}.jpg`;
      section.images.push(img);
    }
  }

  // Preload the first section immediately, and prime the next one.
  loadSection(sections[0]);
  loadSection(sections[1]);

  let dpr = 1;

  function resizeCanvas() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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

  function fadeFactor(progress, isFirst, isLast) {
    const FADE_IN_END = 0.12;
    const FADE_OUT_START = 0.88;
    if (!isFirst && progress < FADE_IN_END) return progress / FADE_IN_END;
    if (!isLast && progress > FADE_OUT_START) return (1 - progress) / (1 - FADE_OUT_START);
    return 1;
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
          const isLast = section.index === sections.length - 1;
          section.contentEl.style.opacity = String(fadeFactor(progress, isFirst, isLast));
        }
      } else if (section.contentEl) {
        section.contentEl.style.opacity = '0';
      }
    });

    if (newActive !== activeIndex) {
      activeIndex = newActive;
      indicatorEls.forEach((btn, i) => btn.classList.toggle('active', i === activeIndex));
      loadSection(sections[activeIndex]);
      loadSection(sections[activeIndex + 1]);
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
