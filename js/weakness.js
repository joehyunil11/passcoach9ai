/* 나의 약점 분석: 틀린 문항 요약 · AI 분석 · 집중 훈련 5문제 */

(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const esc = Shell.escapeHtml;
  const DRILL_COUNT = 5;

  Shell.init({ activeNav: 'weakness' });

  function topicFamily(topic) {
    return String(topic).split('·')[0].trim();
  }

  function topicShort(topic) {
    const parts = String(topic).split('·').map((part) => part.trim()).filter(Boolean);
    return parts.length > 1 ? parts[parts.length - 1] : parts[0] || topic;
  }

  function hasJong(text) {
    const ch = text[text.length - 1];
    if (!ch) return false;
    const code = ch.charCodeAt(0);
    if (code < 0xac00 || code > 0xd7a3) return false;
    return (code - 0xac00) % 28 !== 0;
  }

  function analysisText(topics) {
    const names = topics.map(topicShort);
    if (!names.length) return '아직 특정 영역의 오답 패턴이 충분하지 않습니다.';
    if (names.length === 1) return `${names[0]} 영역에서 오답률이 높습니다.`;
    const a = names[0];
    const b = names[1];
    return `${a}${hasJong(a) ? '과' : '와'} ${b} 영역에서 오답률이 높습니다.`;
  }

  function drillHref(subjectId, topic) {
    const query = new URLSearchParams({
      subject: subjectId,
      drill: '1',
      topic,
      limit: String(DRILL_COUNT),
    });
    return `quiz.html?${query.toString()}`;
  }

  function reports() {
    return StudyLog.subjectStats()
      .map((subject) => {
        const topics = StudyLog.topicStats(subject.id)
          .map((row) => ({ ...row, wrong: row.attempted - row.correct, family: topicFamily(row.topic) }))
          .filter((row) => row.wrong > 0);
        if (!topics.length) return null;

        const familyWrong = {};
        topics.forEach((row) => {
          familyWrong[row.family] = (familyWrong[row.family] || 0) + row.wrong;
        });
        const [family, familyCount] = Object.entries(familyWrong).sort((a, b) => b[1] - a[1])[0];
        const weakTopics = [...topics].sort((a, b) => a.rate - b.rate || b.wrong - a.wrong);
        const drillTopic = weakTopics[0].topic;

        return {
          subjectId: subject.id,
          headline: `${subject.short} ${family} 문제 ${familyCount}개 틀림`,
          analysis: analysisText(weakTopics.slice(0, 2).map((row) => row.topic)),
          drillTopic,
          drillLabel: `${topicShort(drillTopic)} 문제 ${DRILL_COUNT}개 풀기`,
        };
      })
      .filter(Boolean);
  }

  function cardHtml(item, { recommended = false } = {}) {
    return `
      <article class="weak__report">
        ${recommended ? '<p class="weak__badge">추천 훈련</p>' : ''}
        <p class="weak__headline">${esc(item.headline)}</p>
        <section class="weak__block">
          <h3 class="weak__block-title">AI 분석</h3>
          <p class="weak__block-text">${esc(item.analysis)}</p>
        </section>
        <section class="weak__block">
          <h3 class="weak__block-title">약점 집중 훈련</h3>
          <a class="btn btn--primary weak__drill" href="${esc(drillHref(item.subjectId, item.drillTopic))}">${esc(item.drillLabel)}</a>
        </section>
      </article>`;
  }

  function render() {
    const list = reports();

    if (!list.length) {
      $('#weakList').innerHTML = `
        <p class="weak__empty">아직 틀린 문제가 없어 약점을 특정할 수 없습니다.<br />아래는 9급 국어에서 자주 보완하는 유형입니다.</p>
        ${cardHtml(
          {
            subjectId: 'korean',
            headline: '국어 문법 문제 12개 틀림',
            analysis: '품사와 문장 성분 영역에서 오답률이 높습니다.',
            drillTopic: '품사',
            drillLabel: `품사 문제 ${DRILL_COUNT}개 풀기`,
          },
          { recommended: true }
        )}`;
      return;
    }

    $('#weakList').innerHTML = list.map((item) => cardHtml(item)).join('');
  }

  render();
})();
