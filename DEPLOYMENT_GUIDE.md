# DEPLOYMENT_GUIDE.md — دليل النشر

## المتطلبات
- Node.js ≥ 22.5 (يُفضَّل 24+ — يستخدم `node:sqlite` المدمج، بلا اعتماديات أصلية)
- خادم Linux أو Windows، نطاق + شهادة TLS

## خطوات النشر الإنتاجي

### 1) تجهيز الخادم
```bash
git clone <المستودع> && cd digital-mirror
npm ci --omit=dev=false
```

### 2) الإعدادات — إلزامي قبل الإطلاق
```bash
cp .env.example .env
```
عدّل في `.env`:
```
NODE_ENV=production
SESSION_SECRET=<عشوائي 64+ حرفاً — openssl rand -base64 48>
ADMIN_PASSWORD=<كلمة قوية خاصة بك>
ADMIN_USERNAME=<ليس admin افتراضياً>
# اختياري:
HIBP_API_KEY=...            # لتشغيل فحص تسريبات البريد
AI_PROVIDER=...             # تحسين الصياغة فقط — اختياري تماماً
```

### 3) البناء والتشغيل
```bash
npm run build
npm start        # يخدم الواجهة والـAPI على PORT (افتراضي 3000)
```

### 4) الوكيل العكسي + TLS (إلزامي)
مثال Nginx:
```nginx
server {
  listen 443 ssl http2;
  server_name mirati.example.org;
  ssl_certificate     /etc/letsencrypt/live/.../fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/.../privkey.pem;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header X-Forwarded-For $remote_addr;
  }
}
server { listen 80; server_name mirati.example.org; return 301 https://$host$request_uri; }
```
HSTS مفعّل تلقائياً في `NODE_ENV=production`.

### 5) الاستمرارية
- `pm2 start dist/server/index.js --name mirati` أو systemd unit
- **نسخ احتياطي يومي لمجلد `data/`** (SQLite) — خارجه مشفراً؛ ملف القاعدة يحوي القضايا
- راقب `GET /api/health`

### 6) Docker (اختياري — لم يُضمَّن Dockerfile بعد)
الوصفة: صورة `node:24-alpine` → نسخ المشروع → `npm ci && npm run build` → `CMD ["node","dist/server/index.js"]` → mount حجم لـ`/app/data` → لا تدمج `.env` في الصورة.

## قائمة ما قبل الإطلاق الحقيقي (استقبال قضايا حقيقية)

- [ ] مراجعة أمنية/اختراق مستقلة (OWASP ASVS 5.0.0) — **إلزامي**
- [ ] مراجعة قانونية لأهلية المنصة لاستقبال بلاغات في كل دولة تستهدفها
- [ ] تشفير القرص على مستوى الاستضافة (حد أدنى) وتشفير AES-256-GCM للقضايا (خطة موثقة)
- [ ] WAF أمام الوكيل + مراقبة مركزية + تنبيهات
- [ ] مهمة حذف آلي لانتهاء مدة الاحتفاظ (12 شهراً مقترحة)
- [ ] نسخ احتياطي مُختبَر الاستعادة فعلياً
- [ ] `npm audit` نظيف أو مخفَّف موثقاً
- [ ] خطة استجابة حوادث أمنية مكتوبة + قناة إفصاح مسؤول منشورة

## بعد الإطلاق

- راقب محاولات الدخول الإدارية في سجلات التشغيل (logWarn admin_login_failed)
- راجع `caseStats` في لوحة الإدارة دورياً (إحصاءات مجمعة فقط — بلا محتوى)
- حدّث بيانات الدول تدريجياً وفق ARAB_COUNTRIES_DIRECTORY.md
- لا تفتح بوابة الإحالات الحكومية قبل أول اتفاق موقّع (GOVERNMENT_PARTNERSHIP_GUIDE.md)
