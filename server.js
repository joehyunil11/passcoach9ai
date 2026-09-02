/* 정적 파일 서버 + AI 선생님 중계.
   API 키는 .env에만 두고 브라우저로는 보내지 않습니다. */

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 5500;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

const SYSTEM = `당신은 대한민국 9급 공무원 시험(국어, 영어, 한국사, 행정법, 행정학)을 가르치는 선생님입니다.
- 질문에 정확한 정답과 이유를 한국어로 분명히 답하세요.
- 선택형 문제면 정답 번호와 지문을 먼저 쓰고, 왜 맞는지와 오답이 왜 틀리는지 짧게 설명하세요.
- 사실이 불확실하면 추측하지 말고 모른다고 말한 뒤, 확인해야 할 법령·연도·개념을 알려 주세요.
- 핵심만 간결하게, 수험생이 바로 외울 수 있게 쓰세요.`;

function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  fs.readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const eq = trimmed.indexOf('=');
      if (eq < 1) return;
      const name = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
      if (name && value && !process.env[name]) process.env[name] = value;
    });
}

loadEnv();

function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function supabaseConfig() {
  const url = (process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const key = (process.env.SUPABASE_ANON_KEY || '').trim();
  if (!url || !key) return null;
  return { url, key };
}

async function fetchSubjectsFromSupabase() {
  const cfg = supabaseConfig();
  if (!cfg) {
    throw Object.assign(new Error('NO_SUPABASE'), { code: 'NO_SUPABASE' });
  }
  const endpoint = `${cfg.url}/rest/v1/subjects?select=id,name,code,created_at&order=id.asc`;
  const res = await fetch(endpoint, {
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      Accept: 'application/json',
    },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (data && data.message) ||
      (data && data.error_description) ||
      (data && data.hint) ||
      `Supabase 응답 오류 (${res.status})`;
    throw new Error(message);
  }
  if (!Array.isArray(data)) throw new Error('과목 목록 형식이 올바르지 않습니다.');
  return data;
}

function provider() {
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) return 'gemini';
  if (process.env.GROQ_API_KEY) return 'groq';
  return null;
}

function clientOpenAIKey(value) {
  const key = typeof value === 'string' ? value.trim().slice(0, 400) : '';
  return key.startsWith('sk-') ? key : '';
}

async function askGemini(messages) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const models = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-1.5-flash'];
  const contents = messages.map((item) => ({
    role: item.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: item.content }],
  }));
  const body = JSON.stringify({
    system_instruction: { parts: [{ text: SYSTEM }] },
    contents,
    generationConfig: { temperature: 0.2, maxOutputTokens: 1200 },
  });

  let lastError = 'Gemini 응답에 실패했습니다.';
  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const data = await res.json();
    if (!res.ok) {
      lastError = data.error && data.error.message ? data.error.message : lastError;
      continue;
    }
    const text = ((data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [])
      .map((part) => part.text || '')
      .join('')
      .trim();
    if (text) return text;
    lastError = '모델이 빈 답을 보냈습니다.';
  }
  throw new Error(lastError);
}

async function askChatGPT(key, messages) {
  const models = ['gpt-4o', 'gpt-4o-mini'];
  let lastError = 'ChatGPT 응답에 실패했습니다.';
  for (const model of models) {
    try {
      return await askOpenAI('https://api.openai.com/v1/chat/completions', key, model, messages);
    } catch (err) {
      lastError = err.message || lastError;
    }
  }
  throw new Error(lastError);
}

async function askOpenAI(url, key, model, messages) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 1200,
      messages: [{ role: 'system', content: SYSTEM }, ...messages],
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error((data.error && data.error.message) || 'AI 응답에 실패했습니다.');
  }
  const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!text) throw new Error('모델이 빈 답을 보냈습니다.');
  return String(text).trim();
}

async function askModel(messages, requestKey) {
  const openaiKey = process.env.OPENAI_API_KEY || requestKey;
  if (openaiKey) return askChatGPT(openaiKey, messages);
  const kind = provider();
  if (kind === 'gemini') return askGemini(messages);
  if (kind === 'groq') {
    return askOpenAI('https://api.groq.com/openai/v1/chat/completions', process.env.GROQ_API_KEY, 'llama-3.3-70b-versatile', messages);
  }
  throw Object.assign(new Error('NO_KEY'), { code: 'NO_KEY' });
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('질문이 너무 깁니다.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);

  if (url === '/api/health' && req.method === 'GET') {
    const kind = provider();
    const supabase = Boolean(supabaseConfig());
    return json(res, 200, { ok: Boolean(kind) || supabase, provider: kind, supabase });
  }

  if (url === '/api/subjects' && req.method === 'GET') {
    try {
      const subjects = await fetchSubjectsFromSupabase();
      return json(res, 200, { source: 'supabase', subjects });
    } catch (err) {
      if (err.code === 'NO_SUPABASE') {
        return json(res, 503, {
          error: 'NO_SUPABASE',
          hint: '.env에 SUPABASE_URL과 SUPABASE_ANON_KEY를 넣고 node server.js를 다시 실행해 주세요.',
        });
      }
      return json(res, 502, {
        error: err.message || 'Supabase 과목 조회에 실패했습니다.',
        hint: 'subjects 테이블과 RLS(익명 select 허용)를 확인해 주세요.',
      });
    }
  }

  if (url === '/api/ask' && req.method === 'POST') {
    try {
      const raw = await readBody(req, 80_000);
      const payload = raw ? JSON.parse(raw) : {};
      const messages = Array.isArray(payload.messages) ? payload.messages : [];
      const clean = messages
        .filter((item) => item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string')
        .slice(-12)
        .map((item) => ({ role: item.role, content: item.content.slice(0, 2000) }));
      if (!clean.length || clean[clean.length - 1].role !== 'user') {
        return json(res, 400, { error: '질문을 입력해 주세요.' });
      }
      const requestKey = clientOpenAIKey(payload.apiKey);
      if (!provider() && !requestKey) {
        return json(res, 503, {
          error: 'NO_KEY',
          hint: 'ChatGPT 연결에서 OpenAI API 키를 저장하거나, .env에 OPENAI_API_KEY를 넣고 node server.js로 다시 실행해 주세요.',
        });
      }
      const answer = await askModel(clean, requestKey);
      return json(res, 200, { answer });
    } catch (err) {
      const status = err.code === 'NO_KEY' ? 503 : 502;
      return json(res, status, { error: err.message || 'AI 응답에 실패했습니다.' });
    }
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    return res.end('method');
  }

  let file = url === '/' ? '/index.html' : url;
  const fp = path.normalize(path.join(ROOT, file));
  if (!fp.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end('forbidden');
  }
  fs.readFile(fp, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('nf');
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(fp)] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  const kind = provider();
  const supabase = Boolean(supabaseConfig());
  console.log(`ready on http://localhost:${PORT}`);
  console.log(kind ? `AI provider: ${kind}` : 'AI key missing: copy .env.example to .env and add OPENAI_API_KEY');
  console.log(supabase ? 'Supabase: connected ( /api/subjects )' : 'Supabase: missing SUPABASE_URL / SUPABASE_ANON_KEY in .env');
});
