/* 나의 성적: 과목 탭 · 영역별 푼 문항 · 정답률 · 난이도 막대 */

(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const esc = Shell.escapeHtml;

  Shell.init({ activeNav: 'grades' });

  const TABS = [
    { id: 'korean', label: '9급 국어' },
    { id: 'english', label: '9급 영어' },
    { id: 'history', label: '한국사' },
    { id: 'adminlaw', label: '행정법' },
    { id: 'adminsci', label: '행정학' },
    { id: 'etc', label: '기타' },
  ];

  const params = new URLSearchParams(location.search);
  let subjectId = TABS.some((tab) => tab.id === params.get('subject')) ? params.get('subject') : 'korean';

  function barClass(rate, attempted) {
    if (!attempted) return 'is-empty';
    if (rate >= 70) return '';
    if (rate >= 60) return 'is-mid';
    return 'is-low';
  }

  function renderTabs() {
    $('#tabRow').innerHTML = TABS.map(
      (tab) => `
      <button class="record__tab${tab.id === subjectId ? ' is-active' : ''}" type="button"
              role="tab" data-subject="${tab.id}" aria-selected="${tab.id === subjectId}">${esc(tab.label)}</button>`
    ).join('');
  }

  function renderTable() {
    const allLink = $('#allLink');
    if (subjectId === 'etc') {
      allLink.href = 'index.html';
      allLink.textContent = '과목 선택하기 >';
    } else {
      allLink.href = `quiz.html?subject=${encodeURIComponent(subjectId)}`;
      allLink.textContent = '전체 문제 보기 >';
    }

    const rows = subjectId === 'etc' ? [] : StudyLog.topicStats(subjectId);
    if (!rows.length) {
      $('#gradesBody').innerHTML = `
        <tr><td class="record__empty" colspan="4">이 과목에는 아직 표시할 영역이 없습니다.</td></tr>`;
      return;
    }

    $('#gradesBody').innerHTML = rows
      .map(
        (row) => `
      <tr>
        <td class="record__topic">${esc(row.topic)}</td>
        <td class="record__count">${row.total} 문제</td>
        <td class="record__rate">${row.attempted ? `${row.rate}%` : '—'}</td>
        <td>
          <span class="bar ${barClass(row.rate, row.attempted)}" aria-hidden="true">
            <span style="width:${row.attempted ? row.rate : 0}%"></span>
          </span>
        </td>
      </tr>`
      )
      .join('');
  }

  function render() {
    renderTabs();
    renderTable();
  }

  render();

  $('#tabRow').addEventListener('click', (event) => {
    const btn = event.target.closest('[data-subject]');
    if (!btn) return;
    subjectId = btn.dataset.subject;
    render();
  });
})();
