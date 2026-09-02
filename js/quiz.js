(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const SECONDS_PER_QUESTION = 90;
  const CIRCLED = ['①', '②', '③', '④', '⑤'];

  /* 탭별로 보여 줄 해설 섹션 */
  const TAB_SECTIONS = {
    all: ['answer', 'concept', 'detail', 'wrong', 'tips'],
    core: ['answer', 'concept', 'tips'],
    wrong: ['answer', 'wrong'],
    similar: [],
  };

  const escapeHtml = Shell.escapeHtml;
  const showToast = Shell.showToast;

  const pad = (n) => String(n).padStart(2, '0');
  const formatTime = (sec) => `${pad(Math.floor(sec / 3600))}:${pad(Math.floor((sec % 3600) / 60))}:${pad(sec % 60)}`;
  const formatShort = (sec) => `${pad(Math.floor(sec / 60))}:${pad(sec % 60)}`;

  const params = new URLSearchParams(location.search);
  const subjectId = params.get('subject') || 'korean';
  const drillTopic = params.get('topic') || '';
  const isDrillRequest = params.get('drill') === '1' && Boolean(drillTopic);

  Shell.init({ activeNav: isDrillRequest ? 'weakness' : 'home' });
  const subject = QUESTION_BANK[subjectId];

  if (!subject) {
    $('#questionText').textContent = '준비되지 않은 과목입니다. 메인 홈에서 다시 선택해 주세요.';
    $('#submitBtn').disabled = true;
    return;
  }

  const questions = subject.questions;
  const total = questions.length;
  const drillLimit = Math.min(Math.max(Number(params.get('limit')) || 5, 1), total);
  const drillSet = isDrillRequest ? StudyLog.drillIndices(subjectId, drillTopic, drillLimit) : null;

  const clampIndex = (n) => (Number.isInteger(n) && n >= 0 && n < total ? n : 0);

  /* ── 상태 ───────────────────────────────── */
  const picks = new Array(total).fill(null);
  const aiOpened = new Set();
  const aiBack = [];
  let similarSet = null;
  let aiTab = 'all';
  /* 오답노트에서 넘어온 경우 해당 문항부터 시작. 집중 훈련은 해당 세트 첫 문항 */
  let index = drillSet && drillSet.length ? drillSet[0] : clampIndex(Number(params.get('q')));
  let graded = false;
  let remaining = (drillSet && drillSet.length ? drillSet.length : total) * SECONDS_PER_QUESTION;
  let timerId;

  if (drillSet && drillSet.length) {
    const back = document.querySelector('.qbar__back');
    if (back) {
      back.href = 'weakness.html';
      back.setAttribute('aria-label', '약점 분석으로 돌아가기');
    }
  }

  const KIND_LABELS = ['기출문제', '기출변형', 'AI문제'];

  function questionKind(i) {
    if (inSimilarMode() || subjectId === 'ai') return 'AI문제';
    return KIND_LABELS[((Number.isInteger(i) ? i : 0) % KIND_LABELS.length + KIND_LABELS.length) % KIND_LABELS.length];
  }

  /* ── 렌더링 ─────────────────────────────── */
  function renderQuestion() {
    const item = questions[index];

    const shownTotal = displayTotal();
    const pos = displayPos();

    $('#barSubject').textContent = subject.title;
    $('#barKind').textContent = questionKind(index);
    $('#barTopic').textContent = item.topic;
    $('#barCount').textContent = `문제 ${pos + 1} / ${shownTotal}`;
    $('#questionText').textContent = item.q;
    $('#progressBar').style.width = `${((pos + 1) / shownTotal) * 100}%`;
    document.title = `${subject.title} ${pos + 1}/${shownTotal} · 공무원 AI`;

    /* 한 번 답을 고르면 그 문항은 바로 채점되고 잠긴다 */
    const locked = graded || picks[index] !== null;

    const list = $('#optionList');
    list.innerHTML = item.options
      .map(
        (text, i) => `
      <label class="option" data-index="${i}">
        <input type="radio" name="answer" value="${i}" ${picks[index] === i ? 'checked' : ''} ${locked ? 'disabled' : ''} />
        <span class="option__mark" aria-hidden="true"></span>
        <span class="option__text">${escapeHtml(text)}</span>
      </label>`
      )
      .join('');

    list.classList.toggle('is-locked', locked);
    paintOptions();

    renderVerdict();
    renderAi();
    renderSimilarBox();
    renderAiBack();

    $('#prevBtn').disabled = pos === 0;
    $('#nextBtn').disabled = pos === shownTotal - 1;

    renderNav();
  }

  /* ── AI 해설 패널 ───────────────────────── */
  /* 해설 데이터가 없는 문항은 기존 explain 문장을 자세한 해설로 대체 */
  function aiInfo(i) {
    const bank = (typeof AI_EXPLANATIONS === 'object' && AI_EXPLANATIONS[subjectId]) || [];
    const info = bank[i] || {};
    return {
      concept: info.concept || [],
      detail: info.detail || [questions[i].explain],
      wrong: info.wrong || {},
      tips: info.tips || [],
    };
  }

  /* 같은 단원 문제를 먼저, 부족하면 같은 과목의 다른 문제로 채운다 */
  function similarIndices(origin, count, extraExclude = []) {
    const skip = new Set([origin, ...extraExclude]);
    const rest = questions.map((q, qi) => ({ q, qi })).filter((entry) => !skip.has(entry.qi));
    const sameTopic = rest.filter((entry) => entry.q.topic === questions[origin].topic);
    const others = rest.filter((entry) => entry.q.topic !== questions[origin].topic);
    const picked = [...sameTopic, ...others].slice(0, count).map(({ qi }) => qi);
    if (picked.length || !extraExclude.length) return picked;
    return similarIndices(origin, count);
  }

  function similarExclude(i) {
    const extra = [];
    if (inSimilarMode()) extra.push(...similarSet.filter((qi) => qi !== i));
    if (aiBack.length) extra.push(aiBack[aiBack.length - 1].index);
    return extra;
  }

  function similarItems(i) {
    return similarIndices(i, 1, similarExclude(i))
      .map(
        (qi) => `
      <li class="similar__item">
        <p class="similar__no">유사문제</p>
        <button class="similar__go" type="button" data-goto="${qi}">바로 풀기 →</button>
      </li>`
      )
      .join('');
  }

  function renderSimilarBox() {
    const box = $('#similarBox');
    const show = inSimilarMode() && !aiOpened.has(index);
    box.hidden = !show;
    if (!show) return;
    $('#similarBoxList').innerHTML = similarItems(index);
  }

  function inSimilarMode() {
    return Boolean(similarSet && similarSet.length && aiBack.length);
  }

  function inDrillMode() {
    return Boolean(drillSet && drillSet.length) && !inSimilarMode();
  }

  function activeSet() {
    if (inSimilarMode()) return similarSet;
    if (drillSet && drillSet.length) return drillSet;
    return null;
  }

  function displayPos() {
    const set = activeSet();
    if (!set) return index;
    const pos = set.indexOf(index);
    return pos >= 0 ? pos : 0;
  }

  function displayTotal() {
    const set = activeSet();
    return set ? set.length : total;
  }

  function goNearby(dir) {
    const set = activeSet();
    if (set) {
      const nextPos = displayPos() + dir;
      if (nextPos < 0 || nextPos >= set.length) return;
      goTo(set[nextPos]);
      return;
    }
    goTo(index + dir);
  }

  function visibleIndices() {
    return activeSet() || questions.map((_, i) => i);
  }

  function sectionHtml(kind, title, items) {
    if (!items.length) return '';
    return `
      <section class="ai__sec ai__sec--${kind}">
        <h4 class="ai__sec-title">${title}</h4>
        <ul class="ai__list">${items.map((text) => `<li>${escapeHtml(text)}</li>`).join('')}</ul>
      </section>`;
  }

  function renderAi() {
    const panel = $('#aiPanel');
    const open = aiOpened.has(index);

    panel.hidden = !open;
    $('#explainBtn').setAttribute('aria-pressed', String(open));
    if (!open) return;

    const item = questions[index];
    const info = aiInfo(index);
    const parts = TAB_SECTIONS[aiTab];
    const items = similarItems(index);

    const wrongList = item.options
      .map((text, i) => ({ text, i }))
      .filter(({ i }) => i !== item.answer)
      .map(({ text, i }) => `${CIRCLED[i]} ${text}: ${info.wrong[i] || '문제가 요구하는 조건과 맞지 않는 선택지입니다.'}`);

    let html = '';

    if (aiTab === 'similar') {
      html = `
        <section class="ai__sec">
          <h4 class="ai__sec-title">이 문제와 비슷한 문제</h4>
          <ul class="similar similar--grid">${items}</ul>
        </section>`;
    } else {
      if (parts.includes('answer')) {
        html += `
        <p class="ai__answer">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M8 12.4l2.7 2.6L16 9.6" /></svg>
          정답: ${CIRCLED[item.answer]} ${escapeHtml(item.options[item.answer])}
        </p>`;
      }
      if (parts.includes('concept')) html += sectionHtml('concept', '핵심 개념', info.concept);
      if (parts.includes('detail')) html += sectionHtml('detail', '자세한 해설', info.detail);
      if (parts.includes('wrong')) html += sectionHtml('wrong', '오답 분석', wrongList);
      if (parts.includes('tips')) html += sectionHtml('tips', '시험장에서 기억할 포인트', info.tips);
    }

    $('#aiMain').innerHTML = html;
    $('#similarList').innerHTML = items;
    $('#aiSide').hidden = aiTab === 'similar';
    $('#aiBody').classList.toggle('is-wide', aiTab === 'similar');

    document.querySelectorAll('.ai__tab').forEach((tab) => {
      const active = tab.dataset.tab === aiTab;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    });
  }

  function paintOptions() {
    const item = questions[index];
    const revealed = graded || picks[index] !== null;

    document.querySelectorAll('.option').forEach((el) => {
      const i = Number(el.dataset.index);
      el.classList.remove('is-selected', 'is-correct', 'is-wrong');

      if (!revealed) {
        if (picks[index] === i) el.classList.add('is-selected');
        return;
      }
      if (i === item.answer) el.classList.add('is-correct');
      else if (picks[index] === i) el.classList.add('is-wrong');
    });
  }

  /* 선택 직후 문제 아래에 정답 여부를 표시 */
  function renderVerdict() {
    const el = $('#verdict');
    const pick = picks[index];

    if (pick === null) {
      el.hidden = true;
      return;
    }

    const item = questions[index];
    const correct = pick === item.answer;

    el.className = `verdict ${correct ? 'is-correct' : 'is-wrong'}`;
    el.innerHTML = correct
      ? `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M8 12.4l2.7 2.6L16 9.6" /></svg>
         정답입니다!`
      : `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" /></svg>
         틀렸습니다. 정답은 ${CIRCLED[item.answer]} ${escapeHtml(item.options[item.answer])}입니다.`;
    el.hidden = false;
  }

  /* 답 선택: 즉시 채점하고 오답은 오답노트에 담는다 */
  function choose(optionIndex) {
    if (graded || picks[index] !== null) return;

    const item = questions[index];
    picks[index] = optionIndex;
    const correct = optionIndex === item.answer;

    StudyLog.record({ subject: subjectId, index, topic: item.topic, correct });
    if (correct) WrongNotes.remove(subjectId, index);
    else WrongNotes.add({ subject: subjectId, index, topic: item.topic, q: item.q });

    renderQuestion();
    showToast(correct ? '정답입니다!' : '틀렸습니다. 오답노트에 담았습니다.');
  }

  function renderNav() {
    const list = activeSet() || questions.map((_, i) => i);
    const done = list.filter((qi) => picks[qi] !== null).length;

    $('#navGrid').classList.toggle('is-similar', inSimilarMode());
    $('#navGrid').innerHTML = list
      .map((qi, di) => {
        const state = qi === index ? 'is-current' : picks[qi] !== null ? 'is-done' : '';
        return `<button class="qdot ${state}" type="button" data-jump="${qi}"
                  aria-label="${di + 1}번 문제${picks[qi] !== null ? ' (완료)' : ''}"
                  ${qi === index ? 'aria-current="true"' : ''}>${di + 1}</button>`;
      })
      .join('');

    $('#navStat').textContent = `${done} / ${list.length} 완료`;
  }

  /* ── 타이머 ─────────────────────────────── */
  function tick() {
    remaining -= 1;
    $('#barTimerText').textContent = formatTime(Math.max(remaining, 0));
    $('#barTimer').classList.toggle('is-urgent', remaining <= 60);

    if (remaining <= 0) {
      stopTimer();
      grade(true);
    }
  }

  function startTimer() {
    $('#barTimerText').textContent = formatTime(remaining);
    clearInterval(timerId);
    timerId = setInterval(tick, 1000);
  }

  function stopTimer() { clearInterval(timerId); }

  /* ── 이동 ───────────────────────────────── */
  function goTo(next) {
    index = Math.min(Math.max(next, 0), total - 1);
    renderQuestion();
    $('#question').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function jumpSimilar(qi) {
    const next = Number(qi);
    if (!Number.isInteger(next) || next < 0 || next >= total || next === index) return;
    const set = similarIndices(index, 3, similarExclude(index));
    similarSet = [next, ...set.filter((i) => i !== next)].slice(0, 3);
    aiBack.push({ index, tab: aiTab });
    goTo(next);
    showToast('유사문제입니다. 푼 뒤 원래 문제로 돌아갈 수 있습니다.');
  }

  function returnToAi() {
    if (!aiBack.length) return;
    const origin = aiBack.pop();
    similarSet = null;
    aiOpened.add(origin.index);
    aiTab = origin.tab || 'all';
    goTo(origin.index);
    $('#aiPanel').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function renderAiBack() {
    const bar = $('#aiBackBar');
    const btn = $('#aiBackBtn');
    if (aiBack.length) {
      const origin = aiBack[aiBack.length - 1];
      const onOrigin = index === origin.index;
      const solved = picks[index] !== null;
      bar.hidden = false;
      btn.textContent = '원래 문제로 돌아가기';
      $('#aiBackText').textContent = onOrigin
        ? '원래 문제로 돌아왔습니다. AI 해설을 다시 열어 보세요.'
        : solved
          ? '유사문제를 풀었습니다. 원래 문제로 돌아갈 수 있습니다.'
          : '유사문제를 풀고 있습니다.';
      return;
    }
    if (drillSet && drillSet.length) {
      bar.hidden = false;
      btn.textContent = '약점 분석으로 돌아가기';
      $('#aiBackText').textContent = '약점 집중 훈련을 풀고 있습니다.';
      return;
    }
    bar.hidden = true;
  }

  /* ── 채점 ───────────────────────────────── */
  function grade(auto = false) {
    const list = visibleIndices();
    const unanswered = list.filter((i) => picks[i] === null).length;
    if (!auto && unanswered > 0 && !confirm(`아직 풀지 않은 문제가 ${unanswered}개 있습니다. 제출하시겠습니까?`)) return;

    stopTimer();
    graded = true;
    list.forEach((i) => aiOpened.add(i));

    const correct = list.reduce((sum, i) => sum + (picks[i] === questions[i].answer ? 1 : 0), 0);
    const spent = list.length * SECONDS_PER_QUESTION - Math.max(remaining, 0);

    $('#resultSubject').textContent = subject.title;
    $('#scoreValue').textContent = Math.round((correct / list.length) * 100);
    $('#scoreCorrect').textContent = `${correct} / ${list.length}`;
    $('#scoreTime').textContent = formatShort(spent);

    const wrong = list
      .map((i) => ({ item: questions[i], i, no: list.indexOf(i) + 1 }))
      .filter(({ item, i }) => picks[i] !== item.answer);

    $('#reviewCount').textContent = wrong.length ? `${wrong.length}문항` : '';
    $('#reviewList').innerHTML = wrong.length
      ? wrong
          .map(
            ({ item, i, no }) => `
        <li class="review__item">
          <p class="review__q">${no}. ${escapeHtml(item.q)}</p>
          <p class="review__answers">
            <span class="review__mine">내 답: <b>${picks[i] === null ? '무응답' : escapeHtml(item.options[picks[i]])}</b></span>
            <span class="review__right">정답: <b>${escapeHtml(item.options[item.answer])}</b></span>
          </p>
          <p class="review__explain">${escapeHtml(item.explain)}</p>
        </li>`
          )
          .join('')
      : '<li class="review__empty">모든 문제를 맞혔습니다. 훌륭합니다!</li>';

    $('#result').hidden = false;
    $('#submitBtn').disabled = true;
    $('#retryBtn').focus();

    if (auto) showToast('시간이 종료되어 자동 제출되었습니다.');
  }

  function retry() {
    picks.fill(null);
    aiOpened.clear();
    aiBack.length = 0;
    similarSet = null;
    aiTab = 'all';
    index = drillSet && drillSet.length ? drillSet[0] : 0;
    graded = false;
    remaining = (drillSet && drillSet.length ? drillSet.length : total) * SECONDS_PER_QUESTION;
    $('#result').hidden = true;
    $('#submitBtn').disabled = false;
    renderQuestion();
    startTimer();
    showToast('처음부터 다시 시작합니다.');
  }

  /* ── 이벤트 ─────────────────────────────── */
  $('#optionList').addEventListener('change', (event) => {
    choose(Number(event.target.value));
  });

  $('#prevBtn').addEventListener('click', () => goNearby(-1));
  $('#nextBtn').addEventListener('click', () => goNearby(1));
  $('#submitBtn').addEventListener('click', () => grade(false));
  $('#retryBtn').addEventListener('click', retry);

  /* AI 해설 열기 · 닫기 */
  $('#explainBtn').addEventListener('click', () => {
    if (aiOpened.has(index)) {
      aiOpened.delete(index);
      renderAi();
      renderSimilarBox();
      return;
    }

    aiOpened.add(index);
    if (!graded) showToast('AI 해설에는 정답이 포함되어 있습니다.');
    renderAi();
    renderSimilarBox();
    $('#aiPanel').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });

  $('#aiBackBtn').addEventListener('click', () => {
    if (aiBack.length) {
      returnToAi();
      return;
    }
    if (drillSet && drillSet.length) location.href = 'weakness.html';
  });

  $('#aiCloseBtn').addEventListener('click', () => {
    aiOpened.delete(index);
    renderAi();
    renderSimilarBox();
    $('#question').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });

  /* 해설 탭 전환 · 유사 문제 이동 */
  $('#aiPanel').addEventListener('click', (event) => {
    const tab = event.target.closest('[data-tab]');
    if (tab) {
      aiTab = tab.dataset.tab;
      renderAi();
      return;
    }

    const jump = event.target.closest('[data-goto]');
    if (jump) jumpSimilar(Number(jump.dataset.goto));
  });

  $('#similarBox').addEventListener('click', (event) => {
    const jump = event.target.closest('[data-goto]');
    if (jump) jumpSimilar(Number(jump.dataset.goto));
  });

  $('#navGrid').addEventListener('click', (event) => {
    const btn = event.target.closest('[data-jump]');
    if (btn) goTo(Number(btn.dataset.jump));
  });

  $('#reviewBtn').addEventListener('click', () => {
    $('#result').hidden = true;
    goTo(visibleIndices()[0]);
    showToast('정답과 해설을 문제마다 확인할 수 있습니다.');
  });

  /* 단축키: 1~4 선택, ←/→ 이동, Esc 닫기 */
  document.addEventListener('keydown', (event) => {
    if (!$('#result').hidden) {
      if (event.key === 'Escape') $('#result').hidden = true;
      return;
    }
    if (event.key === 'ArrowLeft') { goNearby(-1); return; }
    if (event.key === 'ArrowRight') { goNearby(1); return; }

    const n = Number(event.key);
    if (n >= 1 && n <= questions[index].options.length) choose(n - 1);
  });

  renderQuestion();
  startTimer();
  if (drillSet && drillSet.length) showToast(`${drillTopic} 집중 훈련 ${drillSet.length}문제입니다.`);
})();
