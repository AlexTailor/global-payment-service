// import.meta.env.* is rewritten to process.env.* by babel-plugin-transform-vite-meta-env
// (jest.config.cts) since Jest never runs Vite's own env replacement.
process.env.VITE_API_BASE_URL ??= 'http://localhost:8080';

// jsdom doesn't implement matchMedia; useMediaQuery (and anything built on it,
// like the Modal primitive) needs it to run under Jest.
if (!window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  });
}

// jsdom has no ResizeObserver at all; Base UI's Select (and other floating-ui-positioned
// popups) depend on one for their trigger/popup positioning and hang without it.
if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (!window.IntersectionObserver) {
  // @ts-expect-error -- minimal stub, not a spec-complete implementation
  window.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// jsdom is also missing scrollIntoView and the pointer-capture APIs Base UI's floating
// popups (Select, Popover, ...) rely on when opening/positioning.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
