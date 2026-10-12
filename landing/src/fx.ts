import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export function reducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function revealAll() {
  document
    .querySelectorAll('[data-rv],[data-clip],[data-draw]')
    .forEach((el) => el.classList.add('in'));
}

// 20+ scroll effects. Numbered below. All are scrubbed, pinned, or
// enter-triggered via one shared ScrollTrigger context; reduced-motion
// short-circuits everything to the final visible state.
export function initFx(): () => void {
  if (typeof window === 'undefined') return () => {};
  if (reducedMotion()) {
    revealAll();
    return () => {};
  }

  // Safety net: if any trigger misfires (unloaded images shifting layout,
  // fast scroll), anything already in view still reveals within 2.5s.
  setTimeout(() => {
    document.querySelectorAll('[data-rv],[data-clip],[data-draw]').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) el.classList.add('in');
    });
  }, 2500);

  const ctx = gsap.context(() => {
    const once = (sel: string) => {
      gsap.utils.toArray<HTMLElement>(sel).forEach((el) => {
        ScrollTrigger.create({
          trigger: el,
          start: 'top 88%',
          once: true,
          onEnter: () => el.classList.add('in'),
        });
      });
    };

    // 1 — fade-rise reveals
    once('[data-rv]');
    // 2 — clip-path headline reveals
    once('[data-clip]');
    // 3 — divider line draws
    once('[data-draw]');

    // 4 — parallax layers (data-speed: 0 = fixed-ish … 1 = normal)
    gsap.utils.toArray<HTMLElement>('[data-speed]').forEach((el) => {
      const s = parseFloat(el.dataset.speed || '0.3');
      gsap.fromTo(
        el,
        { y: 110 * s },
        {
          y: -110 * s,
          ease: 'none',
          scrollTrigger: {
            trigger: el.closest('section') || el,
            start: 'top bottom',
            end: 'bottom top',
            scrub: 1,
          },
        },
      );
    });

    // 5 — scroll-spin decorations
    gsap.utils.toArray<HTMLElement>('[data-spin]').forEach((el) => {
      const amount = parseFloat(el.dataset.spin || '60');
      gsap.fromTo(
        el,
        { rotation: 0 },
        {
          rotation: amount,
          ease: 'none',
          scrollTrigger: {
            trigger: el.closest('section') || el,
            start: 'top bottom',
            end: 'bottom top',
            scrub: 1.2,
          },
        },
      );
    });

    // 6 — velocity-reactive marquee (speed + skew follow scroll)
    const mq = document.querySelector<HTMLElement>('[data-velocity]');
    const track = mq?.querySelector<HTMLElement>('.marquee-track');
    if (mq && track) {
      let x = 0;
      let vel = 0;
      ScrollTrigger.create({
        onUpdate: (self) => {
          vel = self.getVelocity();
        },
      });
      gsap.ticker.add(() => {
        const boost = gsap.utils.clamp(-7, 7, vel / -220);
        x -= 1.1 + boost;
        const w = track.scrollWidth / 2;
        if (w > 0 && x <= -w) x += w;
        track.style.transform = `translateX(${x}px) skewX(${gsap.utils.clamp(-8, 8, vel / -450)}deg)`;
        vel *= 0.95;
      });
    }

    // 7 — tick-up counters (honest numbers only)
    gsap.utils.toArray<HTMLElement>('[data-count]').forEach((el) => {
      const target = parseFloat(el.dataset.count || '0');
      ScrollTrigger.create({
        trigger: el,
        start: 'top 90%',
        once: true,
        onEnter: () => {
          const o = { v: 0 };
          gsap.to(o, {
            v: target,
            duration: 1.6,
            ease: 'power2.out',
            onUpdate: () => {
              el.textContent = Math.round(o.v).toString();
            },
          });
        },
      });
    });

    // 8 — pinned horizontal gallery
    const hs = document.querySelector<HTMLElement>('[data-hscroll]');
    const hsTrack = hs?.querySelector<HTMLElement>('[data-hscroll-track]');
    if (hs && hsTrack) {
      const dist = () => Math.max(0, hsTrack.scrollWidth - window.innerWidth);
      gsap.to(hsTrack, {
        x: () => -dist(),
        ease: 'none',
        scrollTrigger: {
          trigger: hs,
          start: 'top top',
          end: () => '+=' + dist(),
          scrub: 1,
          pin: true,
          invalidateOnRefresh: true,
        },
      });
    }

    // 9 — scroll progress bar
    const prog = document.getElementById('scroll-progress');
    if (prog) {
      gsap.fromTo(
        prog,
        { scaleX: 0 },
        {
          scaleX: 1,
          ease: 'none',
          scrollTrigger: { start: 0, end: 'max', scrub: 0.4 },
        },
      );
    }

    // 10 — nav blur/shrink on scroll
    const nav = document.getElementById('landing-nav');
    if (nav) {
      const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 40);
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
    }

    // 11 — giant background words drift
    gsap.utils.toArray<HTMLElement>('[data-drift]').forEach((el) => {
      const d = parseFloat(el.dataset.drift || '0.2');
      gsap.fromTo(
        el,
        { xPercent: 4 * d * 10 },
        {
          xPercent: -4 * d * 10,
          ease: 'none',
          scrollTrigger: {
            trigger: el.closest('section') || el,
            start: 'top bottom',
            end: 'bottom top',
            scrub: 1,
          },
        },
      );
    });

    // 12 — image parallax inside frames
    gsap.utils.toArray<HTMLElement>('.parallax-img').forEach((img) => {
      gsap.fromTo(
        img,
        { yPercent: -7 },
        {
          yPercent: 7,
          ease: 'none',
          scrollTrigger: {
            trigger: img.closest('.beam-frame') || img,
            start: 'top bottom',
            end: 'bottom top',
            scrub: 1,
          },
        },
      );
    });

    // 13 — stagger groups
    gsap.utils.toArray<HTMLElement>('[data-stagger]').forEach((group) => {
      Array.from(group.children).forEach((child, i) => {
        (child as HTMLElement).style.transitionDelay = `${i * 80}ms`;
        if (!child.hasAttribute('data-rv')) child.setAttribute('data-rv', '');
      });
      ScrollTrigger.create({
        trigger: group,
        start: 'top 85%',
        once: true,
        onEnter: () =>
          Array.from(group.children).forEach((c) => c.classList.add('in')),
      });
    });

    // 14 — 3D tilt cards (fine pointers only)
    if (window.matchMedia('(pointer: fine)').matches) {
      gsap.utils.toArray<HTMLElement>('[data-tilt]').forEach((el) => {
        const rx = gsap.quickTo(el, 'rotationX', { duration: 0.5, ease: 'power3' });
        const ry = gsap.quickTo(el, 'rotationY', { duration: 0.5, ease: 'power3' });
        el.addEventListener('mousemove', (e) => {
          const r = el.getBoundingClientRect();
          ry(((e.clientX - r.left) / r.width - 0.5) * 10);
          rx(-((e.clientY - r.top) / r.height - 0.5) * 10);
        });
        el.addEventListener('mouseleave', () => {
          rx(0);
          ry(0);
        });
      });

      // 15 — magnetic buttons
      gsap.utils.toArray<HTMLElement>('[data-magnetic]').forEach((el) => {
        const qx = gsap.quickTo(el, 'x', { duration: 0.4, ease: 'power3' });
        const qy = gsap.quickTo(el, 'y', { duration: 0.4, ease: 'power3' });
        el.addEventListener('mousemove', (e) => {
          const r = el.getBoundingClientRect();
          qx((e.clientX - (r.left + r.width / 2)) * 0.3);
          qy((e.clientY - (r.top + r.height / 2)) * 0.3);
        });
        el.addEventListener('mouseleave', () => {
          qx(0);
          qy(0);
        });
      });
    }

    // 16 — back-to-top ember button
    const toTop = document.getElementById('to-top');
    if (toTop) {
      const onScroll = () => toTop.classList.toggle('show', window.scrollY > 700);
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
      toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    }

    // 17 — beam intensify on enter
    gsap.utils.toArray<HTMLElement>('[data-beamboost]').forEach((el) => {
      ScrollTrigger.create({
        trigger: el,
        start: 'top 80%',
        end: 'bottom 20%',
        onToggle: (self) => el.classList.toggle('boosted', self.isActive),
      });
    });

    // 18 — hero content drifts out on scroll
    const heroOut = document.querySelector<HTMLElement>('[data-hero-out]');
    if (heroOut) {
      gsap.to(heroOut, {
        y: -90,
        opacity: 0.25,
        ease: 'none',
        scrollTrigger: { trigger: '#top', start: 'top top', end: 'bottom top', scrub: 1 },
      });
    }

    // 19 — commit cards slide from the side
    gsap.utils.toArray<HTMLElement>('.feat-card').forEach((el, i) => {
      gsap.from(el, {
        x: i % 2 === 0 ? -34 : 34,
        opacity: 0,
        duration: 0.7,
        ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 92%', once: true },
      });
    });

    // 20 — footer columns rise in sequence
    gsap.utils.toArray<HTMLElement>('[data-foot]').forEach((el, i) => {
      gsap.from(el, {
        y: 24,
        opacity: 0,
        duration: 0.6,
        delay: (i % 4) * 0.08,
        ease: 'power2.out',
        scrollTrigger: { trigger: el, start: 'top 95%', once: true },
      });
    });
  });

  return () => ctx.revert();
}
