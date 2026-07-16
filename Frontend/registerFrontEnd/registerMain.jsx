import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './registerApp.jsx';

import './App.css';
import './index.css';

/*
 * Vite emits "vite:preloadError" when a lazy-loaded JavaScript
 * chunk cannot be downloaded.
 *
 * This commonly happens when:
 * 1. The user has an older version of the website open.
 * 2. A new version is deployed.
 * 3. The old chunk filename no longer exists on the server.
 *
 * Reloading retrieves the current index.html and its current
 * JavaScript asset filenames.
 */
const PRELOAD_RELOAD_KEY = 'vite-preload-reload-timestamp';
const PRELOAD_RELOAD_COOLDOWN = 10_000;

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();

  const currentTime = Date.now();

  const previousReloadTime = Number(
    sessionStorage.getItem(PRELOAD_RELOAD_KEY) || 0
  );

  const recentlyReloaded =
    currentTime - previousReloadTime < PRELOAD_RELOAD_COOLDOWN;

  /*
   * Prevent an endless refresh loop if the chunk still cannot
   * be loaded after refreshing.
   */
  if (recentlyReloaded) {
    console.error(
      'A lazy-loaded module could not be loaded after refreshing.',
      event.payload || event
    );

    return;
  }

  sessionStorage.setItem(
    PRELOAD_RELOAD_KEY,
    String(currentTime)
  );

  window.location.reload();
});

/*
 * Clear the reload protection after the current application has
 * remained loaded successfully. This allows recovery from a future
 * deployment without permitting an immediate refresh loop.
 */
window.setTimeout(() => {
  sessionStorage.removeItem(PRELOAD_RELOAD_KEY);
}, PRELOAD_RELOAD_COOLDOWN);

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error(
    'Unable to start the application because the #root element was not found.'
  );
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);