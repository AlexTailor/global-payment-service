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
