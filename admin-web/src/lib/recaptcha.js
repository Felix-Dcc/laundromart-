/**
 * reCAPTCHA v3 (invisible) helper.
 *
 * Loads Google's script lazily and returns a per-action token. When no site
 * key is configured (VITE_RECAPTCHA_SITE_KEY unset) it resolves to null, so the
 * login flow keeps working unprotected until keys are added — no hard failure.
 */

const SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY || '';
export const recaptchaEnabled = !!SITE_KEY;

let loadPromise = null;

function loadScript() {
  if (!SITE_KEY) return Promise.resolve(false);
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve) => {
    if (window.grecaptcha) return resolve(true);
    const s = document.createElement('script');
    s.src = `https://www.google.com/recaptcha/api.js?render=${SITE_KEY}`;
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
  return loadPromise;
}

// Kick off the load early (e.g. when the login page mounts) to hide latency.
export function preloadRecaptcha() { loadScript(); }

export async function getRecaptchaToken(action = 'login') {
  if (!SITE_KEY) return null;
  const ok = await loadScript();
  if (!ok || !window.grecaptcha) return null;
  try {
    await new Promise((r) => window.grecaptcha.ready(r));
    return await window.grecaptcha.execute(SITE_KEY, { action });
  } catch {
    return null; // never block login if the token can't be produced
  }
}
