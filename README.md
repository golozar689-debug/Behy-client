# بهی

سایت فارسی راست‌چین با بخش‌های ویدیو، ابزارهای هوش مصنوعی، ثبت درخواست پلاس و پیام به پشتیبانی.

## اجرا

به Node.js نسخهٔ ۲۴ یا بالاتر نیاز دارید. وابستگی خارجی برای نصب وجود ندارد.

```sh
npm test
npm start
```

سرور به‌صورت پیش‌فرض روی پورت ۳۰۰۰ گوش می‌دهد. داده‌ها در `data/behy.sqlite` ذخیره می‌شوند. برای استقرار، از فضای ذخیره‌سازی پایدار و HTTPS استفاده کنید و مبدأ عمومی HTTPS را در `PUBLIC_URL` تنظیم کنید. GitHub Pages به‌تنهایی سرور Node.js را اجرا نمی‌کند.

## ثبت‌نام

ثبت‌نام محلی شماره همراه و مشخصات اولیه را دریافت می‌کند و رمز را به‌صورت هش‌شده ذخیره می‌کند. ورود محلی با نام کاربری و رمز عبور است. در این نسخه تأیید پیامکی شماره وجود ندارد.

برای فعال کردن گوگل، در Google Cloud یک OAuth Client از نوع Web application ایجاد کنید. آدرس بازگشت را برابر با `PUBLIC_URL/auth/google/callback` قرار دهید و `GOOGLE_CLIENT_ID` و `GOOGLE_CLIENT_SECRET` را در تنظیمات خصوصی محیط یا فایل محلی `.env` ثبت کنید. در محیط با شبکهٔ محدود، سرور برای OAuth به `oauth2.googleapis.com` و `openidconnect.googleapis.com` نیاز دارد.

## پشتیبانی و پلاس

پیام‌ها در جدول `messages` ثبت می‌شوند. اپراتور می‌تواند با دسترسی به سرور آن‌ها را بخواند و به ایمیل ثبت‌شده پاسخ دهد. این نسخه ارسال ایمیل خودکار ندارد.

```sh
node --env-file-if-exists=.env --input-type=module -e 'import {DatabaseSync} from "node:sqlite"; const db = new DatabaseSync((process.env.DATA_DIR || "data") + "/behy.sqlite", { readOnly: true }); console.table(db.prepare("SELECT id, email, message, created FROM messages ORDER BY id DESC").all());'
```

بخش پلاس درخواست‌ها را در جدول `plus` ذخیره می‌کند. درگاه پرداخت یا سرویس اشتراک پولی متصل نیست. بخش‌های یوتیوب به جستجوی مرتبط و بخش ایجنت‌ها به ابزارهای بیرونی پیوند دارند.
