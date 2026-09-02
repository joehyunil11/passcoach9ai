/* 마이페이지: 회원 정보 · 학습/알림 설정 · 계정 관리 */

(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];
  const esc = Shell.escapeHtml;

  Shell.init({ activeNav: 'account' });

  const KEY = 'passcoach9ai:account';
  const PLAN_KEY = 'passcoach9ai:plan';
  const PAY_KEY = 'passcoach9ai:payments';
  const SUBJECTS = [
    { id: 'korean', label: '국어' },
    { id: 'english', label: '영어' },
    { id: 'history', label: '한국사' },
    { id: 'adminlaw', label: '행정법' },
    { id: 'adminsci', label: '행정학' },
  ];
  const PLANS = {
    free: { name: '무료 이용권', amount: '0원' },
    basic: { name: '베이직 이용권', amount: '9,900원' },
    premium: { name: '프리미엄 이용권', amount: '19,900원' },
  };

  const DEFAULT = {
    name: '홍길동',
    email: 'hong123@email.com',
    joined: '2024.01.15',
    goal: '2024년 12월 시험 합격',
    subjects: [],
    dailyTarget: 30,
    notify: { study: true, review: true, event: false },
  };

  function loadAccount() {
    try {
      const data = JSON.parse(localStorage.getItem(KEY) || '{}');
      return { ...DEFAULT, ...data, notify: { ...DEFAULT.notify, ...(data.notify || {}) } };
    } catch {
      return { ...DEFAULT };
    }
  }

  function saveAccount(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      /* ignore */
    }
  }

  function currentPlan() {
    try {
      const id = localStorage.getItem(PLAN_KEY);
      if (id && PLANS[id]) return { id, ...PLANS[id] };
    } catch {
      /* ignore */
    }
    return { id: 'premium', ...PLANS.premium };
  }

  function formatDate(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
  }

  function payDates() {
    try {
      const list = JSON.parse(localStorage.getItem(PAY_KEY) || '[]');
      const last = Array.isArray(list) && list[0];
      if (last && last.date) {
        const paid = formatDate(last.date);
        const next = new Date(last.date);
        next.setMonth(next.getMonth() + 1);
        return { paid, next: formatDate(next.toISOString()) };
      }
    } catch {
      /* ignore */
    }
    return { paid: '2024.06.01', next: '2024.07.01' };
  }

  function subjectText(ids) {
    if (!ids.length) return '주로 학습하는 과목을 선택하세요.';
    return ids
      .map((id) => SUBJECTS.find((item) => item.id === id))
      .filter(Boolean)
      .map((item) => item.label)
      .join(', ');
  }

  let account = loadAccount();
  let dialogMode = '';

  function render() {
    const plan = currentPlan();
    const dates = payDates();
    $('#viewName').textContent = account.name;
    $('#viewEmail').textContent = account.email;
    $('#viewJoined').textContent = `가입일: ${account.joined}`;
    $('#viewPlan').textContent = plan.name;
    $('#viewPaid').textContent = `결제일: ${dates.paid}`;
    $('#viewNext').textContent = `다음 결제일: ${plan.id === 'free' ? '-' : dates.next}`;
    $('#viewAmount').textContent = `결제 금액: ${plan.amount}`;
    $('#viewGoal').textContent = account.goal;
    $('#viewGoal2').textContent = account.goal;
    $('#viewSubjects').textContent = subjectText(account.subjects);
    $('#viewSubjects2').textContent = subjectText(account.subjects);
    $('#dailyTarget').value = account.dailyTarget;
    $('#notifyStudy').checked = account.notify.study;
    $('#notifyReview').checked = account.notify.review;
    $('#notifyEvent').checked = account.notify.event;
  }

  function setTab(id) {
    $$('.mypage__tab').forEach((tab) => {
      const on = tab.dataset.tab === id;
      tab.classList.toggle('is-active', on);
      tab.setAttribute('aria-selected', String(on));
    });
    $$('.mypage__panel').forEach((panel) => {
      panel.hidden = panel.id !== `panel${id[0].toUpperCase()}${id.slice(1)}`;
    });
  }

  const dialog = $('#dialog');
  const dialogBody = $('#dialogBody');

  function closeDialog() {
    dialog.hidden = true;
    dialogMode = '';
  }

  function openDialog(mode) {
    dialogMode = mode;
    const title = {
      profile: '정보 수정',
      goal: '학습 목표 수정',
      subjects: '선호 과목 설정',
      password: '비밀번호 변경',
    }[mode];
    $('#dialogTitle').textContent = title;

    if (mode === 'profile') {
      dialogBody.innerHTML = `
        <label for="editName">이름</label>
        <input class="field" id="editName" name="name" value="${esc(account.name)}" required maxlength="20" />
        <label for="editEmail">이메일</label>
        <input class="field" id="editEmail" name="email" type="email" value="${esc(account.email)}" required />`;
    } else if (mode === 'goal') {
      dialogBody.innerHTML = `
        <label for="editGoal">학습 목표</label>
        <input class="field" id="editGoal" name="goal" value="${esc(account.goal)}" required maxlength="40" />`;
    } else if (mode === 'subjects') {
      dialogBody.innerHTML = `<div class="chips">${SUBJECTS.map(
        (item) => `
        <label class="chip">
          <input type="checkbox" name="subject" value="${item.id}" ${account.subjects.includes(item.id) ? 'checked' : ''} />
          ${esc(item.label)}
        </label>`
      ).join('')}</div>`;
    } else {
      dialogBody.innerHTML = `
        <label for="pwNow">현재 비밀번호</label>
        <input class="field" id="pwNow" type="password" autocomplete="current-password" />
        <label for="pwNew">새 비밀번호</label>
        <input class="field" id="pwNew" type="password" autocomplete="new-password" minlength="6" />
        <label for="pwAgain">새 비밀번호 확인</label>
        <input class="field" id="pwAgain" type="password" autocomplete="new-password" />`;
    }

    dialog.hidden = false;
    const first = dialogBody.querySelector('input');
    if (first) first.focus();
  }

  render();

  document.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-tab]');
    if (tab) {
      setTab(tab.dataset.tab);
      return;
    }
    const open = event.target.closest('[data-open]');
    if (open) openDialog(open.dataset.open);
  });

  $('#dialogCancel').addEventListener('click', closeDialog);
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) closeDialog();
  });

  $('#dialogForm').addEventListener('submit', (event) => {
    event.preventDefault();
    if (dialogMode === 'profile') {
      account.name = $('#editName').value.trim() || account.name;
      account.email = $('#editEmail').value.trim() || account.email;
      Shell.showToast('회원 정보를 저장했습니다.');
    } else if (dialogMode === 'goal') {
      account.goal = $('#editGoal').value.trim() || account.goal;
      Shell.showToast('학습 목표를 저장했습니다.');
    } else if (dialogMode === 'subjects') {
      account.subjects = $$('input[name="subject"]:checked').map((input) => input.value);
      Shell.showToast('선호 과목을 저장했습니다.');
    } else if (dialogMode === 'password') {
      const next = $('#pwNew').value;
      const again = $('#pwAgain').value;
      if (!next || next.length < 6) {
        Shell.showToast('새 비밀번호는 6자 이상이어야 합니다.');
        return;
      }
      if (next !== again) {
        Shell.showToast('새 비밀번호가 서로 다릅니다.');
        return;
      }
      Shell.showToast('비밀번호를 변경했습니다.');
    }
    saveAccount(account);
    render();
    closeDialog();
  });

  $('#saveStudy').addEventListener('click', () => {
    account.dailyTarget = Math.max(1, Number($('#dailyTarget').value) || 30);
    saveAccount(account);
    Shell.showToast('학습 설정을 저장했습니다.');
  });

  ['notifyStudy', 'notifyReview', 'notifyEvent'].forEach((id) => {
    $(`#${id}`).addEventListener('change', () => {
      account.notify = {
        study: $('#notifyStudy').checked,
        review: $('#notifyReview').checked,
        event: $('#notifyEvent').checked,
      };
      saveAccount(account);
      Shell.showToast('알림 설정을 저장했습니다.');
    });
  });

  $('#leaveBtn').addEventListener('click', () => {
    if (window.confirm('정말 탈퇴할까요? 이 브라우저의 학습 기록이 함께 지워집니다.')) {
      try {
        ['passcoach9ai:account', 'passcoach9ai:plan', 'passcoach9ai:payments', 'passcoach9ai:wrong-notes', 'passcoach9ai:study-log'].forEach(
          (key) => localStorage.removeItem(key)
        );
      } catch {
        /* ignore */
      }
      Shell.showToast('회원 탈퇴가 완료되었습니다.');
      location.href = 'index.html';
    }
  });
})();
