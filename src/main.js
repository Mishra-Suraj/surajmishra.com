const prefersReducedMotion =
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const root = document.documentElement;

const nav = document.querySelector(".site-nav");
const heroSection = document.querySelector("#home");
const setNavState = (isOnHero) => {
  if (!nav) return;

  nav.classList.toggle("is-hidden-on-hero", isOnHero);
  nav.classList.toggle("is-scrolled", !isOnHero);
};

let navObserver;
const observeHero = () => {
  if (!nav || !heroSection || !("IntersectionObserver" in window)) return;

  navObserver?.disconnect();
  navObserver = new IntersectionObserver(([entry]) => setNavState(entry.isIntersecting), {
    threshold: 0,
    // Allow for fractional pixels at native anchor positions.
    rootMargin: `-${nav.offsetHeight + 1}px 0px 0px 0px`,
  });
  navObserver.observe(heroSection);
  setNavState(heroSection.getBoundingClientRect().bottom > nav.offsetHeight + 1);
};

const updateNavHeight = () => {
  if (!nav) return;
  const height = `${nav.offsetHeight}px`;
  if (root.style.getPropertyValue("--nav-height") === height) return;
  root.style.setProperty("--nav-height", height);
  observeHero();
};
updateNavHeight();
if ("ResizeObserver" in window && nav) {
  new ResizeObserver(updateNavHeight).observe(nav);
} else {
  window.addEventListener("resize", updateNavHeight);
  window.addEventListener("load", updateNavHeight, { once: true });
}

if (!nav || !heroSection || !("IntersectionObserver" in window)) {
  let heroExit = heroSection ? heroSection.offsetTop + heroSection.offsetHeight : 72;
  let navTicking = false;
  const updateHeroExit = () => {
    heroExit = heroSection ? heroSection.offsetTop + heroSection.offsetHeight : 72;
  };
  const updateNavState = () => {
    navTicking = false;
    setNavState(window.scrollY + (nav?.offsetHeight ?? 0) + 1 < heroExit);
  };
  const requestNavUpdate = () => {
    if (navTicking) return;
    navTicking = true;
    requestAnimationFrame(updateNavState);
  };

  updateHeroExit();
  requestNavUpdate();
  window.addEventListener("scroll", requestNavUpdate, { passive: true });
  window.addEventListener("resize", () => {
    updateHeroExit();
    requestNavUpdate();
  });
  window.addEventListener(
    "load",
    () => {
      updateHeroExit();
      requestNavUpdate();
    },
    { once: true },
  );
}

let scrollingTimer;
let scrollingTicking = false;
const markScrolling = () => {
  if (!scrollingTicking) {
    scrollingTicking = true;
    requestAnimationFrame(() => {
      root.classList.add("is-scrolling");
      scrollingTicking = false;
    });
  }

  clearTimeout(scrollingTimer);
  scrollingTimer = window.setTimeout(() => {
    root.classList.remove("is-scrolling");
  }, 140);
};

if (!prefersReducedMotion) {
  window.addEventListener("scroll", markScrolling, { passive: true });
}

const revealElements = document.querySelectorAll(".reveal");

if (prefersReducedMotion || !("IntersectionObserver" in window)) {
  revealElements.forEach((element) => element.classList.add("is-visible"));
} else {
  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    {
      threshold: 0,
    },
  );

  revealElements.forEach((element) => revealObserver.observe(element));
}

const navLinks = Array.from(document.querySelectorAll('.nav-links a[href^="#"]'));
const spySections = navLinks
  .map((link) => document.querySelector(link.getAttribute("href")))
  .filter(Boolean);

if (navLinks.length && spySections.length) {
  const setActiveLink = (id) => {
    navLinks.forEach((link) => {
      const isActive = link.getAttribute("href") === `#${id}`;
      link.classList.toggle("is-active", isActive);
      if (isActive) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    });
  };

  let spyTicking = false;
  const updateActiveLink = () => {
    spyTicking = false;
    const line = (nav?.offsetHeight ?? 0) + 1;
    let currentId = spySections[0].id;
    for (const section of spySections) {
      if (section.getBoundingClientRect().top <= line) currentId = section.id;
    }
    setActiveLink(currentId);
  };
  const requestSpyUpdate = () => {
    if (spyTicking) return;
    spyTicking = true;
    requestAnimationFrame(updateActiveLink);
  };

  requestSpyUpdate();
  window.addEventListener("scroll", requestSpyUpdate, { passive: true });
  window.addEventListener("resize", requestSpyUpdate);
}

// Cancel the inline fallback that reveals content if this module never runs.
clearTimeout(window.__revealFallback);
