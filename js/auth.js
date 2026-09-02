/* 로그인 · 회원가입 · 상단바 계정 버튼 (이 브라우저에만 저장되는 데모) */

(() => {
  'use strict';

  const SESSION_KEY = 'passcoach9ai:session';
  const USERS_KEY = 'passcoach9ai:users';
  const ACCOUNT_KEY = 'passcoach9ai:account';

  const $ = (sel) => document.querySelector(sel);
  const esc = (str) =>
    String(str).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  function loadUsers() {
    try {
      const list = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  function saveUsers(list) {
    try {
      localStorage.setItem(USERS_KEY, JSON.stringify(list));
    } catch {
      /* ignore */
    }
  }

  function session() {
    try {
      const data = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      return data && data.email ? data : null;
    } catch {
      return null;
    }
  }

  function setSession(user) {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ name: user.name, email: user.email }));
    } catch {
      /* ignore */
    }
  }

  function clearSession() {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
  }

  function todayLabel() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
  }

  function syncAccount(user) {
    try {
      const prev = JSON.parse(localStorage.getItem(ACCOUNT_KEY) || '{}');
      localStorage.setItem(
        ACCOUNT_KEY,
        JSON.stringify({
          ...prev,
          name: user.name,
          email: user.email,
          joined: prev.joined || todayLabel(),
        })
      );
    } catch {
      /* ignore */
    }
  }

  function findUser(email) {
    const key = email.trim().toLowerCase();
    return loadUsers().find((user) => String(user.email).toLowerCase() === key);
  }

  function renderTopbar() {
    const wrap = $('#topbarAuth');
    if (!wrap) return;

    const user = session();
    if (user) {
      wrap.innerHTML = `
        <span class="topbar__user" title="${esc(user.email)}">${esc(user.name)}</span>
        <button class="topbar__btn topbar__btn--ghost" type="button" data-logout="true">로그아웃</button>`;
      return;
    }

    wrap.innerHTML = `
      <a class="topbar__btn topbar__btn--ghost" href="login.html">로그인</a>
      <a class="topbar__btn topbar__btn--primary" href="signup.html">회원가입</a>`;
  }

  function toast(message) {
    if (window.Shell) Shell.showToast(message);
  }

  renderTopbar();

  document.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-logout]');
    if (!btn) return;
    clearSession();
    toast('로그아웃했습니다.');
    renderTopbar();
  });

  const loginForm = $('#loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const email = $('#loginEmail').value.trim();
      const password = $('#loginPassword').value;
      const user = findUser(email);

      if (!user || user.password !== password) {
        toast('이메일 또는 비밀번호가 올바르지 않습니다.');
        return;
      }

      setSession(user);
      syncAccount(user);
      toast('로그인했습니다.');
      location.href = 'index.html';
    });
  }

  const signupForm = $('#signupForm');
  if (signupForm) {
    signupForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const name = $('#signupName').value.trim();
      const email = $('#signupEmail').value.trim();
      const password = $('#signupPassword').value;
      const again = $('#signupPasswordAgain').value;

      if (!name) {
        toast('이름을 입력해 주세요.');
        return;
      }
      if (!email || !email.includes('@')) {
        toast('올바른 이메일을 입력해 주세요.');
        return;
      }
      if (password.length < 6) {
        toast('비밀번호는 6자 이상이어야 합니다.');
        return;
      }
      if (password !== again) {
        toast('비밀번호가 서로 다릅니다.');
        return;
      }
      if (findUser(email)) {
        toast('이미 가입된 이메일입니다.');
        return;
      }

      const user = { name, email, password };
      saveUsers([...loadUsers(), user]);
      setSession(user);
      syncAccount(user);
      toast('회원가입이 완료되었습니다.');
      location.href = 'index.html';
    });
  }
})();
