import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");

function loadPage({
  reducedMotion = false,
  observers = true,
  resizeObserver = true,
  heroBottom = 800,
} = {}) {
  const listeners = new Map();
  const frames = [];
  const timers = new Map();
  const intersections = [];
  const resizes = [];

  const element = ({ classes = [], attributes = {} } = {}) => {
    const tokens = new Set(classes);
    const attrs = new Map(Object.entries(attributes));
    return {
      get id() {
        return attrs.get("id") ?? "";
      },
      classList: {
        add: (value) => tokens.add(value),
        remove: (value) => tokens.delete(value),
        contains: (value) => tokens.has(value),
        toggle: (value, enabled) => (enabled ? tokens.add(value) : tokens.delete(value)),
      },
      getAttribute: (name) => (attrs.has(name) ? attrs.get(name) : null),
      setAttribute: (name, value) => attrs.set(name, value),
      removeAttribute: (name) => attrs.delete(name),
    };
  };

  class Observer {
    constructor(callback, options) {
      this.callback = callback;
      this.options = options;
      this.targets = new Set();
      intersections.push(this);
    }
    observe(target) {
      this.targets.add(target);
    }
    unobserve(target) {
      this.targets.delete(target);
    }
    disconnect() {
      this.targets.clear();
    }
  }
  class SizeObserver {
    constructor(callback) {
      this.callback = callback;
      resizes.push(this);
    }
    observe() {}
  }

  const properties = new Map();
  const root = {
    ...element(),
    style: {
      setProperty: (key, value) => properties.set(key, value),
      getPropertyValue: (key) => properties.get(key) ?? "",
    },
  };

  const window = {
    scrollY: 0,
    matchMedia: () => ({ matches: reducedMotion }),
    addEventListener: (event, callback) => {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(callback);
    },
    setTimeout: (callback) => {
      const id = Symbol();
      timers.set(id, callback);
      return id;
    },
    ...(observers ? { IntersectionObserver: Observer } : {}),
    ...(resizeObserver ? { ResizeObserver: SizeObserver } : {}),
  };

  const rectFor = (node) => ({
    top: node.top - window.scrollY,
    bottom: node.bottom - window.scrollY,
    height: node.bottom - node.top,
  });

  const nav = Object.assign(element({ classes: ["is-hidden-on-hero"] }), {
    offsetHeight: 96,
  });
  const hero = Object.assign(element({ attributes: { id: "home" } }), {
    offsetTop: 0,
    offsetHeight: 800,
    top: 0,
    bottom: heroBottom,
    getBoundingClientRect() {
      return rectFor(this);
    },
  });
  const about = Object.assign(element({ attributes: { id: "about" } }), {
    top: 1400,
    bottom: 2600,
    getBoundingClientRect() {
      return rectFor(this);
    },
  });
  const contact = Object.assign(element({ attributes: { id: "contact" } }), {
    top: 2600,
    bottom: 3600,
    getBoundingClientRect() {
      return rectFor(this);
    },
  });
  const sections = { "#home": hero, "#about": about, "#contact": contact };

  const reveals = Array.from({ length: 4 }, () => element());
  const navLinks = ["#home", "#about", "#contact"].map((href) => element({ attributes: { href } }));

  runInNewContext(source, {
    document: {
      documentElement: root,
      querySelector: (selector) => sections[selector] ?? (selector === ".site-nav" ? nav : null),
      querySelectorAll: (selector) => {
        if (selector === ".reveal") return reveals;
        if (selector === '.nav-links a[href^="#"]') return navLinks;
        return [];
      },
    },
    window,
    IntersectionObserver: Observer,
    ResizeObserver: SizeObserver,
    requestAnimationFrame: (callback) => frames.push(callback),
    clearTimeout: (id) => timers.delete(id),
  });

  return {
    root,
    nav,
    hero,
    about,
    contact,
    reveals,
    navLinks,
    window,
    intersections,
    resizes,
    timers,
    frames,
    emit: (event) => listeners.get(event)?.forEach((callback) => callback()),
    flushFrames: () => frames.splice(0).forEach((callback) => callback()),
  };
}

test("reduced motion keeps all content visible and skips scroll animations", () => {
  const page = loadPage({ reducedMotion: true });
  assert.ok(page.reveals.every((element) => element.classList.contains("is-visible")));
  assert.ok(page.reveals.every((element) => !element.classList.contains("is-pending")));
  page.emit("scroll");
  page.flushFrames();
  assert.equal(page.root.classList.contains("is-scrolling"), false);
});

test("without observers content stays visible and navigation follows scroll position", () => {
  const page = loadPage({ observers: false, resizeObserver: false });
  assert.ok(page.reveals.every((element) => element.classList.contains("is-visible")));
  page.flushFrames();
  assert.equal(page.nav.classList.contains("is-hidden-on-hero"), true);
  page.window.scrollY = 704;
  page.emit("scroll");
  page.flushFrames();
  assert.equal(page.nav.classList.contains("is-scrolled"), true);
  page.window.scrollY = 0;
  page.emit("scroll");
  page.flushFrames();
  assert.equal(page.nav.classList.contains("is-hidden-on-hero"), true);
});

test("reveals activate once on intersection and ignore offscreen entries", () => {
  const page = loadPage();
  const revealObserver = page.intersections.find((observer) =>
    observer.targets.has(page.reveals[0]),
  );
  const [element] = page.reveals;
  revealObserver.callback([{ target: element, isIntersecting: false }], revealObserver);
  assert.equal(element.classList.contains("is-visible"), false);
  revealObserver.callback([{ target: element, isIntersecting: true }], revealObserver);
  assert.equal(element.classList.contains("is-visible"), true);
  assert.equal(revealObserver.targets.has(element), false);
});

test("navigation updates its anchor clearance when its layout changes", () => {
  const page = loadPage();
  assert.equal(page.root.style.getPropertyValue("--nav-height"), "96px");
  const firstObserver = page.intersections[0];
  page.nav.offsetHeight = 148;
  page.resizes[0].callback();
  assert.equal(page.root.style.getPropertyValue("--nav-height"), "148px");
  assert.equal(firstObserver.targets.size, 0);
  assert.ok(page.intersections.at(-1).targets.has(page.hero));
});

test("fractional anchor positions keep navigation visible at the hero boundary", () => {
  const anchoredPage = loadPage({ heroBottom: 96.25 });
  assert.equal(anchoredPage.nav.classList.contains("is-scrolled"), true);
  const heroPage = loadPage({ heroBottom: 120 });
  assert.equal(heroPage.nav.classList.contains("is-hidden-on-hero"), true);
});

test("resize events keep navigation measurements working without ResizeObserver", () => {
  const page = loadPage({ resizeObserver: false });
  page.nav.offsetHeight = 160;
  page.emit("resize");
  assert.equal(page.root.style.getPropertyValue("--nav-height"), "160px");
});

test("scroll bursts share an animation frame and resume animations after scrolling", () => {
  const page = loadPage();
  page.flushFrames();
  page.emit("scroll");
  page.emit("scroll");
  const scheduled = page.frames.length;
  assert.ok(scheduled >= 1);
  page.emit("scroll");
  assert.equal(page.frames.length, scheduled);
  page.flushFrames();
  assert.equal(page.root.classList.contains("is-scrolling"), true);
  [...page.timers.values()][0]();
  assert.equal(page.root.classList.contains("is-scrolling"), false);
});

test("scrollspy marks the section currently under the navigation", () => {
  const page = loadPage();
  page.flushFrames();
  assert.equal(page.navLinks[0].getAttribute("aria-current"), "true");
  assert.ok(page.navLinks[0].classList.contains("is-active"));

  page.window.scrollY = 1500;
  page.emit("scroll");
  page.flushFrames();
  assert.equal(page.navLinks[1].getAttribute("aria-current"), "true");
  assert.equal(page.navLinks[0].getAttribute("aria-current"), null);
  assert.ok(page.navLinks[1].classList.contains("is-active"));
  assert.equal(page.navLinks[0].classList.contains("is-active"), false);

  page.window.scrollY = 2700;
  page.emit("scroll");
  page.flushFrames();
  assert.equal(page.navLinks[2].getAttribute("aria-current"), "true");

  page.window.scrollY = 0;
  page.emit("scroll");
  page.flushFrames();
  assert.equal(page.navLinks[0].getAttribute("aria-current"), "true");
  assert.equal(page.navLinks[2].getAttribute("aria-current"), null);
});

test("the initial reveal state is gated on the js class so it never flashes", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(html, /classList\.add\("js"\)/);
  assert.match(html, /__revealFallback/);
  assert.match(css, /\.js \.reveal\b/);
});
