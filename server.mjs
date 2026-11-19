import { createServer } from 'node:http';
import { createHash, randomBytes, scrypt, timingSafeEqual, createHmac } from 'node:crypto';
import { promisify } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';

process.umask(0o077);
const data = process.env.DATA_DIR || 'data';
mkdirSync(data, { recursive: true });
const db = new DatabaseSync(data + '/behy.sqlite');
db.exec(`
  PRAGMA journal_mode=WAL;
  PRAGMA foreign_keys=ON;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY, username TEXT COLLATE NOCASE UNIQUE, password TEXT,
    first TEXT NOT NULL, last TEXT NOT NULL, birth TEXT, age INTEGER,
    email TEXT NOT NULL, phone TEXT UNIQUE, google_sub TEXT UNIQUE
  );
  CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id), expires INTEGER);
  CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY, email TEXT NOT NULL, message TEXT NOT NULL, created TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS plus (user_id INTEGER PRIMARY KEY REFERENCES users(id), created TEXT DEFAULT CURRENT_TIMESTAMP);
`);
const files = new Map([
  ['/', ['text/html; charset=utf-8', 'index.html']],
  ['/style.css', ['text/css; charset=utf-8', 'style.css']],
  ['/app.js', ['text/javascript; charset=utf-8', 'app.js']],
].map(([path, [type, name]]) => [path, [type, readFileSync(new URL('./public/' + name, import.meta.url))]]));
const googleId = process.env.GOOGLE_CLIENT_ID;
const googleSecret = process.env.GOOGLE_CLIENT_SECRET;
const base = process.env.PUBLIC_URL ? new URL(process.env.PUBLIC_URL).origin : '';
const googleEnabled = Boolean(googleId && googleSecret && base);
const callback = base + '/auth/google/callback';
const secure = base.startsWith('https:') ? '; Secure' : '';
const oauthKey = randomBytes(32);
const random = () => randomBytes(32).toString('base64url');
const digest = value => createHash('sha256').update(value).digest('base64url');
const derive = promisify(scrypt);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const lifetime = 7 * 24 * 3600;
const limits = new Map();
let pruneAt = 0;

class RequestError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function check(ok, message, status = 400) {
  if (!ok) throw new RequestError(status, message);
}
function cookie(req, name) {
  return (req.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith(name + '='))?.slice(name.length + 1) || '';
}
function setCookie(name, value, age) {
  return `${name}=${value}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${age}${secure}`;
}
function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify(data));
}
function redirect(res, url) { res.writeHead(303, { Location: url }).end(); }
async function body(req) {
  check(req.headers['content-type']?.split(';', 1)[0] === 'application/json', 'قالب درخواست معتبر نیست.', 415);
  let content = '';
  req.setEncoding('utf8');
  for await (const chunk of req) {
    content += chunk;
    check(Buffer.byteLength(content) <= 12000, 'درخواست بیش از حد بزرگ است.', 413);
  }
  try {
    const value = JSON.parse(content);
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  } catch { /* handled below */ }
  throw new RequestError(400, 'درخواست معتبر نیست.');
}
function getUser(req) {
  return db.prepare('SELECT users.id, username, first FROM sessions JOIN users ON users.id = sessions.user_id WHERE token = ? AND expires > ?').get(digest(cookie(req, 'behy')), Date.now());
}
function startSession(req, res, id) {
  const token = random();
  db.prepare('DELETE FROM sessions WHERE expires <= ? OR token = ?').run(Date.now(), digest(cookie(req, 'behy')));
  db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(digest(token), id, Date.now() + lifetime * 1000);
  res.appendHeader('Set-Cookie', setCookie('behy', token, lifetime));
}
function limit(req, scope) {
  const now = Date.now();
  if (now > pruneAt) {
    for (const [key, entry] of limits) if (entry.until <= now) limits.delete(key);
    pruneAt = now + 60000;
  }
  const key = req.socket.remoteAddress + ':' + scope;
  const previous = limits.get(key);
  const entry = previous && previous.until > now ? previous : { until: now + 600000, count: 0 };
  entry.count++;
  limits.set(key, entry);
  check(entry.count <= 20, 'تعداد درخواست‌ها زیاد است. کمی بعد دوباره تلاش کنید.', 429);
}
function safeEqual(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
function validateSignup(input) {
  const { first, last, username, birth, email, phone, password, confirm } = input;
  check([first, last, username, birth, email, phone, password, confirm].every(value => typeof value === 'string'), 'همهٔ فیلدها را پر کنید.');
  check(first.trim().length > 0 && first.length <= 60 && last.trim().length > 0 && last.length <= 60, 'نام و نام خانوادگی معتبر وارد کنید.');
  check(/^[\p{L}\p{N}_.-]{3,32}$/u.test(username), 'نام کاربری باید ۳ تا ۳۲ کاراکتر معتبر داشته باشد.');
  check(email.length <= 254 && emailPattern.test(email), 'ایمیل معتبر وارد کنید.');
  const normalized = phone.replace(/[۰-۹٠-٩]/g, digit => String(digit.charCodeAt(0) & 15)).replace(/[\s-]/g, '').replace(/^0(9\d{9})$/, '+98$1').replace(/^0098/, '+98');
  check(/^\+?[1-9]\d{7,14}$/.test(normalized), 'شمارهٔ همراه معتبر وارد کنید.');
  check(password.length >= 8 && password.length <= 128, 'رمز عبور باید ۸ تا ۱۲۸ کاراکتر داشته باشد.');
  check(password === confirm, 'تکرار رمز عبور یکسان نیست.');
  const now = new Date();
  const date = new Date(birth);
  check(/^\d{4}-\d{2}-\d{2}$/.test(birth) && Number.isFinite(+date) && date.toISOString().slice(0, 10) === birth && date <= now, 'تاریخ تولد معتبر وارد کنید.');
  const age = now.getUTCFullYear() - date.getUTCFullYear() - Number(now.toISOString().slice(5, 10) < birth.slice(5));
  check(input.age !== '' && Number(input.age) === age && age <= 120, 'سن را مطابق تاریخ تولد وارد کنید.');
  return { first: first.trim(), last: last.trim(), username, birth, age, email: email.toLowerCase(), phone: normalized, password };
}
async function signup(req, res) {
  limit(req, 'signup');
  const user = validateSignup(await body(req));
  const salt = random();
  const hash = (await derive(user.password, salt, 64)).toString('hex');
  let id;
  try {
    id = db.prepare('INSERT INTO users (username,password,first,last,birth,age,email,phone) VALUES (?,?,?,?,?,?,?,?)')
      .run(user.username, salt + ':' + hash, user.first, user.last, user.birth, user.age, user.email, user.phone).lastInsertRowid;
  } catch (error) {
    if (error.errcode === 2067) throw new RequestError(409, 'این شماره یا نام کاربری قبلاً ثبت شده است.');
    throw error;
  }
  startSession(req, res, id);
  json(res, { first: user.first }, 201);
}
async function login(req, res) {
  limit(req, 'login');
  const { username, password } = await body(req);
  check(typeof username === 'string' && typeof password === 'string' && username.length <= 32 && password.length <= 128, 'مشخصات ورود معتبر نیست.');
  const user = db.prepare('SELECT id, first, password FROM users WHERE username = ?').get(username);
  const [salt, hash] = (user?.password || 'invalid:' + '0'.repeat(128)).split(':');
  const actual = (await derive(password, salt, 64)).toString('hex');
  check(safeEqual(hash, actual) && user, 'نام کاربری یا رمز عبور اشتباه است.', 401);
  startSession(req, res, user.id);
  json(res, { first: user.first });
}
function oauthSignature(value) {
  return createHmac('sha256', oauthKey).update(value).digest('base64url');
}
function googleStart(res) {
  if (!googleEnabled) return redirect(res, '/?google=unavailable');
  const state = random();
  const verifier = random();
  const payload = [state, verifier, Date.now()].join('.');
  res.setHeader('Set-Cookie', setCookie('behy_oauth', payload + '.' + oauthSignature(payload), 600));
  const params = new URLSearchParams({ client_id: googleId, redirect_uri: callback, response_type: 'code', scope: 'openid email profile', state, code_challenge: digest(verifier), code_challenge_method: 'S256' });
  redirect(res, 'https://accounts.google.com/o/oauth2/v2/auth?' + params);
}
async function googleFinish(req, res, url) {
  const [state, verifier, issued, signature] = cookie(req, 'behy_oauth').split('.');
  const code = url.searchParams.get('code');
  res.setHeader('Set-Cookie', setCookie('behy_oauth', '', 0));
  if (!googleEnabled || !signature || !code || Date.now() - Number(issued) > 600000 ||
      state !== url.searchParams.get('state') || !safeEqual(signature, oauthSignature([state, verifier, issued].join('.')))) {
    return redirect(res, '/?google=failed');
  }
  try {
    const token = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', body: new URLSearchParams({ code, client_id: googleId, client_secret: googleSecret, redirect_uri: callback, code_verifier: verifier, grant_type: 'authorization_code' }), signal: AbortSignal.timeout(10000)
    });
    if (!token.ok) return redirect(res, '/?google=failed');
    const { access_token } = await token.json();
    const profile = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: 'Bearer ' + access_token }, signal: AbortSignal.timeout(10000)
    });
    if (!profile.ok) return redirect(res, '/?google=failed');
    const user = await profile.json();
    if (!user.sub || !user.email || user.email_verified !== true) return redirect(res, '/?google=failed');
    db.prepare('INSERT OR IGNORE INTO users (google_sub, email, first, last) VALUES (?, ?, ?, ?)')
      .run(user.sub, user.email, user.given_name || user.name || 'کاربر', user.family_name || '');
    startSession(req, res, db.prepare('SELECT id FROM users WHERE google_sub = ?').get(user.sub).id);
    redirect(res, '/');
  } catch {
    redirect(res, '/?google=failed');
  }
}

const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  try {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;
    if (req.method === 'GET') {
      if (files.has(path)) {
        const [type, content] = files.get(path);
        return res.writeHead(200, { 'Content-Type': type }).end(content);
      }
      if (path === '/api/session') return json(res, { user: getUser(req) || null });
      if (path === '/auth/google') return googleStart(res);
      if (path === '/auth/google/callback') return await googleFinish(req, res, url);
    }
    if (req.method === 'POST') {
      const origin = req.headers.origin;
      check(!origin || (base ? origin === base : new URL(origin).host === req.headers.host), 'مبدأ درخواست معتبر نیست.', 403);
      if (path === '/api/signup') return await signup(req, res);
      if (path === '/api/login') return await login(req, res);
      if (path === '/api/logout') {
        db.prepare('DELETE FROM sessions WHERE token = ?').run(digest(cookie(req, 'behy')));
        res.setHeader('Set-Cookie', setCookie('behy', '', 0));
        return json(res, {});
      }
      if (path === '/api/support') {
        limit(req, 'support');
        const { email, message } = await body(req);
        check(typeof email === 'string' && email.length <= 254 && emailPattern.test(email), 'ایمیل معتبر وارد کنید.');
        check(typeof message === 'string' && message.trim().length && message.length <= 2000, 'پیام باید بین ۱ تا ۲۰۰۰ کاراکتر باشد.');
        db.prepare('INSERT INTO messages (email, message) VALUES (?, ?)').run(email, message.trim());
        return json(res, {}, 201);
      }
      if (path === '/api/plus') {
        const user = getUser(req);
        check(user, 'برای عضویت ابتدا وارد شوید.', 401);
        db.prepare('INSERT OR IGNORE INTO plus (user_id) VALUES (?)').run(user.id);
        return json(res, {});
      }
    }
    json(res, { error: 'صفحه پیدا نشد.' }, 404);
  } catch (error) {
    if (res.destroyed) return;
    if (!(error instanceof RequestError)) console.error(error);
    json(res, { error: error.status ? error.message : 'خطای موقت سرور. دوباره تلاش کنید.' }, error.status || 500);
  }
});
server.listen(Number(process.env.PORT || 3000), process.env.HOST || '0.0.0.0', () => console.log('Behy listening on port ' + server.address().port));
