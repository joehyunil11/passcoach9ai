/* file:// 로 열면 브라우저가 페이지마다 다른 출처로 막아 오류가 납니다.
   로컬 서버(http://localhost:5500)로 바로 옮겨 줍니다. */
(() => {
  'use strict';
  if (location.protocol !== 'file:') return;

  const file = decodeURIComponent((location.pathname.split(/[/\\]/).pop() || 'index.html'));
  const next = `http://127.0.0.1:5500/${file}${location.search}${location.hash}`;

  try {
    if (window.top && window.top !== window) {
      window.top.location.replace(next);
      return;
    }
  } catch (_) {
    /* iframe에서 top 이동이 막히면 현재 창으로 이동 */
  }
  location.replace(next);
})();
