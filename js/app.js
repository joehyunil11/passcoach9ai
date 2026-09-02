/* 메인 홈 전용: 과목 카드 · 학습 도구 카드 렌더링과 이동 처리 */

(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const esc = Shell.escapeHtml;
  const ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6.5l5.5 5.5L13 17.5"/></svg>';

  /* Supabase 행(code/name)을 홈 카드 형식으로 맞춘다. 로컬 SUBJECTS 메타를 우선 사용 */
  const LOCAL_BY_ID = Object.fromEntries(SUBJECTS.map((item) => [item.id, item]));

  function mapSubjectRow(row) {
    const code = String(row.code || '').trim();
    const local = LOCAL_BY_ID[code] || {};
    return {
      id: code || `subject-${row.id}`,
      title: row.name || local.title || code,
      cta: local.cta || '문제 풀기',
      meta: local.meta || 'Supabase',
      emoji: local.emoji || '📘',
      quiz: local.quiz !== undefined ? local.quiz : true,
      tags: local.tags || [],
      variant: local.variant,
      badge: local.badge,
      dbId: row.id,
    };
  }

  let subjectCards = SUBJECTS.slice();

  function renderSubjects() {
    const grid = $('#subjectGrid');
    if (!grid) return;
    grid.innerHTML = subjectCards
      .map(
        (item) => `
      <button class="card${item.variant === 'ai' ? ' card--ai' : ''}" type="button" data-subject="${esc(item.id)}">
        ${item.badge ? `<em class="card__badge">${esc(item.badge)}</em>` : ''}
        <span class="card__title">${esc(item.title)}</span>
        <span class="card__cta">${esc(item.cta)}${ARROW}</span>
        <span class="card__foot">
          <span class="card__meta">${esc(item.meta)}</span>
          <span class="card__emoji" aria-hidden="true">${item.emoji}</span>
        </span>
      </button>`
      )
      .join('');
  }

  function renderFeatures() {
    $('#featureGrid').innerHTML = FEATURES
      .map(
        (item) => `
      <button class="feature" type="button" style="--accent:${item.accent}" data-feature="${esc(item.id)}">
        <span class="feature__title">${esc(item.title)}</span>
        <span class="feature__desc">${esc(item.desc)}</span>
        <span class="feature__cta">바로가기${ARROW}</span>
      </button>`
      )
      .join('');
  }

  async function loadSubjects() {
    try {
      const res = await fetch('/api/subjects');
      const data = await res.json();
      if (!res.ok || !Array.isArray(data.subjects) || !data.subjects.length) return;
      subjectCards = data.subjects.map(mapSubjectRow);
      renderSubjects();
    } catch (_) {
      /* 실패 시 로컬 SUBJECTS 유지 */
    }
  }

  Shell.init({ activeNav: 'home' });
  renderSubjects();
  renderFeatures();
  loadSubjects();

  /* 카드 클릭 → 해당 화면으로 이동, 없으면 준비 중 안내 */
  document.addEventListener('click', (event) => {
    const card = event.target.closest('[data-subject]');
    if (card) {
      const subject = subjectCards.find((item) => item.id === card.dataset.subject);
      if (!subject) return;
      if (subject.quiz) location.href = `quiz.html?subject=${encodeURIComponent(subject.id)}`;
      else Shell.showToast(`${subject.title} 기능은 준비 중입니다.`);
      return;
    }

    const tool = event.target.closest('[data-feature]');
    if (tool) {
      const feature = FEATURES.find((item) => item.id === tool.dataset.feature);
      if (feature.href) location.href = feature.href;
      else Shell.showToast(`${feature.title} 기능은 준비 중입니다.`);
    }
  });
})();
