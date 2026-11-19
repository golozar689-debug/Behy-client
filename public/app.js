const paths = {
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Zm9 9-9 5-9-5m18 4-9 5-9-5"/>',
  arrow: '<path d="M19 12H5m6-6-6 6 6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  video: '<rect x="3" y="5" width="18" height="14" rx="4"/><path d="m10 9 5 3-5 3Z"/>',
  bolt: '<path d="m13 2-9 12h7l-1 8 10-12h-7l1-8Z"/>',
  bot: '<rect x="4" y="7" width="16" height="13" rx="3"/><path d="M12 7V3m-4 9v2m8-2v2M2 12v4m20-4v4"/>',
  spark: '<path d="M12 2c0 6 4 10 10 10-6 0-10 4-10 10 0-6-4-10-10-10 6 0 10-4 10-10Z"/>',
  chat: '<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l1.5-4A8.5 8.5 0 1 1 21 11.5Z"/><path d="M9 12h7"/>',
};
function drawIcons(root) {
  for (const icon of root.querySelectorAll('[data-icon]')) {
    icon.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + paths[icon.dataset.icon] + '</svg>';
  }
}
drawIcons(document);

const canvas = document.querySelector('#waves');
const ctx = canvas.getContext('2d');
function drawWaves() {
  if (!ctx) return;
  const { width, height } = canvas.getBoundingClientRect();
  const scale = Math.min(devicePixelRatio, 2);
  canvas.width = width * scale;
  canvas.height = height * scale;
  ctx.scale(scale, scale);
  const flow = ctx.createLinearGradient(0, 0, width, height);
  flow.addColorStop(0, '#419a7b00');
  flow.addColorStop(.23, '#52dfab88');
  flow.addColorStop(.53, '#75ffd025');
  flow.addColorStop(.78, '#59ecc180');
  flow.addColorStop(1, '#77e8b600');
  ctx.strokeStyle = flow;
  ctx.lineWidth = .7;
  for (let row = 0; row < 42; row++) {
    ctx.beginPath();
    for (let step = 0; step <= 180; step++) {
      const t = step / 180;
      const envelope = .35 + Math.abs(t - .5) * 1.9;
      const y = height * (.74 + Math.sin(t * 10 - row * .045) * envelope * .14 + (row - 21) * .009 * envelope);
      if (step === 0) ctx.moveTo(0, y);
      else ctx.lineTo(t * width, y);
    }
    ctx.stroke();
  }
  for (let index = 0; index < 115; index++) {
    const x = (Math.sin(index * 135.73) * 10000 % 1 + 1) % 1;
    const y = (Math.sin(index * 73.19) * 10000 % 1 + 1) % 1;
    ctx.fillStyle = index % 12 === 0 ? '#9dffd5a0' : '#8eecc736';
    ctx.fillRect(x * width, y * height, index % 12 === 0 ? 2 : 1, index % 12 === 0 ? 2 : 1);
  }
}
new ResizeObserver(drawWaves).observe(canvas);

const modal = document.querySelector('#modal');
const content = document.querySelector('#modal-content');
const account = document.querySelector('.account');
const support = document.querySelector('#support');
const toggle = document.querySelector('#support-toggle');
const plus = document.querySelector('#join-plus');
let user = null;

async function call(path, data) {
  const response = await fetch(path, data === undefined ? undefined : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}
function show(markup) {
  content.innerHTML = markup;
  if (!modal.open) modal.showModal();
}
function renderAccount() {
  if (!user) {
    account.innerHTML = '<button class="plain" data-open="login">ورود</button><button class="primary" data-open="signup">ثبت‌نام <span data-icon="arrow"></span></button>';
    drawIcons(account);
    return;
  }
  account.innerHTML = '<span></span><button class="plain" id="logout">خروج</button>';
  account.querySelector('span').textContent = user.first;
}
function auth(mode) {
  const signup = mode === 'signup';
  show(`<h2>${signup ? 'ثبت‌نام در بهی' : 'ورود به بهی'}</h2>
    ${signup ? '<a class="google" href="/auth/google">ثبت‌نام با گوگل</a>' : ''}
    <form id="auth-form">
    ${signup ? '<div class="fields"><label>نام<input name="first" autocomplete="given-name" maxlength="60" required></label><label>نام خانوادگی<input name="last" autocomplete="family-name" maxlength="60" required></label><label>سن<input name="age" type="number" min="0" max="120" required></label><label>تاریخ تولد (میلادی)<input name="birth" type="date" autocomplete="bday" required></label></div><label>ایمیل<input name="email" type="email" dir="ltr" autocomplete="email" maxlength="254" required></label><label>شماره همراه<input name="phone" type="tel" dir="ltr" autocomplete="tel" maxlength="24" required></label>' : ''}
    <label>نام کاربری<input name="username" autocomplete="username" maxlength="32" required></label>
    <label>رمز عبور<input name="password" type="password" dir="ltr" autocomplete="${signup ? 'new-password' : 'current-password'}" maxlength="128" required></label>
    ${signup ? '<label>تکرار رمز عبور<input name="confirm" type="password" dir="ltr" autocomplete="new-password" maxlength="128" required></label>' : ''}
    <button class="primary">${signup ? 'ساخت حساب' : 'ورود'}</button><p class="status" role="status"></p></form>
    <div class="switch">${signup ? 'حساب داری؟' : 'حساب نداری؟'} <button class="plain" data-open="${signup ? 'login' : 'signup'}">${signup ? 'وارد شو' : 'ثبت‌نام کن'}</button></div>`);
  content.querySelector('form').addEventListener('submit', submitForm('/api/' + mode, result => {
    user = result;
    renderAccount();
    modal.close();
  }));
}
function submitForm(path, onSuccess) {
  return async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = form.querySelector('.status');
    const button = form.querySelector('button[type="submit"], button:not([type])');
    status.textContent = '';
    button.disabled = true;
    try {
      onSuccess(await call(path, Object.fromEntries(new FormData(form))));
    } catch (error) {
      status.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  };
}
function setSupport(open) {
  support.hidden = !open;
  toggle.setAttribute('aria-expanded', String(open));
  if (open) support.querySelector('input').focus();
  else toggle.focus();
}
toggle.addEventListener('click', () => setSupport(support.hidden));
document.querySelector('#support-close').addEventListener('click', () => setSupport(false));
document.querySelector('#support-form').addEventListener('submit', submitForm('/api/support', () => {
  const form = document.querySelector('#support-form');
  form.reset();
  form.querySelector('.status').textContent = 'پیام شما ثبت شد.';
}));
document.querySelector('#modal-close').addEventListener('click', () => modal.close());
document.addEventListener('click', async event => {
  const open = event.target.closest('[data-open]')?.dataset.open;
  if (open === 'agents') {
    show('<h2>ایجنت‌های هوش مصنوعی</h2><a class="tool-link" target="_blank" rel="noopener" href="https://chatgpt.com/">ChatGPT <span>↗</span></a><a class="tool-link" target="_blank" rel="noopener" href="https://gemini.google.com/">Google Gemini <span>↗</span></a><a class="tool-link" target="_blank" rel="noopener" href="https://claude.ai/">Claude <span>↗</span></a>');
  } else if (open) auth(open);
  if (event.target.id === 'logout') {
    try {
      await call('/api/logout', {});
      user = null;
      renderAccount();
    } catch {
      show('<h2>خروج انجام نشد</h2><p>دوباره تلاش کنید.</p>');
    }
  }
});
plus.addEventListener('click', async () => {
  if (!user) return auth('signup');
  plus.disabled = true;
  try {
    await call('/api/plus', {});
    show('<h2>عضویت در پلاس</h2><p>درخواست عضویت شما ثبت شد.</p>');
  } catch (error) {
    show('<h2>عضویت در پلاس</h2><p class="status"></p>');
    content.querySelector('.status').textContent = error.message;
  } finally {
    plus.disabled = false;
  }
});
try {
  ({ user } = await call('/api/session'));
  renderAccount();
} catch { /* public content remains available */ }
const google = new URL(location.href).searchParams.get('google');
if (google === 'unavailable' || google === 'failed') {
  history.replaceState(null, '', '/');
  show(google === 'unavailable'
    ? '<h2>ثبت‌نام با گوگل</h2><p>ثبت‌نام با گوگل هنوز برای این سایت فعال نشده است.</p><button class="primary" data-open="signup">ثبت‌نام با شماره همراه</button>'
    : '<h2>ثبت‌نام با گوگل</h2><p>ورود از گوگل کامل نشد. می‌توانید دوباره تلاش کنید.</p><a class="google" href="/auth/google">تلاش دوباره</a>');
}
