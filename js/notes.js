/* 오답노트 저장소. 브라우저 localStorage에 틀린 문제를 모아 둡니다.
   저장 형식: [{ subject, index, topic, q, date }] — 최근 틀린 문제가 앞에 옵니다. */

const WrongNotes = (() => {
  'use strict';

  const KEY = 'passcoach9ai:wrong-notes';

  function load() {
    try {
      const list = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  /* 시크릿 모드 등 저장이 막힌 환경에서도 화면이 멈추지 않도록 실패를 삼킨다 */
  function save(list) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
    } catch {
      /* 저장 불가 환경 */
    }
  }

  const isSame = (item, subject, index) => item.subject === subject && item.index === index;

  /* 같은 문제를 다시 틀리면 날짜만 갱신하고 맨 앞으로 올린다 */
  function add({ subject, index, topic, q }) {
    const list = load().filter((item) => !isSame(item, subject, index));
    list.unshift({ subject, index, topic, q, date: new Date().toISOString() });
    save(list);
  }

  function remove(subject, index) {
    save(load().filter((item) => !isSame(item, subject, index)));
  }

  function clear() {
    save([]);
  }

  function all() {
    return load();
  }

  return { add, remove, clear, all };
})();

/* 학습기록 저장소. 문항별로 가장 최근 풀이만 남겨 정답률을 계산합니다.
   저장 형식: { [subject]: { [index]: { topic, correct, date } } } */
const StudyLog = (() => {
  'use strict';

  const KEY = 'passcoach9ai:study-log';

  function load() {
    try {
      const data = JSON.parse(localStorage.getItem(KEY) || '{}');
      return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    } catch {
      return {};
    }
  }

  function save(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      /* 저장 불가 환경 */
    }
  }

  function record({ subject, index, topic, correct }) {
    const data = load();
    if (!data[subject]) data[subject] = {};
    data[subject][String(index)] = {
      topic,
      correct: !!correct,
      date: new Date().toISOString(),
    };
    save(data);
  }

  function forSubject(subject) {
    return load()[subject] || {};
  }

  function all() {
    return load();
  }

  function rateOf(correct, attempted) {
    return attempted ? Math.round((correct / attempted) * 100) : 0;
  }

  /* 한 과목의 영역(단원)별 푼 문항 · 정답률 */
  function topicStats(subjectId) {
    const bank = typeof QUESTION_BANK !== 'undefined' ? QUESTION_BANK[subjectId] : null;
    if (!bank) return [];

    const log = forSubject(subjectId);
    const order = [];
    const map = new Map();

    bank.questions.forEach((item, index) => {
      if (!map.has(item.topic)) {
        const row = { topic: item.topic, total: 0, attempted: 0, correct: 0 };
        map.set(item.topic, row);
        order.push(row);
      }
      const row = map.get(item.topic);
      row.total += 1;
      const attempt = log[String(index)];
      if (attempt) {
        row.attempted += 1;
        if (attempt.correct) row.correct += 1;
      }
    });

    return order.map((row) => ({ ...row, rate: rateOf(row.correct, row.attempted) }));
  }

  /* 과목 전체 성적 요약 */
  function subjectStats() {
    const bank = typeof QUESTION_BANK !== 'undefined' ? QUESTION_BANK : {};
    return Object.keys(bank).map((id) => {
      const log = forSubject(id);
      const total = bank[id].questions.length;
      let attempted = 0;
      let correct = 0;
      Object.values(log).forEach((item) => {
        attempted += 1;
        if (item.correct) correct += 1;
      });
      return {
        id,
        title: bank[id].title,
        short: bank[id].short,
        total,
        attempted,
        correct,
        rate: rateOf(correct, attempted),
      };
    });
  }

  /* 학습 현황 카드용 요약: 푼 문항 · 정답률 · 학습일 · 연속 학습 */
  function overview() {
    const data = load();
    const attempts = [];
    Object.values(data).forEach((byIndex) => {
      Object.values(byIndex).forEach((item) => attempts.push(item));
    });

    const attempted = attempts.length;
    const correct = attempts.filter((item) => item.correct).length;
    const rate = rateOf(correct, attempted);

    const pad = (n) => String(n).padStart(2, '0');
    const dayKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    const shiftDay = (key, days) => {
      const [year, month, day] = key.split('-').map(Number);
      return dayKey(new Date(year, month - 1, day + days));
    };

    const now = Date.now();
    const week = 7 * 24 * 60 * 60 * 1000;
    const recent = attempts.filter((item) => now - new Date(item.date).getTime() <= week);
    const older = attempts.filter((item) => {
      const age = now - new Date(item.date).getTime();
      return age > week && age <= week * 2;
    });
    let delta = null;
    if (recent.length && older.length) {
      delta =
        rateOf(recent.filter((item) => item.correct).length, recent.length) -
        rateOf(older.filter((item) => item.correct).length, older.length);
    }

    const days = [
      ...new Set(
        attempts
          .map((item) => {
            const date = new Date(item.date);
            return Number.isNaN(date.getTime()) ? null : dayKey(date);
          })
          .filter(Boolean)
      ),
    ].sort();

    let streak = 0;
    if (days.length) {
      const today = dayKey(new Date());
      const last = days[days.length - 1];
      if (last === today || last === shiftDay(today, -1)) {
        let expected = last;
        for (let i = days.length - 1; i >= 0; i -= 1) {
          if (days[i] !== expected) break;
          streak += 1;
          expected = shiftDay(expected, -1);
        }
      }
    }

    return { attempted, correct, rate, delta, studyDays: days.length, streak };
  }

  /* 약점 집중 훈련: 해당 단원을 먼저 담고, 부족하면 같은 과목으로 채운다 */
  function drillIndices(subjectId, topic, limit = 5) {
    const bank = typeof QUESTION_BANK !== 'undefined' ? QUESTION_BANK[subjectId] : null;
    if (!bank || !topic) return [];
    const family = String(topic).split('·')[0].trim();
    const ranked = bank.questions
      .map((item, qi) => {
        let score = 2;
        if (item.topic === topic) score = 0;
        else if (String(item.topic).split('·')[0].trim() === family) score = 1;
        return { qi, score };
      })
      .sort((a, b) => a.score - b.score);
    return ranked.slice(0, limit).map((item) => item.qi);
  }

  return { record, forSubject, all, topicStats, subjectStats, overview, drillIndices };
})();
