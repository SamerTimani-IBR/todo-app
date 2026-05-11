// Loads Tap's Card SDK V2 from their CDN once and caches the load promise.
// The SDK exposes itself as `window.CardSDK` after load.
//
// Docs: https://developers.tap.company/docs/card-sdk-web-v2

const SDK_URL = 'https://tap-sdks.b-cdn.net/card/1.0.2/index.js';

let loadPromise = null;

export function loadTapSDK() {
  if (typeof window === 'undefined') return Promise.reject(new Error('SSR'));
  if (window.CardSDK) return Promise.resolve(window.CardSDK);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${SDK_URL}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(window.CardSDK));
      existing.addEventListener('error', () =>
        reject(new Error('Tap SDK failed to load.'))
      );
      return;
    }
    const s = document.createElement('script');
    s.src = SDK_URL;
    s.async = true;
    s.onload = () => {
      if (window.CardSDK) resolve(window.CardSDK);
      else reject(new Error('Tap SDK loaded but CardSDK is undefined.'));
    };
    s.onerror = () => reject(new Error('Tap SDK failed to load.'));
    document.head.appendChild(s);
  });

  return loadPromise;
}
