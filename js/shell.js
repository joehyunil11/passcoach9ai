/* 모든 페이지가 공유하는 셸: 토스트 · 사이드바 메뉴 렌더링 · 모바일 드로어 */

const Shell = (() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const ACTIVE_KEY = 'passcoach9ai:active-nav';
  let bound = false;
  let navigating = false;

  const escapeHtml = (str) =>
    String(str).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  /* ── 토스트 ─────────────────────────────── */
  let toastTimer;
  function showToast(message) {
    const toast = $('#toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2000);
  }

  /* ── 모바일 드로어 ──────────────────────── */
  const isNarrow = () => window.matchMedia('(max-width: 860px)').matches;

  function setSidebar(open) {
    const sidebar = $('#sidebar');
    const scrim = $('#scrim');
    const toggleBtn = $('#sidebarToggle');
    if (!sidebar) return;

    sidebar.classList.toggle('is-open', open);
    if (scrim) scrim.hidden = !open;
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-expanded', String(open));
      toggleBtn.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
    }
  }

  function resolveActive(preferred) {
    return preferred || document.body.dataset.activeNav || sessionStorage.getItem(ACTIVE_KEY) || 'home';
  }

  function setActive(activeId) {
    if (!activeId) return;
    sessionStorage.setItem(ACTIVE_KEY, activeId);
    if (document.body) document.body.dataset.activeNav = activeId;
    document.querySelectorAll('[data-nav]').forEach((el) => {
      const on = el.dataset.nav === activeId;
      if (el.classList.contains('is-active') === on) return;
      el.classList.toggle('is-active', on);
    });
  }

  function itemMarkup(item, current) {
    const active = item.id === current ? ' is-active' : '';
    const icon = `<svg class="nav__icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[item.icon] || ''}</svg>`;
    const label = `<span>${escapeHtml(item.label)}</span>`;
    if (item.href) {
      return `<li>
        <a class="nav__link${active}" href="${escapeHtml(item.href)}" data-nav="${item.id}">
          ${icon}${label}
        </a>
      </li>`;
    }
    return `<li>
      <button class="nav__link${active}" type="button" data-nav="${item.id}">
        ${icon}${label}
      </button>
    </li>`;
  }

  /* 파서 단계에서 document.write 로 넣어 첫 페인트부터 선택 상태가 맞다 */
  function navMarkup(activeId) {
    const current = resolveActive(activeId);
    sessionStorage.setItem(ACTIVE_KEY, current);
    const blocks = ['navPrimary', 'navSecondary', 'navAccount'].map((listId) => {
      const items = NAV_GROUPS[listId] || [];
      return `<ul class="nav__list" id="${listId}">${items.map((item) => itemMarkup(item, current)).join('')}</ul>`;
    });
    return `${blocks[0]}<hr class="nav__divider" />${blocks[1]}<hr class="nav__divider" />${blocks[2]}`;
  }

  /* ── 사이드바 메뉴 ──────────────────────── */
  function renderNav(activeId) {
    const current = resolveActive(activeId);
    Object.entries(NAV_GROUPS).forEach(([listId, items]) => {
      const list = document.getElementById(listId);
      if (!list) return;
      list.innerHTML = items.map((item) => itemMarkup(item, current)).join('');
    });
    sessionStorage.setItem(ACTIVE_KEY, current);
  }

  function findNavItem(id) {
    return Object.values(NAV_GROUPS).flat().find((item) => item.id === id);
  }

  function currentPageName() {
    return location.pathname.split(/[/\\]/).pop() || 'index.html';
  }

  function goTo(href) {
    if (navigating) return;
    navigating = true;
    /* 선택 스타일이 먼저 그려진 뒤 이동해 전환 중 깜빡임을 없앤다 */
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        location.assign(href);
      });
    });
  }

  function prefetch(href) {
    try {
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = href;
      link.as = 'document';
      document.head.appendChild(link);
    } catch (_) {
      /* ignore */
    }
  }

  /* 사이드바 직후 호출 */
  function boot(activeNav) {
    if (!$('#navPrimary')) {
      /* document.write 전에 호출된 경우 대비 — 보통 navMarkup가 먼저 실행됨 */
      return;
    }
    const current = resolveActive(activeNav);
    if (!$('#navPrimary').children.length) renderNav(current);
    else setActive(current);
    bindChrome();
  }

  function bindChrome() {
    if (bound) return;
    bound = true;

    const toggleBtn = $('#sidebarToggle');
    const scrim = $('#scrim');
    if (toggleBtn) toggleBtn.addEventListener('click', () => setSidebar(!$('#sidebar').classList.contains('is-open')));
    if (scrim) scrim.addEventListener('click', () => setSidebar(false));

    document.addEventListener(
      'pointerdown',
      (event) => {
        if (event.button != null && event.button !== 0) return;
        const navBtn = event.target.closest('a[data-nav], button[data-nav]');
        if (!navBtn) return;
        const item = findNavItem(navBtn.dataset.nav);
        if (!item || !item.href) return;
        setActive(item.id);
        const target = item.href.split('?')[0];
        if (currentPageName() !== target || location.search) prefetch(item.href);
      },
      true
    );

    document.addEventListener('click', (event) => {
      const navBtn = event.target.closest('[data-nav]');
      if (navBtn) {
        const item = findNavItem(navBtn.dataset.nav);
        if (isNarrow()) setSidebar(false);

        if (item && item.href) {
          event.preventDefault();
          setActive(item.id);
          const target = item.href.split('?')[0];
          if (currentPageName() === target && !location.search) return;
          goTo(item.href);
          return;
        }
        event.preventDefault();
        showToast(`${item ? item.label : '해당'} 화면은 준비 중입니다.`);
        return;
      }

      const action = event.target.closest('[data-action]');
      if (action) showToast(`${action.dataset.action} 기능은 준비 중입니다.`);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') setSidebar(false);
    });

    window.addEventListener('pageshow', (event) => {
      navigating = false;
      if (!$('#navPrimary')?.children.length) return;
      const current = resolveActive(document.body.dataset.activeNav);
      setActive(current);
      /* bfcache 복원 시에도 선택만 맞춘다 */
      if (event.persisted) setActive(current);
    });
  }

  function init({ activeNav } = {}) {
    const current = resolveActive(activeNav);
    if (!$('#navPrimary')?.children.length) renderNav(current);
    else setActive(current);
    bindChrome();
  }

  return { init, boot, navMarkup, showToast, escapeHtml, setSidebar, setActive };
})();
