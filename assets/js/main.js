(function () {
  const onReady = (fn) => {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  };

  onReady(() => {
    const title = document.querySelector('[data-hero-name]');
    const actions = document.querySelector('#heroNav');
    const subtext = document.querySelector('.subtext');
    const buttons = actions ? actions.querySelectorAll('a') : [];
    const deck = document.getElementById('deck');
    if (!deck) return;

    const slides = Array.from(deck.children);
    const dotNav = document.getElementById('slideDots');
    const reveals = slides.map((s) => s.querySelector('[data-reveal]') || s);

    // ===== Slide Tuning (Adjust Speeds Here) =====
    const SLIDE_TUNING = {
      dragSmooth: 0.28,          // deck smoothing while dragging (wheel)
      deckBase: 0.65,            // base deck tween duration between slides
      deckMin: 0.45,             // min deck duration after velocity influence
      deckMax: 0.95,             // max deck duration after velocity influence
      velocityWeight: 0.12,      // how much fast scroll shrinks duration
      snapDeck: 0.45,            // deck duration when snapping back to same slide
      snapReveal: 0.35,          // content opacity snap-back duration
      fadeOut: 0.10,             // fading old slide content
      revealIn: 0.10,            // revealing new slide content
      wheelGestureUnlockMs: 50, // time without wheel events that counts as a new gesture
      easing: {
        deck: 'power3.inOut',
        fadeOut: 'power1.out',
        revealIn: 'power2.out',
        snap: 'power2.out'
      }
    };
    // ============================================

    const moveDeck = gsap.quickTo ? gsap.quickTo(deck, 'y', { duration: SLIDE_TUNING.dragSmooth, ease: 'power2.out', overwrite: true }) : null;
    const killDeckTween = () => { if (moveDeck && moveDeck.tween) { try { moveDeck.tween.kill(); } catch(_) {} } };
    const setY = (y, immediate = false) => {
      if (immediate || !moveDeck) {
        killDeckTween();
        gsap.set(deck, { y });
      } else {
        moveDeck(y);
      }
    };

    const getSlideLabel = (slide, idx) => {
      const attr = slide.getAttribute('data-nav-label');
      if (attr) return attr;
      const labeled = slide.querySelector('[data-nav-label]');
      if (labeled && labeled.textContent) return labeled.textContent.trim();
      const heading = slide.querySelector('h1, h2, h3');
      if (heading && heading.textContent) return heading.textContent.trim();
      return `Slide ${idx + 1}`;
    };

    let dots = [];
    const setActiveDot = (idx) => {
      if (!dots.length) return;
      dots.forEach((dot, i) => {
        const active = i === idx;
        dot.classList.toggle('dot-nav__button--active', active);
        dot.setAttribute('aria-current', active ? 'page' : 'false');
      });
    };

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Type-in subtext under the name (with fade)
    const startSubtextTyping = () => {
      if (!subtext) return;
      if (prefersReduced) return; // keep it steady for reduced motion users
      const full = (subtext.textContent || '').trim();
      if (!full) return;
      // prepare
      try { gsap.set(subtext, { opacity: 0 }); } catch(_) {}
      subtext.classList.add('subtext--typing');
      subtext.textContent = '';

      // fade in quickly, then type characters with small punctuation pauses
      try { gsap.to(subtext, { opacity: 1, duration: 0.6, ease: 'power1.out' }); } catch(_) {}
      let i = 0;
      const base = 22;            // base ms per character
      const punctExtra = 110;     // extra pause for punctuation / separators
      const chars = Array.from(full);
      const step = () => {
        subtext.textContent = chars.slice(0, i + 1).join('');
        i += 1;
        if (i < chars.length) {
          const prev = chars[i - 1] || '';
          const extra = /[.,;:!\u2022]/.test(prev) ? punctExtra : 0; // include bullet (•)
          setTimeout(step, base + extra);
        } else {
          subtext.classList.remove('subtext--typing');
        }
      };
      setTimeout(step, 220);
    };

    // Reveal buttons after title animates
    buttons.forEach((btn, i) => btn.style.setProperty('--i', i));
    const revealButtons = () => actions && actions.classList.add('actions--visible');
    if (!prefersReduced) {
      let revealed = false;
      const once = () => { if (!revealed) { revealed = true; revealButtons(); startSubtextTyping(); } };
      if (title) title.addEventListener('animationend', once, { once: true });
      setTimeout(once, 2000);
    } else {
      revealButtons();
      if (subtext) {
        try { gsap.set(subtext, { opacity: 1 }); } catch(_) { subtext.style.opacity = '1'; }
      }
    }

    let current = 0;
    let accum = 0;
    let animating = false;
    let transitionTl = null;
    let idleTimer = null;
    let gestureLocked = false;
    let gestureUnlockTimer = null;
    let vh = window.innerHeight;
    const threshold = () => Math.max(160, Math.floor(vh * 0.22));
    const armGestureUnlock = () => {
      clearTimeout(gestureUnlockTimer);
      gestureUnlockTimer = setTimeout(() => {
        // Only unlock once animation has settled to guarantee one-slide-per-gesture
        if (!animating) {
          gestureLocked = false;
          accum = 0;
        } else {
          // Re-arm until animation finishes so momentum can't slip through
          armGestureUnlock();
        }
      }, SLIDE_TUNING.wheelGestureUnlockMs);
    };

    const idFor = (idx) => (slides[idx] && slides[idx].id ? `#${slides[idx].id}` : '#');
    // Monogram removed; no header state needed
    const setHeaderState = () => {};

    const yFor = (idx, frac = 0) => -idx * vh - frac * vh;
    const killTransition = () => {
      if (transitionTl) { try { transitionTl.kill(); } catch(_) {} transitionTl = null; }
      killDeckTween();
    };

    const settleSlides = (activeIdx) => {
      reveals.forEach((el, i) => {
        gsap.set(el, { opacity: i === activeIdx ? 1 : 0.08, yPercent: 0 });
      });
    };

    const applyProgress = (frac) => {
      killTransition();
      const dir = frac >= 0 ? 1 : -1;
      const next = current + dir;
      const hasNext = next >= 0 && next < slides.length;
      const clampedFrac = hasNext ? gsap.utils.clamp(-1, 1, frac) : gsap.utils.clamp(-0.35, 0.35, frac * 0.4);
      setY(yFor(current, clampedFrac));
      const amt = Math.min(Math.abs(clampedFrac), 1);
      const curReveal = reveals[current];
      const nextReveal = hasNext ? reveals[next] : null;
      const fadeOut = Math.max(1 - amt * 0.92, 0.08);
      gsap.set(curReveal, { opacity: fadeOut });
      if (nextReveal) {
        const fadeIn = Math.min(0.18 + amt * 0.82, 1);
        gsap.set(nextReveal, { opacity: fadeIn });
      }
    };

    const snapBack = (instant = false) => {
      killTransition();
      animating = true;
      const reveal = reveals[current];
      setHeaderState(current);
      transitionTl = gsap.timeline({
        defaults: { ease: instant ? 'linear' : SLIDE_TUNING.easing.snap },
        onComplete: () => {
          accum = 0;
          animating = false;
          transitionTl = null;
          setActiveDot(current);
          setHeaderState(current);
          gsap.set(reveal, { opacity: 1, yPercent: 0 });
        }
      });
      transitionTl.timeScale(1);
      transitionTl.to(deck, { y: yFor(current, 0), duration: instant ? 0.01 : SLIDE_TUNING.snapDeck, overwrite: true }, 0);
      transitionTl.to(reveal, { opacity: 1, duration: instant ? 0.01 : SLIDE_TUNING.snapReveal }, 0);
      transitionTl.data = 'snap';
    };

    const finalizeTo = (idx, { velocity = 0 } = {}) => {
      if (transitionTl && transitionTl.data === idx) return;
      if (idx === current) {
        setHeaderState(current);
        snapBack(!transitionTl);
        return;
      }
      killTransition();
      animating = true;
      const fromIdx = current;
      const toIdx = idx;
      const direction = toIdx > fromIdx ? 1 : -1;
      const fromReveal = reveals[fromIdx];
      const toReveal = reveals[toIdx];

      setHeaderState(toIdx);

      transitionTl = gsap.timeline({
        onComplete: () => {
          current = toIdx;
          accum = 0;
          animating = false;
          transitionTl = null;
          settleSlides(current);
          setActiveDot(current);
          setHeaderState(current);
          try { history.replaceState({}, '', idFor(current)); } catch (_) {}
        }
      });

      transitionTl.data = toIdx;
      transitionTl.timeScale(1);

      const duration = prefersReduced
        ? SLIDE_TUNING.deckBase
        : gsap.utils.clamp(
            SLIDE_TUNING.deckMin,
            SLIDE_TUNING.deckMax,
            SLIDE_TUNING.deckBase - Math.min(Math.abs(velocity), 1.2) * SLIDE_TUNING.velocityWeight
          );

      transitionTl.to(deck, {
        y: yFor(toIdx, 0),
        duration,
        ease: prefersReduced ? 'power2.out' : SLIDE_TUNING.easing.deck,
        overwrite: true
      }, 0);
      transitionTl.to(fromReveal, {
        opacity: 0.1,
        duration: prefersReduced ? 0.4 : SLIDE_TUNING.fadeOut,
        ease: SLIDE_TUNING.easing.fadeOut
      }, 0);
      transitionTl.fromTo(toReveal, {
        opacity: Math.max(parseFloat(gsap.getProperty(toReveal, 'opacity')) || 0, 0.2),
        yPercent: prefersReduced ? 0 : direction * 10
      }, {
        opacity: 1,
        yPercent: 0,
        duration: prefersReduced ? 0.5 : SLIDE_TUNING.revealIn,
        ease: SLIDE_TUNING.easing.revealIn
      }, 0);
    };

    const goToIndex = (idx, opts) => {
      if (idx < 0 || idx >= slides.length || idx === current || animating) return;
      finalizeTo(idx, opts);
    };

    const buildDots = () => {
      if (!dotNav) return;
      dotNav.innerHTML = '';
      dots = slides.map((slide, idx) => {
        const btn = document.createElement('button');
        btn.className = 'dot-nav__button';
        btn.type = 'button';
        btn.setAttribute('aria-label', getSlideLabel(slide, idx));
        btn.addEventListener('click', () => goToIndex(idx));
        dotNav.appendChild(btn);
        return btn;
      });
      setActiveDot(current);
    };

    const goToId = (id) => {
      const idx = slides.findIndex((s) => s.id === id);
      if (idx < 0) return;
      goToIndex(idx);
    };

    buildDots();

    buttons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const action = btn.getAttribute('data-action');
        if (!action || action === 'resume') return;
        e.preventDefault();
        goToId(action);
      });
    });

    // Monogram removed

    const onWheel = (e) => {
      e.preventDefault();
      if (animating) {
        if (transitionTl && typeof transitionTl.timeScale === 'function') {
          const accelerated = Math.max(transitionTl.timeScale(), 1.75);
          transitionTl.timeScale(accelerated);
        }
        // Maintain the gesture lock while momentum events continue during animation
        armGestureUnlock();
        return;
      }
      if (gestureLocked) { armGestureUnlock(); return; }
      vh = window.innerHeight;
      accum += e.deltaY;
      const frac = accum / threshold();

      // If threshold reached, finalize immediately (no idle wait)
      const dir = frac > 0 ? 1 : -1;
      const next = current + dir;
      const hasNext = next >= 0 && next < slides.length;
      if (Math.abs(frac) >= 1 && hasNext) {
        clearTimeout(idleTimer);
        accum = 0;
        gestureLocked = true;
        armGestureUnlock();
        finalizeTo(next, { velocity: Math.abs(frac) });
        return;
      }

      // Otherwise, show progress and snap back quickly if input stops
      applyProgress(frac);
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        accum = 0;
        snapBack();
      }, 120);
    };

    window.addEventListener('wheel', onWheel, { passive: false });

    // ===== Touch/Swipe (one-slide-per-gesture) =====
    let swipeActive = false;
    let swipeStartX = 0;
    let swipeStartY = 0;
    let swipeAxis = null; // 'y' when vertical intent is confirmed
    let swipePointerId = null;

    const beginSwipe = (x, y, id = null) => {
      swipeActive = true;
      swipeStartX = x;
      swipeStartY = y;
      swipeAxis = null;
      swipePointerId = id;
      clearTimeout(idleTimer);
    };

    const moveSwipe = (x, y) => {
      if (!swipeActive) return;

      // If an animation is running or the gesture is locked, only accelerate and keep lock armed
      if (animating || gestureLocked) {
        if (transitionTl && typeof transitionTl.timeScale === 'function') {
          const accelerated = Math.max(transitionTl.timeScale(), 1.75);
          transitionTl.timeScale(accelerated);
        }
        armGestureUnlock();
        return;
      }

      const dx = x - swipeStartX;
      const dy = swipeStartY - y; // positive dy => intent to go to next slide

      // Lock gesture axis once user intention is clear
      if (!swipeAxis) {
        const ax = Math.abs(dx), ay = Math.abs(dy);
        if (ax < 6 && ay < 6) return; // deadzone
        if (ay > ax * 1.25) swipeAxis = 'y';
        else if (ax > ay * 1.25) swipeAxis = 'x';
        else return; // wait for clearer intent
      }
      if (swipeAxis !== 'y') return; // ignore non-vertical swipes

      vh = window.innerHeight;
      const frac = dy / threshold();
      const dir = frac > 0 ? 1 : -1;
      const next = current + dir;
      const hasNext = next >= 0 && next < slides.length;

      if (Math.abs(frac) >= 1 && hasNext) {
        // Commit to the next slide and lock the gesture until animation settles
        gestureLocked = true;
        armGestureUnlock();
        finalizeTo(next, { velocity: Math.abs(frac) });
        return;
      }

      applyProgress(frac);
    };

    const endSwipe = () => {
      if (!swipeActive) return;
      // If we didn't cross threshold, snap back to the current slide
      if (!gestureLocked) {
        accum = 0;
        snapBack();
      }
      swipeActive = false;
      swipeAxis = null;
      swipePointerId = null;
    };

    const supportsPointer = 'PointerEvent' in window;
    if (supportsPointer) {
      deck.addEventListener('pointerdown', (e) => {
        if (e.pointerType !== 'touch') return;
        e.preventDefault();
        try { deck.setPointerCapture(e.pointerId); } catch (_) {}
        beginSwipe(e.clientX, e.clientY, e.pointerId);
      }, { passive: false });

      deck.addEventListener('pointermove', (e) => {
        if (e.pointerType !== 'touch') return;
        if (swipePointerId !== null && e.pointerId !== swipePointerId) return;
        e.preventDefault();
        moveSwipe(e.clientX, e.clientY);
      }, { passive: false });

      const pointerUp = (e) => {
        if (e.pointerType !== 'touch') return;
        if (swipePointerId !== null && e.pointerId !== swipePointerId) return;
        e.preventDefault();
        try { deck.releasePointerCapture(e.pointerId); } catch (_) {}
        endSwipe();
      };
      window.addEventListener('pointerup', pointerUp, { passive: false });
      window.addEventListener('pointercancel', pointerUp, { passive: false });
    } else {
      // Fallback to Touch Events
      deck.addEventListener('touchstart', (e) => {
        if (!e.touches || e.touches.length !== 1) return;
        const t = e.touches[0];
        e.preventDefault();
        beginSwipe(t.clientX, t.clientY, t.identifier || 0);
      }, { passive: false });

      deck.addEventListener('touchmove', (e) => {
        if (!e.touches || e.touches.length !== 1) return;
        const t = e.touches[0];
        e.preventDefault();
        moveSwipe(t.clientX, t.clientY);
      }, { passive: false });

      const endTouch = (e) => {
        e.preventDefault();
        endSwipe();
      };
      deck.addEventListener('touchend', endTouch, { passive: false });
      deck.addEventListener('touchcancel', endTouch, { passive: false });
    }

    const initFromHash = () => {
      const hash = location.hash.replace('#', '');
      const idx = slides.findIndex((s) => s.id === hash);
      current = idx >= 0 ? idx : 0;
      vh = window.innerHeight;
      setY(yFor(current, 0), true);
      settleSlides(current);
      setActiveDot(current);
      try { history.replaceState({}, '', idFor(current)); } catch (_) {}
    };
    initFromHash();

    window.addEventListener('resize', () => {
      vh = window.innerHeight;
      setY(yFor(current, 0), true);
    });
  });
})();
