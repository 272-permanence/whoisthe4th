const BASE = 'http://localhost:8010/api/v1';

const cap = await (await fetch(`${BASE}/auth/captcha`)).json();
const code = [...cap.data.svg.matchAll(/<text[^>]*>(\d)<\/text>/g)].map((m) => m[1]).join('');
const login = await (
  await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123', captchaId: cap.data.captchaId, captchaCode: code }),
  })
).json();
const token = login.data.token;
const auth = { Authorization: `Bearer ${token}` };

for (const id of [1, 2, 3, 4, 5, 6, 7, 8]) {
  const r = await (await fetch(`${BASE}/analytics/recommend/related-pois?poiId=${id}`, { headers: auth })).json();
  console.log(`poiId=${id}`, JSON.stringify(r.data));
}
const hot = await (await fetch(`${BASE}/analytics/behaviors/hot-pois`, { headers: auth })).json();
console.log('hot:', JSON.stringify(hot.data));
const path = await (await fetch(`${BASE}/analytics/behaviors/path?limit=3`, { headers: auth })).json();
console.log('path count:', path.data?.length, 'first:', JSON.stringify(path.data?.[0])?.slice(0, 200));
