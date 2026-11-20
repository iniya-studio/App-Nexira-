# NEXIRA — نقشه راه اجرایی و دفتر روزانه پیشرفت

- شناسه سند: NEX-ROADMAP-001
- نسخه: 4.4
- وضعیت: نسخه 4.3 — مسیر Localization بازبینی و تصمیم محصولی تصویب شد: هر ۲۰ زبان فهرست‌شده باید در APK انتشار کامل و فعال باشند؛ 1v1 میان زبان‌های متفاوت مجاز است و هر بازیکن سؤال معنایی یکسان را به زبان خود می‌بیند. ADR چندزبانه 1v1 ثبت شد. قراردادهای AI Question Generator و AI Judge برای زبان انتخابی صریح‌تر شده‌اند؛ اجرای تست/CI تغییرات Localization هنوز گزارش نشده است. race بین Guest Logout و Guest Conversion با دو سناریوی deterministic و کنترل ترتیب قفل PostgreSQL آزمون شد؛ هر دو ترتیب conversion-first و logout-first در Backend CI موفق‌اند. تست‌های موجود Guest Conversion در برابر Match Settlement نیز در همان CI اجرا و موفق شدند. Backend CI run 44392913659 روی commit `f9e4b26d0d19928b8c1fe4d5c78903d25880aecb` با تمام مراحل موفق است: Prisma format/validate/generate، PostgreSQL 16 migrations، Nest production build، unit و PostgreSQL integration tests، ESLint، Compose validation و Docker image build. این نتیجه فقط آزمون خودکار را تأیید می‌کند، نه پذیرش واقعی روی دستگاه یا محیط عملیاتی. شکاف Android Keystore با شناسه `AND-SEC-KEYSTORE-001` عمداً DEFERRED / OPEN / NOT VERIFIED باقی می‌ماند و تا پایان بررسی سایر شکاف‌ها دنبال نمی‌شود. پذیرش فیزیکی دو دستگاه، reconnect زنده، AI/سرور عملیاتی و پذیرش واقعی حساب همچنان باز هستند؛ feature flags عمومی 1v1 خاموش می‌مانند. برآورد اجرای V1 حدود 48٪ و تقریبی است.
- شاخه مرجع توسعه: `main`
- دامنه: از آماده‌سازی مخزن تا انتشار V1، سپس توسعه V2 و عملیات زنده
- اصل حاکم: این سند مسیر اجرا و ثبت پیشرفت را نگه می‌دارد؛ اسناد تخصصی هر بخش، جزئیات فنی و قراردادهای همان بخش را نگه می‌دارند.

> **قانون مهم وضعیت‌ها:** هیچ کاری صرفاً به‌دلیل وجود کد در شاخه‌ای دیگر «تکمیل‌شده در main» محسوب نمی‌شود. وضعیت هر آیتم فقط پس از بررسی کد موجود در main، اجرای آزمون مرتبط و ثبت مدرک به «تکمیل‌شده» تغییر می‌کند.

---

## 1. هدف و روش استفاده از سند

این سند تنها دفتر مرکزی مسیر اجرا و پیشرفت NEXIRA است. در هر نوبت کاری:
1. آخرین وضعیت `main` و آخرین commit بررسی می‌شود.
2. آیتم بعدی بر اساس وابستگی‌ها و ریسک انتخاب می‌شود.
3. تغییرات با کمترین دامنه لازم اجرا می‌شوند؛ معماری یا کد سالم بدون دلیل مستند بازطراحی نمی‌شود.
4. آزمون‌های متناسب اجرا می‌شوند.
5. نتیجه، مدرک، commit و مانع احتمالی در «دفتر روزانه» ثبت می‌شود.
6. درصد پیشرفت فقط از آیتم‌های دارای معیار پذیرش و مدرک محاسبه می‌شود.

این سند جایگزین اسناد معماری، قراردادهای API، طراحی UI، امنیت یا مشخصات محصول نیست؛ مرجع ترتیب اجرا، وابستگی‌ها، وضعیت و تصمیم‌های کلان است.

## 2. اصول غیرقابل‌مذاکره محصول

- NEXIRA یک پلتفرم بازی رقابتی جهانی مبتنی بر AI است؛ محصول آموزش‌محور نیست.
- نسخه اول شامل مسابقه‌های **1v1** و **1vAI** است.
- **AI Question Generator** و **AI Judge** از روز اول جزو هسته V1 هستند؛ چت با AI در V1 نداریم.
- در 1v1 هر دو بازیکن دقیقاً سؤال‌ها و شرایط یکسان دریافت می‌کنند.
- سرور مرجع نهایی زمان، پاسخ، امتیاز و نتیجه مسابقه است.
- بازی مهمان (Guest Play) مجاز است؛ ثبت‌نام اجباری نیست و از بخش Profile در دسترس خواهد بود.
- ورود اول: Splash → Language Selection → Home؛ ورودهای بعدی: Splash → Home. زبان انتخابی مستقل از موقعیت جغرافیایی و زبان دستگاه ذخیره می‌شود.
- ناوبری اصلی: Home، Ranking، Store، Profile؛ تنظیمات از Home یا Profile.
- تبلیغات اجباری یا تبلیغات درون بازی نداریم.
- فروشگاه و رابط کامل آن در V1 وجود دارد؛ پرداخت واقعی پس از آماده‌شدن زیرساخت حقوقی/مالی و منطقه‌ای فعال می‌شود.
- خرید نباید مزیت رقابتی ایجاد کند؛ فروش آیتم‌های ظاهری و شخصی‌سازی اختیاری است.
- XP/Level از روز اول وجود دارد؛ Ranking از XP مستقل است.
- ایمیل/رمز عبور و Google برای V1؛ Apple Sign-In برای مرحله انتشار iOS در نظر گرفته می‌شود.
- شخصیت AI واکنش‌گرا، روم‌ها و قابلیت‌های اجتماعی گروهی، چالش‌های تصویری و توسعه‌های مشابه، قابلیت‌های V2 هستند؛ اما زیرساخت‌های ضروری و قراردادهای توسعه‌پذیری آن‌ها باید از V1 پیش‌بینی شوند.
- کد و معماری موجود ابتدا بررسی می‌شوند؛ هیچ بازنویسی صرفاً به‌خاطر شروع این نقشه راه مجاز نیست.

## 3. مدل وضعیت و محاسبه پیشرفت

### وضعیت هر آیتم
- `NOT_STARTED`: شروع نشده
- `IN_PROGRESS`: در حال اجرا
- `BLOCKED`: متوقف به‌علت مانع ثبت‌شده
- `REVIEW`: پیاده‌سازی انجام شده و در انتظار بررسی/آزمون
- `DONE`: معیار پذیرش پاس شده و مدرک ثبت شده
- `DEFERRED_V2`: عمداً برای V2 نگه داشته شده؛ فقط در صورت تکمیل زیرساخت لازم V1 بسته می‌شود.

### قواعد درصد
- پیشرفت فاز = تعداد آیتم‌های DONE تقسیم بر تعداد آیتم‌های قابل‌اجرا در همان فاز؛ آیتم‌های DEFERRED_V2 از مخرج V1 خارج‌اند و جداگانه گزارش می‌شوند.
- پیشرفت کل V1 و آمادگی زیرساخت V2 جداگانه گزارش می‌شوند؛ یک عدد ترکیبی گمراه‌کننده تولید نمی‌شود.
- آیتم فاقد آزمون یا مدرک، DONE نیست.
- پیشرفت تاریخی شاخه‌های دیگر به‌عنوان پیشرفت main ثبت نمی‌شود تا پس از انتقال/ادغام و راستی‌آزمایی در main.

## 4. نقشه راه اجرایی صفر تا صد

### فاز 00 — حاکمیت، مخزن و خط‌پایه
- 00.01 تثبیت `main` به‌عنوان شاخه مرجع و سیاست توسعه ساده و قابل‌ردیابی.
- 00.02 تهیه و اعتبارسنجی نسخه پشتیبان مستقل؛ ثبت checksum و آزمون بازیابی.
- 00.03 بررسی کامل وضعیت فعلی main، ساختار فایل‌ها، وابستگی‌ها، build و تست‌ها.
- 00.04 ممیزی شاخه‌ها، مقایسه دارایی‌ها و ثبت گزارش حفظ شاخه‌ها — **انجام‌شده**؛ پاک‌سازی نهایی شاخه‌ها طبق تصمیم کاربر، یک اقدام عملیاتی جداگانه است.
- 00.05 افزودن اسناد مرجع محصول، معماری، UI و این دفتر به مخزن.
- 00.06 تعیین روش commit، ثبت تغییرات، بررسی امنیت اسرار و حفاظت از داده‌ها.
**خروجی فاز:** خط‌پایه قابل‌بازگشت، مخزن قابل‌ساخت، فهرست شکاف‌ها و سیاست روشن توسعه.

### فاز 01 — تثبیت محصول و قراردادهای V1/V2
- 01.01 قفل‌کردن محدوده V1 و فهرست خارج از محدوده.
- 01.02 تعیین جریان‌های کاربر، حالت مهمان/ثبت‌نام‌شده و زبان.
- 01.03 تعریف قوانین مسابقه، زمان‌بندی، قطع اتصال، لغو و پایان مسابقه.
- 01.04 تعریف قراردادهای AI، محدودیت هزینه، timeout، retry و fallback.
- 01.05 تعریف مرزهای V2 و الزامات سازگاری رو به جلو.
- 01.06 ثبت تصمیم‌های باز، مالک تصمیم و موعد تعیین تکلیف.
**خروجی فاز:** قراردادهای قابل‌آزمون و بدون ابهام برای ساخت V1.

### فاز 02 — تجربه کاربری، طراحی و Design System
- 02.01 تثبیت هویت بصری و Design Tokens (رنگ، تایپوگرافی، فاصله، شعاع، سایه).
- 02.02 ساخت اجزای پایه و حالت‌های تعاملی: دکمه، کارت، کلید پاسخ، ورودی، دیالوگ، نوار پیشرفت و اعلان.
- 02.03 افکت‌های پاسخ‌گرا برای دکمه‌ها، کلیدها و کارت‌ها؛ با رعایت کارایی و دسترس‌پذیری.
- 02.04 طراحی Splash، Language Selection، Home، Settings، Profile.
- 02.05 طراحی انتخاب حالت، Matchmaking، لابی 1v1 و صفحه مسابقه 1v1/1vAI.
- 02.06 طراحی نتیجه مسابقه، Ranking، Store، Inventory و وضعیت‌های خالی/خطا/آفلاین/بارگذاری.
- 02.07 بررسی اندازه‌های مختلف موبایل، خوانایی، کنتراست و RTL/LTR.
**خروجی فاز:** سیستم طراحی منسجم و تمام صفحات V1 با حالت‌های واقعی و خطا.

### فاز 03 — معماری و زیرساخت فنی
- 03.01 تثبیت مرز Frontend، Backend و سرویس‌های AI.
- 03.02 حفظ معماری Backend موجود در صورت تأیید ممیزی؛ معماری هدف: Node.js، TypeScript، NestJS، PostgreSQL، Prisma، REST و WebSocket در قالب Modular Monolith.
- 03.03 تعریف ماژول‌ها، قراردادها، خطاها، اعتبارسنجی، نسخه‌بندی API و استاندارد logging.
- 03.04 تعریف مدل داده، migration، seed و سیاست سازگاری schema.
- 03.05 تعریف مدیریت config و secrets؛ هیچ کلید یا رمز در مخزن ثبت نشود.
- 03.06 تعریف محیط توسعه، staging و production و فرایند انتشار.
- 03.07 تعریف قراردادهای توسعه‌پذیر برای room، participant، party، group membership و session؛ بدون الزام به ساخت UI گروهی در V1.
**خروجی فاز:** معماری پایدار، قابل‌آزمون و قابل‌گسترش بدون بازطراحی هسته.

### فاز 04 — هویت، حساب و نشست
- 04.01 Guest Identity و چرخه عمر شناسه مهمان.
- 04.02 ایمیل/رمز عبور، تأیید و بازیابی حساب طبق سیاست امنیتی — ثبت‌نام/ورود/Guest conversion، تأیید ایمیل، Password Recovery/Reset/Change و تنظیم رمز برای Google-only در Backend و UI پیاده‌سازی و CI-verified؛ SMTP، URL امن ایمیل و آزمون واقعی دستگاه/ایمیل برای پذیرش انتشار باقی است.
- 04.03 Google Sign-In و اتصال امن هویت خارجی با اثبات مالکیت — Credential Manager بومی Android، Google ID Token، چالش تصادفی server-issued پنج‌دقیقه‌ای با hash ذخیره‌شده و مصرف اتمیک، nonce verification و explicit linking پیاده‌سازی و CI-verified؛ OAuth client IDs و پذیرش واقعی روی دستگاه نیازمند پیکربندی بیرونی است.
- 04.04 دسترسی کوتاه‌عمر و refresh token امن، چرخشی و قابل‌ابطال.
- 04.05 انتقال Guest به حساب ثبت‌شده بدون از دست رفتن پیشرفت یا امکان تصاحب حساب.
- 04.06 مدیریت نشست‌ها، خروج از دستگاه‌ها، rate limit و audit events — فهرست/ابطال نشست‌ها، خروج از یک یا همه دستگاه‌ها، ابطال نشست‌های دیگر پس از تغییر رمز، ابطال همه نشست‌ها پس از reset و rate-limit/audit در Backend و UI موجود و CI-verified هستند؛ rate limit توزیع‌شده برای مقیاس افقی همچنان operational hardening آینده است.
- 04.07 آماده‌سازی Apple Sign-In برای انتشار iOS.
**خروجی فاز:** هویت امن با تجربه مهمان بدون اصطکاک.

### فاز 05 — هسته مسابقه و Match Engine
- 05.01 چرخه عمر مسابقه و state machine قطعی.
- 05.02 ساخت session و ثبت snapshot قوانین/شرایط مسابقه.
- 05.03 همگام‌سازی سؤال، ترتیب، timer و وضعیت بازیکنان در 1v1.
- 05.04 اعتبارسنجی پاسخ و جلوگیری از پاسخ تکراری/دیرهنگام.
- 05.05 مدیریت disconnect، reconnect، timeout، cancellation و نتیجه نهایی.
- 05.06 جلوگیری از ثبت دوباره نتیجه یا اعطای دوباره پاداش.
- 05.07 تست مسابقه‌های چنددوره‌ای، هم‌زمانی، مرزهای زمانی و سناریوهای خرابی.
**خروجی فاز:** مسابقه قابل‌اعتماد با مرجعیت کامل سرور.

### فاز 06 — سؤال و محتوای مسابقه
- 06.01 قرارداد استاندارد سؤال، گزینه‌ها، پاسخ مورد انتظار، سطح دشواری و دسته‌بندی.
- 06.02 اعتبارسنجی ساختاری، زبانی، ایمنی و تناسب سؤال.
- 06.03 سیاست تنوع و جلوگیری از تکرار غیرضروری.
- 06.04 کنترل کیفیت و ثبت نسخه/منبع سؤال.
- 06.05 مسیر fallback در صورت شکست تولید سؤال.
- 06.06 آماده‌سازی تدریجی بانک سؤال/مدل ترکیبی برای مقیاس بعدی.
**خروجی فاز:** ورودی استاندارد و قابل‌اعتماد برای هر مسابقه.

### فاز 07 — AI Question Generator
- 07.01 اتصال ارائه‌دهنده AI از پشت adapter مستقل و قابل‌تعویض.
- 07.02 تولید زنده سؤال بر اساس دسته، سطح و قالب مسابقه.
- 07.03 خروجی ساختاریافته و schema validation.
- 07.04 فیلتر سؤال مبهم، تکراری، نادرست یا نامناسب.
- 07.05 timeout، retry محدود، کنترل هزینه و ثبت telemetry.
- 07.06 fallback امن در صورت در دسترس نبودن AI.
- 07.07 آزمون کیفیت سؤال با مجموعه ارزیابی و ثبت نرخ پذیرش/رد.
**خروجی فاز:** تولید سؤال AI در مسیر واقعی مسابقه از روز اول.

### فاز 08 — AI Judge
- 08.01 قرارداد ارزیابی پاسخ مفهومی و معادل.
- 08.02 جداسازی پاسخ قطعی/قابل‌قبول/غلط/نامطمئن.
- 08.03 محدودسازی prompt injection و داده ورودی غیرقابل‌اعتماد.
- 08.04 تصمیم نهایی سمت سرور و ثبت دلیل/نسخه ارزیابی.
- 08.05 مسیر بازبینی یا fallback برای موارد نامطمئن.
- 08.06 آزمون با پاسخ‌های مترادف، املای متفاوت، چندزبانه و پاسخ‌های مرزی.
**خروجی فاز:** داوری منصفانه و قابل‌ردیابی؛ بدون چت AI.

### فاز 09 — حالت‌های بازی 1vAI و 1v1
- 09.01 تکمیل چرخه کامل 1vAI با حریف AI و داوری پاسخ.
- 09.02 تکمیل matchmaking و چرخه 1v1.
- 09.03 تضمین دریافت سؤال و شرایط یکسان توسط دو بازیکن.
- 09.04 نمایش وضعیت ارسال پاسخ، انتظار برای سرور و پاسخ حریف بدون افشای زودهنگام.
- 09.05 مدیریت اختلاف ساعت دستگاه، تأخیر شبکه و قطع اتصال.
- 09.06 تست end-to-end هر دو حالت روی دستگاه واقعی.
**خروجی فاز:** دو حالت اصلی V1 قابل‌بازی و پایدار.

### فاز 10 — امتیاز، XP، Level و Ranking
- 10.01 تثبیت فرمول امتیاز مسابقه و ثبت نسخه قوانین امتیازدهی.
- 10.02 محاسبه سرعت/درستی پاسخ فقط در سرور.
- 10.03 XP و Level با قواعد ضدتقلب و جلوگیری از پاداش تکراری.
- 10.04 Ranking مستقل از XP و با قواعد eligibility شفاف.
- 10.05 تفکیک رتبه‌بندی کلی و فصلی در صورت تصویب طراحی نهایی.
- 10.06 آزمون مرزها، تساوی، قطع اتصال و نتایج نامعتبر.
**خروجی فاز:** پیشرفت قابل‌اعتماد و رقابت منصفانه.

### فاز 11 — پروفایل، دوستان و ارتباط اجتماعی V1
- 11.01 پروفایل مهمان و ثبت‌نام‌شده.
- 11.02 آمار فقط بر پایه داده واقعی سرور.
- 11.03 درخواست/مدیریت دوستان و وضعیت‌های حریم خصوصی.
- 11.04 چت فقط کاربر با کاربر؛ بدون AI chat.
- 11.05 گزارش، مسدودسازی، rate limit و ابزارهای ایمنی پایه.
- 11.06 آماده‌سازی مدل داده برای گروه‌ها و room membership در V2.
**خروجی فاز:** قابلیت‌های اجتماعی پایه با کنترل ایمنی.

### فاز 12 — Store، Inventory و اقتصاد
- 12.01 ساخت رابط کامل Store و دسته‌بندی‌ها.
- 12.02 مدل آیتم، مالکیت، موجودی و loadout.
- 12.03 تعریف آیتم‌های تزئینی و شخصی‌سازی اختیاری.
- 12.04 تضمین عدم تأثیر خرید بر نتیجه، قدرت یا رتبه رقابتی.
- 12.05 پیاده‌سازی جریان خرید آزمایشی/غیرفعال تا آماده‌شدن پرداخت واقعی.
- 12.06 قرارداد provider مستقل برای پرداخت، رسید و تطبیق تراکنش.
- 12.07 فعال‌سازی پرداخت واقعی فقط پس از آمادگی حقوقی، مالی، مالیاتی و پشتیبانی بازارهای هدف.
**خروجی فاز:** فروشگاه کامل از نظر تجربه و مدل داده، بدون وابستگی زودهنگام به پرداخت.

### فاز 13 — امنیت، ضدتقلب و حریم خصوصی
- 13.01 threat modeling برای حساب، مسابقه، AI، اقتصاد و چت.
- 13.02 rate limiting، اعتبارسنجی ورودی و کنترل دسترسی.
- 13.03 محافظت از اسرار، داده شخصی و ارتباطات.
- 13.04 تشخیص الگوهای تقلب و ثبت رویدادهای قابل‌ممیزی.
- 13.05 سیاست گزارش/مسدودسازی و رسیدگی.
- 13.06 پشتیبان‌گیری، بازیابی و آزمون disaster recovery.
- 13.07 بررسی وابستگی‌ها و آسیب‌پذیری‌های امنیتی.
**خروجی فاز:** حداقل سطح امنیتی لازم برای بتای عمومی.

### فاز 14 — کیفیت، عملکرد و عملیات
- 14.01 تست واحد، یکپارچه‌سازی، قرارداد و end-to-end.
- 14.02 تست بار و هم‌زمانی متناسب با ظرفیت هدف.
- 14.03 telemetry، crash/error reporting و داشبورد سلامت.
- 14.04 پایش latency، هزینه AI، نرخ شکست و کیفیت داوری.
- 14.05 بهینه‌سازی مصرف حافظه، باتری، شبکه و زمان بارگذاری موبایل.
- 14.06 تست روی دستگاه‌ها و نسخه‌های پشتیبانی‌شده Android.
- 14.07 CI فقط برای کنترل‌های ضروری و پایدار؛ از صرف وقت نامتناسب روی نویزهای محیطی جلوگیری شود.
**خروجی فاز:** محصول قابل‌پایش و آماده تست میدانی.

### فاز 15 — انتشار Android، بتا و V1
- 15.01 build تکرارپذیر و امضای امن.
- 15.02 بررسی مجوزها، حریم خصوصی، سیاست فروشگاه و محتوای انتشار.
- 15.03 تست نصب، به‌روزرسانی، پاک‌سازی داده، reconnect و عملکرد واقعی.
- 15.04 بتای محدود و جمع‌آوری بازخورد/telemetry.
- 15.05 رفع خطاهای بحرانی و اجرای release checklist.
- 15.06 انتشار مرحله‌ای و امکان rollback.
- 15.07 ثبت baseline KPI و برنامه پشتیبانی.
**خروجی فاز:** انتشار V1 با چرخه عملیاتی قابل‌کنترل.

### فاز 16 — V2: فعال‌سازی قابلیت‌های توسعه‌یافته
این فاز پس از تثبیت V1 آغاز می‌شود. آماده‌سازی قراردادها و زیرساخت‌های لازم در فازهای قبلی انجام می‌شود، اما قابلیت‌های زیر تا زمان تصویب و برنامه‌ریزی V2 وارد دامنه ساخت V1 نمی‌شوند:
- 16.01 اتاق‌های خصوصی/عمومی چندنفره و ظرفیت قابل‌تنظیم.
- 16.02 چرخه اتاق، حضور اعضا، snapshot قوانین، countdown و شروع مسابقه گروهی.
- 16.03 چت و تعامل گروهی/اتاقی با ابزارهای moderation.
- 16.04 شخصیت AI واکنش‌گرا با خروجی صرفاً نمایشی و بدون مزیت مکانیکی/رقابتی.
- 16.05 چالش‌های تصویری مانند تشخیص خودرو، لوگو و قطعات الکترونیکی.
- 16.06 گسترش دسته‌ها و قالب‌های رقابتی.
- 16.07 لیگ‌ها، رویدادها و رقابت‌های اجتماعی پیشرفته.
- 16.08 بهبود مقیاس‌پذیری و عملیات بر اساس داده واقعی V1.
**خروجی فاز:** V2 بدون بازطراحی هسته و با حفظ سازگاری داده و API.

### فاز 17 — رشد و چرخه زنده
- 17.01 بررسی KPI و قیف کاربر.
- 17.02 بهبود retention و کیفیت matchmaking بر اساس داده.
- 17.03 انتشار منظم قابلیت‌ها در چرخه‌های ماهانه/دوماهه، متناسب با ظرفیت تیم.
- 17.04 مدیریت فصل‌ها و رویدادها پس از تثبیت اقتصاد و عملیات.
- 17.05 بازبینی امنیت، هزینه AI و پایداری در هر چرخه.
**خروجی فاز:** رشد کنترل‌شده و توسعه مستمر محصول.

## 5. زیرساخت‌های V2 که باید از V1 پیش‌بینی شوند

| حوزه | پیش‌بینی در V1 | فعال‌سازی در V2 |
|---|---|---|
| مسابقه | مدل عمومی session/participant و snapshot قوانین | چند شرکت‌کننده و room orchestration |
| اتاق | شناسه، وضعیت، ظرفیت و چرخه عمر قابل توسعه در قراردادها | UI ساخت/ورود و مدیریت اتاق |
| ارتباط | abstraction پیام و حضور در صورت نیاز معماری | چت گروهی و کانال اتاق |
| AI | provider adapter، قراردادها، telemetry و policy | شخصیت واکنش‌گرا و قابلیت‌های چندوجهی |
| چالش | مدل قابل توسعه برای نوع/ورودی چالش | تصویر و تشخیص بصری |
| حساب/اجتماعی | هویت پایدار، دوستی و مجوزها | گروه‌ها، دعوت‌ها و اجتماع‌ها |
| اقتصاد | catalog، ownership و entitlement مستقل از UI | گسترش شخصی‌سازی و آیتم‌ها |
| عملیات | logging، metrics، feature flags و نسخه‌بندی | rollout مرحله‌ای قابلیت‌های جدید |

اصل اجرایی: **پیش‌بینی معماری به معنی ساخت زودهنگام قابلیت نیست.** هر زیرساخت V2 باید توجیه، معیار پذیرش و هزینه نگهداری داشته باشد.

## 6. دروازه‌های پذیرش (Quality Gates)

هر فاز فقط زمانی بسته می‌شود که:
- معیارهای پذیرش همان فاز برآورده شده باشند.
- آزمون‌های مرتبط اجرا و نتیجه ثبت شده باشد.
- خطاهای بحرانی/امنیتی باز باقی نمانده باشد.
- مستندات و قراردادهای تغییرکرده به‌روز شده باشند.
- تغییرات در `main` قابل‌ردیابی باشند.
- هیچ secret، داده شخصی یا فایل حجیم/ساختنی ناخواسته وارد commit نشده باشد.

## 7. موارد باز که باید پیش از قفل نهایی تعیین تکلیف شوند

این موارد نباید با حدس، قطعی تلقی شوند:
- سیاست نهایی Ranking برای مهمان در برابر کاربر ثبت‌نام‌شده.
- فرمول نهایی امتیاز سرعت/درستی و tie-break.
- دامنه دقیق دسته‌ها و زبان‌های قابل پشتیبانی در اولین انتشار.
- زمان‌بندی و ارائه‌دهنده پرداخت در بازارهای هدف.
- ظرفیت و قواعد دقیق اتاق عمومی/خصوصی V2.
- هدف ظرفیت هم‌زمان و SLOهای سرویس.
- سنجه‌ها و اهداف KPI نهایی پس از baseline بتا.

## 8. دفتر روزانه اجرا و پیشرفت

هر ثبت روزانه باید کوتاه و قابل‌ممیزی باشد:

| تاریخ | فاز/آیتم | اقدام انجام‌شده | آزمون/مدرک | Commit در main | وضعیت | مانع/گام بعد |
|---|---|---|---|---|---|---|
| 2026-11-13 | 00 / ممیزی و سند مرجع | گزارش ممیزی شاخه‌ها قبلاً تهیه و بررسی شده؛ نقشه راه جامع و دفتر پیشرفت در main ثبت شد | گزارش ممیزی شاخه‌ها + بازخوانی موفق سند جدید از GitHub | `10981a047db436ad34c6c9a63a99cc0d32a70b9a` | DONE برای تهیه گزارش و ثبت سند | تکمیل عملیات پاک‌سازی شاخه‌ها؛ سپس تطبیق قابلیت‌ها و آزمون‌های main |
| 2026-11-13 | 00 / پاک‌سازی شاخه‌ها | هر ۱۳ شاخه remote اضافی از GitHub حذف شدند؛ بررسی مستقیم GitHub تأیید کرد فقط `main` باقی مانده است. یک شاخه محلی `feature/1vai-opponent-response-worker` به‌دلیل فعال بودن در worktree جداگانه `/workspaces/nexira-opponent-response-worker` باقی مانده و عمداً فعلاً دست‌نخورده نگه داشته شده است. | گزارش نهایی Codespace: `NEXIRA-FINAL-BRANCH-CLEANUP-REPORT.md`؛ جست‌وجوی مستقیم شاخه‌های GitHub: فقط `main` | بدون commit کد؛ ثبت این یادداشت در دفتر روزانه | DONE برای پاک‌سازی remote؛ FOLLOW-UP برای شاخه محلی | در مرحله مناسب، پیش از حذف worktree/شاخه محلی، وضعیت تغییرات، فایل‌های untracked/ignored، commitهای منحصربه‌فرد و حفظ کامل دارایی‌های AI Opponent Worker بررسی شود؛ سپس درباره نگهداری/انتقال/حذف تصمیم بگیریم. تا آن زمان روی `main` توسعه می‌دهیم. |
| 2026-11-13 | R-001 / Frontend و Android | ساختار یگانه اپلیکیشن در `app/` از Snapshot تغییرناپذیر `e1426e8e97c57a93b230e1134904279f0188c71a` بازسازی شد؛ ۱۰۰ فایل دقیقاً با Blob SHA منبع تطبیق داشتند؛ پروژه قدیمی ریشه و Android تکراری از ساختار فعال خارج شدند؛ Android CI برای `main` تنظیم شد. | تطبیق ۱۰۰/۱۰۰ Blob SHA؛ GitHub Actions run `43478696196`: هر ۸۴ تست Frontend/Match Engine موفق، Vite build موفق، Android build موفق در ۱m 34s، بررسی APK موفق؛ Artifact: 6,282,171 bytes، ID `14064451608`، SHA-256 بسته Artifact: `9d1bc528f94555c2b8f1dc0523581fbb7f3f40f1de2f0c9d5262bdafa1e3b1d0` | `3aaa6bc29fc66756f570a1987747d4c337d88a31` | DONE | بررسی اتصال آنلاین و جریان واقعی بازی در مرحله بعد؛ فعلاً local adapter صرفاً حالت demo/test است. |
| 2026-11-13 | R-006 / Backend و قراردادهای مهندسی | ۱۱۹ فایل Backend و ۱۱ سند مهندسی/معماری از همان Snapshot تغییرناپذیر بازیابی شدند؛ Backend معماری قبلی را حفظ کرد؛ CI مستقل با Node 24 و PostgreSQL 16 فقط برای `main` فعال شد. | تطبیق ۱۱۹/۱۱۹ فایل Backend و ۱۱/۱۱ سند با Blob SHA منبع؛ GitHub Actions run `43479045376`: Prisma format/validate/generate، اعمال تمام migrationها روی PostgreSQL 16، Nest build، ۳۲ suite و ۱۶۸ تست unit/integration، و ESLint همگی PASS | `29883facc589a46a8f70eea346b4e4b961b24806` | DONE | گام بعد: بررسی دقیق مرز اتصال Frontend/Backend و تعیین حداقل شکاف‌های API برای vertical slice آنلاین؛ بدون بازطراحی هسته. |
| 2026-11-13 | R-004/R-005/R-007/R-010 / ممیزی اتصال آنلاین | لایه API و نشست Frontend، کنترلرهای Backend و AI Opponent Worker بررسی شدند. Guest/session foundation و API client موجود و تست‌شده‌اند؛ اما بازی هنوز از `localMatchAdapter` استفاده می‌کند و به API مسابقه متصل نیست. Backend مسیر ساخت 1vAI دارد، ولی 1v1 matchmaking عمومی، خواندن نتیجه/امتیاز نهایی و قرارداد کامل polling/result در API فعلی وجود ندارد؛ پاسخ submit فقط receipt است. | بررسی کدهای `app/src/api/*`، `app/src/App.jsx`، `app/src/game/localMatchAdapter.js`، کنترلرها و `MatchService`/`RoundService`؛ تست‌های قبلی سبز؛ live AI provider calls هنوز تأیید نشده‌اند. | بدون تغییر کد؛ ثبت نتیجه ممیزی | REVIEW | در زمان ممیزی، نتیجه این بود که ابتدا قرارداد حداقلی vertical slice طراحی شود؛ در ادامه مالک صریحاً اجازه تغییرات لازم Backend را داد و این شکاف‌ها در مرحله R-011 با تغییرات محدود و تست‌شده بسته شدند. |
| 2026-11-13 | R-011 / اتصال واقعی 1vAI به Backend | قرارداد ساخت مسابقه با category/language تکمیل شد؛ دو endpoint امن برای نتیجه هر دور و نتیجه نهایی اضافه شد؛ Frontend production به onlineMatchAdapter متصل شد: ساخت مسابقه، انتظار برای سؤال، readiness، دریافت سؤال امن، زمان‌سنج بر اساس deadline سرور، ارسال پاسخ متنی با idempotency key پایدار، انتظار برای داوری و settlement، و دریافت نتیجه نهایی. Local adapter فقط در Vite development/demo باقی ماند و fallback خاموش production وجود ندارد. | Backend CI run `43484306463`: build موفق، Prisma/migrations روی PostgreSQL 16، ۳۲ suite و ۱۷۱ تست PASS، ESLint PASS. Android CI run `43485902079`: ۸۷/۸۷ تست Frontend PASS، build و APK verification/upload PASS؛ APK 6,286,879 bytes؛ Artifact ID `14067097893`. Backend CORS allowlist برای Capacitor اضافه شد؛ result API پیش از settlement هیچ answer state، judge decision یا score موقتی را افشا نمی‌کند و winner metadata فقط پس از final result برمی‌گردد. Backend CI run `43487214496`: ۳۲ suite و ۱۷۳ تست PASS، Prisma migrations، Nest build و ESLint PASS. مستند اتصال `NEX-FE-001` به‌روزرسانی شد. | Backend `fd8223b08503173510793a48c3131f2d4d593fb2`; Frontend adapter `83eb79d60b5eb2ac6ccf6dc0c78caa6b4cebc6df`; production UI `6789fafe90b0881c8c6413ff243818090d31755c`; test fixes `881f40993cba8a6835b39215c4293af55c4930af`, `a4ffbc801dc63c8d8da026f6caf6feee6b6e8843`, `7bb0ee8eea130ec71953a2680c37fce1710258e7`; integration contract `390f34e874c0143f5a63ceac675e4d7207205dde` | IMPLEMENTED / CI PASS | هنوز بازی زنده روی دستگاه با API مستقر اجرا نشده: نیازمند HTTPS API deployment، `VITE_API_BASE_URL` در build، تنظیم credentialهای server-side برای Question Generator/AI Opponent/AI Judge و آزمون واقعی ۱۰ دور است. 1v1 عمومی نیز تا تکمیل matchmaking/queue جداگانه در production فعال نمی‌شود. سیاست XP برای guest/registered و فرمول XP هنوز تصمیم نهایی می‌خواهد؛ امتیاز مسابقه و XP دو ledger جدا هستند. |

| 2026-11-13 | R-012 / بازبینی و سخت‌سازی چرخه 1vAI | مسیر end-to-end از ساخت مسابقه تا سؤال، readiness، زمان سرور، پاسخ انسان و AI، داوری، امتیازدهی، settlement هر دور و نتیجه نهایی بازبینی شد. ناهماهنگی متن UI نسخه production اصلاح شد؛ شکست نهایی AI Opponent اکنون باعث technical void و بازتولید سؤال می‌شود، نه برد رایگان انسان؛ جایگزینی فنی به ۲ بار محدود شد و پس از آن مسابقه با خطای مشخص CANCELLED می‌شود. | Backend CI run `43497464517`: ۳۳ suite و ۱۷۵ تست PASS، Prisma format/validate/generate، PostgreSQL migrations، Nest build و ESLint PASS. Android CI run `43496120777`: ۸۷/۸۷ تست Frontend، build و APK verification PASS؛ Artifact ID `14072830034`، 6,286,865 bytes. آزمون ۱۰ دور 1vAI با providerهای deterministic در PostgreSQL integration test موفق است؛ تماس واقعی OpenAI و اجرای زنده روی گوشی هنوز انجام نشده‌اند. | UI `c61f23f31d6d545fb23b33108baa61607d0fe1c6`; technical void `6e71fea7f0033a50a2bb717dd9a5b0a81c6ece92`; deadline guard `aa438dd22f5015fe18a4bb140e4f6b9f34d7150b`; integration tests/fixes `5cb1986aef3cea2be6dcc1d9171026a901f4763a`, `890199e8f82cd1e042f2ef7691ba64b69d1a73b7`, `89497767ddd476d4e85dc50c59387ac13b22a170`, `3a07b68705e378e2067c27a439d96a2625cc77d7` | CODE REVIEW PASS / CI PASS | می‌توان توسعه matchmaking عمومی 1v1 را شروع کرد. برای انتشار نهایی همچنان لازم است: سرور HTTPS و PostgreSQL، تنظیم امن سه credential/model OpenAI، تست واقعی ۱۰ دور، رفع علت نصب‌نشدن APK، بازیابی مسابقه پس از بسته‌شدن اپ، و اتصال نتیجه مسابقه به XP/Ranking. 1v1 فعلاً فقط entry point داخلی دارد و public queue/pairing هنوز ساخته نشده است. |
| 2026-11-13 | R-012.1 / سخت‌سازی خطاهای مرزی 1vAI | ممیزی دقیق‌تر چرخه نشان داد که در صورت پایان مهلت هم‌زمان با شکست نهایی AI Judge، Deadline Worker می‌توانست دور را پیش از Technical Void نهایی کند. Deadline Worker اکنون وضعیت FAILED داور را نیز از settlement عادی مستثنا می‌کند تا Technical Void مالک قطعی این مسیر باشد. در Frontend نیز خطای موقت دریافت نتیجه پس از پذیرش پاسخ دیگر به‌اشتباه submission-error نمی‌شود؛ وضعیت waiting-result حفظ می‌شود و polling ادامه می‌یابد. | Backend CI run `43498852973`: ۳۳ suite و ۱۷۶ تست PASS، Prisma format/validate/generate، PostgreSQL migrations، Nest build و ESLint PASS. Android CI run `43499168586`: ۸۹/۸۹ تست PASS، Vite build، APK build/verification/upload PASS؛ Artifact ID `14073771037`، حجم ZIP برابر ۶٬۲۸۷٬۰۱۴ بایت. | Backend fix `f404d79db825f8ee451e87f2179acf19009276d5`; regression test `a56f0de0d9a3380339bb4be1bb79742cee3ed5ce`; adapter recovery `e825b6aa39ee5775f077df2dff044a0bfe9d9dae`; frontend tests `958c8332cf5dd9c4d9303d3246ad3dca9440a1bb`; contract docs `11ad410a2a7a7b7376d630844ff7eac5fd7b69df` | DONE / CI PASS | چرخه هسته 1vAI از نظر کد و تست خودکار تأیید شد. پذیرش زنده هنوز نیازمند API/DB روی HTTPS، کلیدها و مدل‌های OpenAI، تست ۱۰ دور روی گوشی، بازیابی پس از بسته‌شدن کامل اپ، تعیین سیاست XP/Ranking و تشخیص علت نصب‌نشدن APK قبلی است. 1v1 عمومی هنوز ساخته نشده است. |

| 2026-11-13 | R-012.2 / تأیید فنی چرخه 1vAI و آغاز 1v1 | ممیزی تکمیلی چرخه 1vAI بسته شد؛ چرخه ده‌دوره‌ای با PostgreSQL integration tests و providerهای آزمایشی موفق است. دو race/recovery edge case در رقابت Deadline Worker با شکست نهایی AI Judge و خطای موقت دریافت نتیجه اصلاح شدند. هسته 1vAI از نظر پیاده‌سازی و تست خودکار تأیید شد؛ پذیرش زنده روی گوشی/با OpenAI واقعی همچنان جداگانه باز است. | Backend CI `43498852973`: ۳۳ suite و ۱۷۶ تست PASS؛ Android CI `43499168586`: ۸۹/۸۹ تست، build و APK verification/upload PASS؛ Artifact ID `14073771037`، حجم 6,287,014 bytes. | اصلاحات مرجع: `f404d79db825f8ee451e87f2179acf19009276d5`, `a56f0de0d9a3380339bb4be1bb79742cee3ed5ce`, `e825b6aa39ee5775f077df2dff044a0bfe9d9dae`, `958c8332cf5dd9c4d9303d3246ad3dca9440a1bb` | 1vAI CORE ACCEPTED / CI PASS | شروع فاز 1v1: ابتدا ممیزی مدل داده، Match/Queue services، WebSocket و APIهای موجود؛ سپس قرارداد matchmaking عمومی و جفت‌سازی اتمیک دو بازیکن، بدون بازطراحی هسته مسابقه. موانع پذیرش زنده 1vAI همچنان باز هستند. |

| 2026-11-13 | R-013 / قرارداد Matchmaking عمومی 1v1 | ممیزی Match Core و Prisma تأیید کرد زیرساخت مسابقه دونفره، MatchParticipant انعطاف‌پذیر، متد داخلی `createOneVsOne` و وابستگی Socket.IO موجود است؛ صف عمومی و pairing هنوز وجود ندارند. قرارداد `NEX-BE-009` برای صف پایدار، سازگاری دقیق category/language، FIFO، جفت‌سازی اتمیک، idempotency، cancellation race، REST، اعلان WebSocket و بازیابی reconnect تهیه و در main ثبت شد. | بازخوانی Match Core contract، Prisma schema، MatchService/Controller/Module، Frontend-Backend contract و package dependencies؛ سند جدید در GitHub ثبت و قابل‌بازیابی است. | `42164ed356755a8a29653a151794c5fb6ea1d541` | CONTRACT BASELINE DONE | گام بعد: پیاده‌سازی persistence و queue service طبق NEX-BE-009؛ migration فقط additive و با تست PostgreSQL 16. هسته 1vAI و Match Engine بدون بازطراحی/تغییر غیرضروری حفظ شوند. |

| 2026-11-14 | R-014 / تکمیل زیرساخت 1v1 و تسویه XP/Ranking فقط روی main | سیاست NEX-BE-010 و تسویه XP/Ranking روی main پیاده‌سازی شد: XP مستقل از Ranking، GuestProgress/GuestXPTransaction، انتقال اتمیک XP هنگام تبدیل Guest به User، و اتصال settlement به پایان عادی و Forfeit. سپس public 1v1 queue نیز مستقیماً به main منتقل شد: MatchmakingEntry، REST queue API، FIFO سازگار با category/language، advisory locks، جفت‌سازی اتمیک از طریق MatchService، active-session validation، stale queue expiry، guest conversion handoff، waiting/cancel UI، reconnect/cold-process queue recovery و participant score snapshot. هیچ شاخه جدیدی ساخته نشد؛ PR قدیمی #11 به‌عنوان superseded بسته شد و هیچ merge از آن انجام نشد. | migrations additive: `20261114000100_add_guest_progression` و `20261114000100_add_public_1v1_matchmaking_queue`؛ unit/integration tests برای settlement، guest XP، 10-round registered 1v1، idempotency، duplicate/session guards، pairing/cancel race و queue recovery روی main افزوده شده‌اند. اجرای نهایی CI و PostgreSQL 16 برای این مجموعه هنوز تأیید نشده است. | progression: `8291f6518001d304e0bdd2d8068fd71f8ceedea1`; NEX-BE-009 updated: `63de53bf63d90b5a0f67dc0ab14c37750e93ab6c`; NEX-BE-011 acceptance checklist: `bc7df78a78d8b4e8e94b045466f9f46b5a35c077`; frontend contract updated on main | MAIN IMPLEMENTATION COMPLETE / CI PENDING | گام بعد: Prisma format/validate/generate، migration PostgreSQL 16، Nest build، full unit/integration tests، ESLint، Frontend tests و Android APK verification. پس از سبزشدن CI، پذیرش دو دستگاه، سؤال/زمان/پاسخ همسان، cancellation race، قطع شبکه و cold-process recovery؛ سپس production HTTPS. |

| 2026-11-14 | R-015 / تطبیق ایستای چرخه‌های 1vAI و 1v1، نشست و XP/Ranking در main | بازبینی فقط‌خواندنی کدهای main انجام شد. در 1vAI، چرخه server-authoritative، داوری پاسخ و تست یکپارچه‌سازی چرخه ۱۰ دور با providerهای deterministic موجود است؛ این شواهد تماس زنده با OpenAI یا پذیرش روی گوشی را اثبات نمی‌کنند. در 1v1، public queue با category/language matching، FIFO، قفل‌گذاری، pairing اتمیک، idempotency، انقضای صف، کنترل session و مسیرهای cancellation/recovery در کد و تست‌ها موجود است؛ کلاینت عمدتاً از REST polling/recovery استفاده می‌کند و اتصال push بلادرنگ کامل تأیید نشده است. در نشست‌ها، refresh token تصادفی و hash‌شده، rotation، retry محدود با idempotency، revoke و guest conversion دیده شد. در XP/Ranking، settlement دارای idempotency و تفکیک global/seasonal است و XP مهمان نیز پشتیبانی می‌شود. | شواهد از بررسی فایل‌ها و تست‌های موجود در main استخراج شد؛ هیچ تستی در این نوبت اجرا نشد. CI Backend run 43527355238 در مرحله Verify Prisma formatting شکست خورده و مراحل بعدی را اجرا نکرده است؛ بنابراین وضعیت فعلی CI سبز نیست و migration روی PostgreSQL 16، Prisma validate/generate، Nest build، unit/integration tests، ESLint، Frontend tests و Android APK verification برای commitهای فعلی هنوز تأیید نشده‌اند. دو migration جدید با پیشوند زمانی یکسان ولی نام مسیر متفاوت موجودند؛ ترتیب و اجرای واقعی آن‌ها باید با migration deploy بررسی شود. | مبنای بررسی: main 5bc7d8dd4f42a97b2d5e931c076cb11e2942690a; آخرین commit کد مرتبط با queue cancellation race: 4bce249d2b95317cec4b946ca54dcbdc3a6f54c5; CI run 43527355238 | STATIC REVIEW COMPLETE / RUNTIME VERIFICATION PENDING | گام بعد: رفع دقیق Prisma formatting blocker روی main، سپس اجرای زنجیره کامل Backend CI با PostgreSQL 16؛ پس از سبزشدن، اجرای تست‌های Frontend/Android و پذیرش دو دستگاه شامل سؤال/زمان/پاسخ یکسان، cancellation race، قطع شبکه و cold-process recovery. برای پذیرش زنده 1vAI همچنان deployment HTTPS و provider credentials و تماس واقعی AI لازم است. |
| 2026-11-14 | R-016 / بستن دروازه کنترل کیفیت Backend روی main | پس از اصلاحات محدود امنیتی، Matchmaking و تست‌های همگام با قرارداد، اجرای کامل Backend CI روی آخرین main موفق شد. این مرحله فقط کنترل کیفیت Backend را می‌بندد و به معنی پذیرش زنده سرور، AI یا اپلیکیشن نیست. | GitHub Actions run [43639642201](https://github.com/iniya-studio/App-Nexira-/actions/runs/43639642201): وضعیت completed/success؛ Prisma format، schema validation، client generation، migrationها روی PostgreSQL 16 تازه، Nest production build، ESLint؛ ۳۸/۳۸ suite و ۲۱۴/۲۱۴ test موفق. Coverage در این اجرا اندازه‌گیری نشده است. خطای duplicate-key در تست منفی جلوگیری از ثبت تکراری مهمان، به Conflict مورد انتظار تبدیل شد و تست پاس شد. | `2a8b8f58d051a046984b9e5183414412c25aa375` | DONE / BACKEND CI PASS | R-017: آغاز آماده‌سازی پذیرش آنلاین: ابتدا اجرای Frontend/Android CI روی وضعیت فعلی main و تأیید نصب APK؛ سپس محیط staging با HTTPS و PostgreSQL، مدیریت امن secrets و اتصال providerهای AI (Question Generator، Judge و AI Opponent)؛ پس از آن آزمون زنده ۱۰ دور 1vAI و آزمون 1v1 دو دستگاه شامل سؤال/زمان یکسان، قطع و وصل شبکه و بازیابی پس از بستن کامل اپ. پرداخت واقعی خارج از این مرحله و برای بعد از آماده‌شدن بازار/حقوق/مالی باقی می‌ماند. |
| 2026-11-14 | R-017 / پذیرش کلاینت، Live Scoreboard و آماده‌سازی زیرساخت آنلاین | Live Scoreboard با تغییر حداقلی و بدون بازطراحی Match Engine اضافه شد. `getMatch` همچنان امتیاز موقت را افشا نمی‌کند؛ endpoint مستقل `GET /matches/:matchId/live-score` فقط برای شرکت‌کنندگان همان مسابقه، امتیاز aggregate ثبت‌شده در Backend را برمی‌گرداند و هیچ answer/judge/question detail ندارد. Frontend در زمان نمایش سؤال هر ۱ ثانیه این snapshot را می‌خواند؛ امتیاز محلی/ساختگی حذف شده و در قطع موقت شبکه آخرین مقدار تأییدشده حفظ می‌شود. امتیاز فقط پس از ثبت در aggregate سرور تغییر می‌کند؛ بنابراین پاسخ Free Text تا پایان داوری امتیاز جدید نشان نمی‌دهد. منطق امتیازدهی و settlement موجود تغییری نکرد. | Backend CI [run 43641465346](https://github.com/iniya-studio/App-Nexira-/actions/runs/43641465346): success؛ Prisma format/validate/generate، PostgreSQL migrations، Nest production build، unit/integration tests و ESLint PASS. Android CI [run 43641610815](https://github.com/iniya-studio/App-Nexira-/actions/runs/43641610815) روی app commit `10e9dca36d1798d17ebb0f3265e1df6fc4fd1ffa`: success؛ ۹۸/۹۸ تست Frontend/Match Engine، Vite/Capacitor build، Gradle `assembleDebug`، APK verification و upload موفق. Artifact ID `14131948582`، حجم ZIP برابر ۶٬۲۹۱٬۶۷۰ بایت، SHA-256: `f853e55a814234e9c79d8621e22c752efa50c09ca2d7d2ea64c4ec4ee63f6b84`. | Backend endpoint/service/test commits: `c3d5dc9a83892ef6627681ee2fe20ed6d1b827bc`, `c1e10912cfc37a058c9bca6c6ce4afeac95de02d`, `a059f35fccbc06b90edb65bf40b9629f8bdeea77`; Frontend API/adapter/UI/test commits: `7cd0b540e6366fb68ab62889eb9e4f5b236f4219`, `3f24f0cacd916e990e2dc42d1b2d2fb29122a33b`, `2091c46c930a3d2824b8f3c772e8bd42ab3144f6`, `b14de15f40e9ec8f8c16d40da4c0384e5ac57a5b`, `61006bd7b0462e165f27360da7af550f0d8cdf16`, `10e9dca36d1798d17ebb0f3265e1df6fc4fd1ffa` | BACKEND CI PASS / ANDROID CI PASS / R-017 IN PROGRESS | گام بعد: آماده‌سازی staging HTTPS/PostgreSQL، secret management و health/readiness؛ اتصال credentialهای سه provider AI و پذیرش end-to-end 1vAI و 1v1 دو دستگاه. پرداخت واقعی خارج از دامنه این مرحله است. |

| 2026-11-14 | R-018 / خط‌پایه استقرار امن Staging و اعتبارسنجی Docker | فایل‌های استقرار تک‌نمونه‌ای staging به main اضافه شدند: Dockerfile چندمرحله‌ای Backend با runtime غیر root، Compose شامل PostgreSQL 16 در شبکه خصوصی و Backend، Caddy برای HTTPS خودکار، healthcheckها، محدودیت دسترسی پورت‌ها، نمونه متغیرهای محیطی بدون secret واقعی و راهنمای استقرار/پشتیبان‌گیری. Backend موجود و Match Engine بازطراحی نشدند. | GitHub Actions [run 43643270328](https://github.com/iniya-studio/App-Nexira-/actions/runs/43643270328): completed/success. تمام مراحل Backend CI موفق؛ Prisma format/validate/generate، migration روی PostgreSQL 16، Nest production build، تست‌های unit و integration، ESLint، اعتبارسنجی Compose و ساخت کامل Docker image همگی PASS. مرحله Compose با فایل نمونه اجرا شد؛ هیچ سرور واقعی یا DNS/HTTPS بیرونی در این آزمون راه‌اندازی نشده است. | استقرار: `48213ed161e5014f84afaa41afa14bd4f2238e2d`؛ CI/Docker validation: `44525ed0b67111fffd6b72f6804d8f6288584f33` | DONE / STAGING BASELINE CI PASS | موارد باقی‌مانده: تهیه VPS لینوکسی و دامنه، تنظیم DNS و بازبودن پورت‌های 80/443، ساخت فایل محلی `.env.staging` روی سرور و ورود secrets واقعی خارج از Git، تعیین دامنه و CORS origin واقعی، تنظیم credential/model سه مسیر AI (Question Generator، AI Judge و AI Opponent)، اجرای deploy، تأیید TLS و health/readiness از بیرون، سپس تست زنده ۱۰ دور 1vAI و آزمون 1v1 با دو دستگاه شامل سؤال/زمان یکسان، قطع/وصل شبکه و بازیابی پس از بستن کامل اپ. این Compose عمداً single-instance است؛ scale افقی تا زمان توزیع rate limit و هماهنگی workerها مجاز/تأییدشده نیست. پرداخت واقعی همچنان خارج از دامنه این مرحله است. |

| 2026-11-15 | R-019 / ممیزی 1v1 و هم‌ترازی اسناد با شواهد CI | ممیزی فقط‌خواندنی `main` تأیید کرد که صف عمومی و pairing در Backend، adapter و رابط صف آنلاین در Frontend، بازیابی صف/مسابقه، و endpointهای progression و ranking پیاده‌سازی شده‌اند. صف 1v1 در UI و Backend با feature flag غیرفعال می‌ماند تا پذیرش کامل دو دستگاه انجام شود. تست‌های PostgreSQL matchmaking سناریوهای سازگاری category/language، idempotency، جلوگیری از صف تکراری، FIFO/concurrency، انقضای صف، cancellation race و rollback را پوشش می‌دهند؛ این تست‌ها جایگزین پذیرش فیزیکی دو دستگاه نیستند. وضعیت سه سند NEX-BE-009، NEX-BE-010 و NEX-FE-001 با شواهد موجود اصلاح شد تا CI موفق به‌اشتباه «pending» و پذیرش زنده به‌اشتباه «تکمیل‌شده» ثبت نشود. | Backend CI `43639642201`: ۳۸/۳۸ suite و ۲۱۴/۲۱۴ test؛ Backend/Staging CI `43643270328`: Backend quality، Compose validation و Docker image build؛ Android CI `43641610815`: ۹۸/۹۸ تست Frontend/Match Engine، build و APK verification/upload؛ هر سه run موفق. در این نوبت تست جدیدی اجرا نشد و هیچ ادعایی درباره اجرای دو دستگاه، staging آنلاین یا تماس زنده AI ثبت نمی‌شود. | `64225b19f6d90d7e6a7afdbce53800105886684d`, `9c3d3443df992675f5c43c8f05649eba0ec54389`, `3ec715f74c6044ae9d03e11871501272393741bb` | DOCUMENTATION RECONCILED / TWO-DEVICE ACCEPTANCE PENDING | گام بعد: ممیزی تکمیل V1 با نگاه محصول جهانی، به‌ویژه localization و پشتیبانی زبان، Store/Inventory، حساب/پروفایل و جریان‌های کاربری؛ ادامه توسعه فقط در بخش‌های مستقل از VPS و اعتبار AI تا افتتاح حساب ارمنستان. سپس deploy واقعی و پذیرش زنده 1vAI/1v1. |

| 2026-11-15 | R-020 / تکمیل رابط V1 فروشگاه و مجموعه آیتم‌ها | صفحه Store از حالت placeholder خارج شد و یک storefront دو‌زبانه فارسی/انگلیسی با دسته‌های Featured، Frames، Profile Style، Match Effects و My Collection اضافه شد. شش طرح صرفاً به‌عنوان concept preview نمایش داده می‌شوند؛ پیش‌نمایش جزئیات دارد، اما خرید، پرداخت، قیمت‌گذاری، مالکیت یا موجودی جعلی ایجاد نمی‌شود. پیام شفاف غیرفعال‌بودن پرداخت و اصل عدم مزیت رقابتی حفظ شده است. هیچ تغییری در Backend یا مدل مالی انجام نشد. | تغییرات فقط روی `main`: App.jsx و nexira-premium.css. CI مربوط به Android با تغییر `app/**` باید اجرا شود؛ در این ثبت هنوز نتیجه اجرای جدید CI و بررسی ظاهری روی گوشی تأیید نشده است. کاتالوگ و UserInventory واقعی هنوز به API متصل نیستند و طرح‌های فعلی نمونه‌های نمایشی‌اند. | `9b03980e7a322b233bfb28c133e68a68ca6ede19`, `1db7cc3477d04e2830e497d751fdc5c3246bd7c7` | STOREFRONT UI BASELINE IMPLEMENTED / CI AND DEVICE VISUAL QA PENDING | گام بعد: بررسی CI و ظاهر Store در Android؛ سپس ممیزی و تکمیل بخش‌های V1 مستقل از سرور، با اولویت Profile/Account UX و پشتیبانی چندزبانه. اتصال catalog/ownership به Backend و پرداخت واقعی پس از تکمیل قراردادهای فروشگاه و آمادگی مالی انجام می‌شود. |

| 2026-11-15 | R-021 / پذیرش اولیه Store روی دستگاه و بازتنظیم ترتیب توسعه V1 | کاربر APK ساخته‌شده را دانلود و نصب کرد و تأیید داد که صفحه Store باز می‌شود و کاتالوگ نمایش داده می‌شود. این تأیید، smoke check دستیِ بازشدن فروشگاه است و به معنی تأیید کامل اندازه کارت‌ها، افکت‌ها، تمام تعاملات یا کیفیت بصری کل اپ نیست. تصمیم اجرایی ثبت شد: بازطراحی سراسری UI/UX فعلاً متوقف بماند؛ ابتدا زیرساخت، هسته، Backend و جریان‌های اصلی ممیزی/تکمیل شوند، آزمون‌ها و پذیرش‌های لازم انجام و شکاف‌ها اصلاح شوند؛ سپس UI/UX همه صفحات به‌صورت یکپارچه اجرا شود. گام بعدی ممیزی فنی Profile و Account UX بدون بازطراحی ظاهری و بدون تغییر Backend مگر با دلیل فنی مستند است؛ پس از آن زیرساخت localization چندزبانه برای بازار جهانی بررسی و توسعه می‌یابد. | Android CI run 43684477886: success؛ ۹۸/۹۸ تست Frontend/Match Engine، build وب/Android، APK verification و artifact upload موفق. Artifact 14149524239؛ SHA-256 f0e6ce11df5c69cac06d731fb58ca3bb0f68b433274b54440c5b7c9e3242be85. CI روی commit 1db7cc3477d04e2830e497d751fdc5c3246bd7c7 اجرا شد. نصب و بازشدن Store روی دستگاه توسط کاربر تأیید شد؛ بررسی کامل بصری/تعاملات همه صفحات انجام نشده و عمداً به مرحله UI/UX موکول است. | Store implementation: 9b03980e7a322b233bfb28c133e68a68ca6ede19, 1db7cc3477d04e2830e497d751fdc5c3246bd7c7؛ CI run 43684477886 | STORE DEVICE SMOKE CHECK CONFIRMED / PROFILE & ACCOUNT AUDIT NEXT / GLOBAL LOCALIZATION PLANNED / FULL UI/UX DEFERRED | گام بعد: ممیزی فقط‌خواندنی Profile و Account UX روی main؛ ثبت وضعیت مهمان/ثبت‌نام‌شده، ورود/ثبت‌نام، امنیت نشست و انتقال Guest، حریم خصوصی، خطاها و شکاف‌های Frontend/Backend. پس از ممیزی، فقط اصلاحات ضروری و مستدل با تست انجام شوند. سپس معماری localization چندزبانه و پوشش واقعی تمام متن‌ها/RTL/LTR بررسی شود. هیچ بازطراحی بصری سراسری در این مرحله انجام نشود. |

| 2026-11-15 | R-022 / ممیزی فقط‌خواندنی Profile و Account UX | ممیزی ایستای Frontend، API/session lifecycle، Backend identity/auth/session، Prisma و تست‌های موجود انجام شد؛ هیچ کد یا قرارداد Backend تغییر نکرد و هیچ تست جدیدی در این ممیزی اجرا نشد. نقاط قوت تأییدشده: Guest-to-User conversion در تراکنش Serializable، انتقال XP snapshot و ledger، Companion profile، صف انتظار و شرکت‌کننده مسابقه فعال، ابطال نشست/refresh مهمان؛ تست‌های اختصاصی انتقال و rollback موجودند. نشست Android از secure storage بومی استفاده می‌کند، access token حافظه‌ای است، refresh token چرخشی و retry idempotent دارد و reuse باعث ابطال نشست می‌شود. | شکاف‌های اصلی: ۱) نام نمایشی و آمارهای بخش Profile عمدتاً در localStorage نگهداری می‌شوند؛ ورودی playerName به API حساب وصل نیست و endpoint اختصاصی برای خواندن/ویرایش مشخصات اصلی User در مسیرهای موجود دیده نشد؛ بنابراین هویت و نام نمایشی بین دستگاه‌ها همگام نیستند. ۲) Backend و لایه API از Google Sign-In پشتیبانی می‌کنند اما AccountSessionPanel دکمه/جریان UI آن را ارائه نمی‌کند. ۳) مسیر ثبت‌نام مستقل برای حالت signed-out در پنل وجود ندارد؛ ایجاد حساب از مسیر تبدیل Guest در دسترس است. ۴) Email verification در Backend پیاده‌سازی شده و API خام verifyEmail وجود دارد، اما lifecycle و UI/deep-link آن را تکمیل نمی‌کنند. ۵) بازیابی/تغییر رمز عبور در UI صریحاً غیرفعال است و مسیر Backend متناظر در controllerهای بررسی‌شده وجود ندارد. ۶) پس از restore سرد نشست، پاسخ refresh فقط principal/session/tokens دارد و endpoint پروفایل جاری برای بازیابی email/displayName/verification state مشاهده نشد؛ در نتیجه account details در state کلاینت خالی می‌ماند. ۷) مدیریت نشست‌های فعال، خروج از همه دستگاه‌ها، export/delete account و گردش‌کار حریم خصوصی در APIهای بررسی‌شده موجود نیستند. ۸) نشست پایدار فعلاً Android-only است و iOS به Keychain adapter نیاز دارد. | تست‌های موجود: Frontend session lifecycle/coordinator/token store و Backend auth، Google verifier، email verification، guest conversion و session integration پوشش مناسبی برای منطق پایه دارند؛ اما هیچ فایل تست اختصاصی برای AccountSessionPanel یا UI end-to-end حساب در app/src پیدا نشد. اجرای CI یا تست در این نوبت انجام نشد؛ این بخش صرفاً ممیزی کد و موجودی تست‌هاست. Rate-limitهای چند ماژول در حافظه process نگهداری می‌شوند؛ پیش از scale افقی یا نیاز به پایداری در restart باید جداگانه ارزیابی شوند. | فایل‌های بررسی‌شده: app/src/components/AccountSessionPanel.jsx، app/src/api/sessionApi.js، sessionCoordinator.js، sessionLifecycle.js، sessionServices.js، tokenStore.js، nativeSecureStorage.js، app/src/game/data.js، app/src/App.jsx؛ Backend auth، guest-identity، session، companion، Prisma schema و قرارداد NEX-BE-002؛ تست‌های مرتبط Frontend/Backend | READ-ONLY AUDIT COMPLETE / CODE CHANGES NONE / TEST EXECUTION NONE / ACCOUNT CONTRACT GAPS IDENTIFIED | گام بعد: پیش از پیاده‌سازی، یک قرارداد/طرح اصلاحی محدود برای Account/Profile تهیه شود: منبع حقیقت server-side برای profile و آمار، بازیابی اطلاعات حساب پس از cold restore، همگام‌سازی displayName، Google UI، ثبت‌نام، تکمیل verification link، و تصمیم‌گیری درباره password recovery و مدیریت حریم خصوصی/نشست‌ها. سپس هر شکاف به ترتیب وابستگی با تست قرارداد/یکپارچه‌سازی پوشش داده شود. تغییر Backend فقط برای شکاف‌های تأییدشده و مستند مجاز است؛ بازطراحی UI/UX همچنان deferred است. |
| 2026-11-15 | R-023 / تکمیل Profile-Account foundation و برآورد وضعیت کل پروژه | پس از ممیزی R-022، قرارداد NEX-FE-002 و APIهای Profile/Account/Session روی main پیاده‌سازی شدند؛ endpointهای GET/PATCH /profile/me و GET /account/me، مدیریت نشست‌ها، ثبت‌نام مستقل و مسیر deep-link تأیید ایمیل به Frontend متصل شدند. در APK نصب‌شده توسط مالک، فرم ثبت‌نام اکنون دیده می‌شود اما دکمه ساخت حساب و اسکرول پایین صفحه در تست دستی کار نمی‌کنند؛ بنابراین این جریان UI پذیرفته‌شده نیست و باید در مرحله اصلاح UX/تعاملات و تست end-to-end برطرف شود. Google backend/API آماده است اما native Android plugin و دکمه/جریان UI Google هنوز پیاده‌سازی نشده‌اند. | Android CI run 43714635464 روی commit f624277f3d1d62a3de5564110ac6da081a495b6d: success؛ 109 تست Frontend/Match Engine PASS، web build، Android assemble، APK verification و artifact upload موفق. Artifact 14162136081، 6,297,925 bytes، انقضا 2026-11-29؛ SHA-256 artifact ZIP: 64fd1eed6d13c74a1c9e730f908c1ec5d5386c6ad78d36a7f9079d576831a4a3. Backend CI run 43711111608 روی commit d526eaa369c06c8be006f3fb32b05918d2524b84 موفق؛ ۳۹ suite و ۲۲۱ تست PASS. تست دستی مالک روی APK: پنل ثبت‌نام دیده می‌شود، ولی submit و scroll شکست خورده‌اند؛ no account-flow acceptance. | Profile API 9fd72a9eb797aec1c1684038ba2b673c8c301740; account endpoint 39760c323ed848683adf88ad73f8b6c4b9d7728a; session management d526eaa369c06c8be006f3fb32b05918d2524b84; frontend API 3233d2f3a75ac11ba6419dd518e80ed23579d792; profile UI 99c456f36adeec5a4a70219d1fd878dd790e89ee; registration/email link 1556904d62847929ee608f659142e7b9e91f2772; test correction a6f56d25e9e0f6561a43f34e5567235003c4f072; offline registration visibility fe2d5dfa68a51918dbcbdb2c1fa21f1bde8cb62f; JSX boundary fix f624277f3d1d62a3de5564110ac6da081a495b6d | BACKEND/ANDROID CI PASS / PROFILE API & SESSION FOUNDATION IMPLEMENTED / ACCOUNT UI DEVICE ACCEPTANCE FAILED-PENDING | گام بعد: اولویت با آزمون و تکمیل جریان‌های زیرساختی حساب (ثبت‌نام واقعی تا پاسخ سرور، cold restore، ایمیل، Google native sign-in و مدیریت خطا) همراه با تست اختصاصی AccountSessionPanel و scroll/touch؛ سپس ممیزی localization جهانی و اتصال Store catalog/ownership. UI redesign سراسری همچنان deferred. استقرار VPS/domain/provider credentials تا بازشدن حساب بانکی ارمنستان به تعویق بماند. |

### داشبورد وضعیت — مبنای ارزیابی 2026-11-15 (همگام‌سازی پس از R-029)

| شاخص | وضعیت فعلی |
|---|---|
| شاخه مرجع و HEAD | `main`؛ آخرین کد مبنای CI: `275ea52494129957b2d6cbe93ae7594d22be10bc`. اصلاحات و همگام‌سازی اسناد نیز فقط روی main ثبت شده‌اند؛ هیچ شاخه جدیدی ساخته نشده است. |
| مسیر اجرایی جاری تا انتشار | 1) حساب و هویت — پیاده‌سازی کد V1 تکمیل؛ 2) پذیرش واقعی حساب — **مرحله بعد و هنوز باز**؛ 3) اتصال واقعی سرور و AI و آزمون دو دستگاه؛ 4) Store، inventory، ownership و اقتصاد منصفانه؛ 5) اصلاح جریان‌ها و بازطراحی نهایی UX؛ 6) امنیت، عملیات، پایش، پشتیبان‌گیری و آزمون انتشار. مراحل وابسته به شواهد واقعی بسته می‌شوند، نه صرفاً CI سبز. |
| وضعیت اسناد ENG | ENG-001 و ENG-002 اسناد ممیزی/حفظ دارایی شاخه‌ها در snapshot مورخ 2026-11-13 هستند، نه سنجه پیشرفت محصول. آمار 74 فایل main در ENG-001 مربوط به snapshot تاریخی است؛ main فعلی 284 فایل tracked دارد. |
| وضعیت کیفیت خودکار | Backend CI [run 44061795160](https://github.com/iniya-studio/App-Nexira-/actions/runs/44061795160) روی documentation commit `483f3dbf` موفق: 45/45 suite و 259/259 test PASS؛ Prisma format/validate/generate، PostgreSQL 16 migrations، Nest build، ESLint، Compose validation و staging Docker image build PASS. این run قرارداد به‌روزشده NEX-BE-011 را نیز روی همان کد مبنای `275ea524` تأیید کرد. Backend CI کد مبنا [run 44061093871](https://github.com/iniya-studio/App-Nexira-/actions/runs/44061093871) نیز موفق بود و تست‌های queue-to-settlement، Guest conversion در دور ACTIVE، نشست لغوشده و retry پس از `SKIP LOCKED` را اجرا کرد. Android CI [run 44054787771](https://github.com/iniya-studio/App-Nexira-/actions/runs/44054787771) روی app commit `050998f0` موفق: 154/154 تست، Vite/Capacitor build، Gradle APK build، APK verification و artifact upload PASS؛ Artifact `14315103410`، 7,207,905 bytes. |
| هسته Backend و داده | NestJS/Prisma/PostgreSQL، migration chain، identity/session، match/round lifecycle، AI workers، matchmaking و progression/settlement در main موجود و CI-verified هستند؛ استقرار واقعی و provider execution تأیید نشده است. |
| 1vAI و 1v1 | هسته 1vAI و public 1v1 در main پیاده‌سازی و CI-verified هستند. بازیابی سرد 1vAI/1v1 پس از خطای موقت شبکه با retry افزایشی پوشش داده شده است. مسیر Backend از صف عمومی تا اجرای کامل 10 دور و تسویه exactly-once در PostgreSQL integration test پاس شده؛ Guest conversion در میانه دور ACTIVE نیز به‌صورت خودکار آزموده شده است: حساب جدید و حریف همان سؤال/مهلت را می‌گیرند و پاسخ می‌فرستند، نشست لغوشده مهمان رد می‌شود. پذیرش فیزیکی دو دستگاه، reconnect واقعی شبکه و live AI/server هنوز باز هستند. هر دو feature flag عمومی 1v1 تا عبور از NEX-BE-011 خاموش بمانند. |
| وضعیت فاز حساب در مسیر اجرایی | مرحله 1 (پیاده‌سازی) تکمیل است؛ مرحله 2 (پذیرش واقعی) باز و گام بعدی است. بنابراین حساب از نظر کدنویسی بسته شده، اما از نظر پذیرش انتشار هنوز DONE نهایی نیست. |
| Profile/Account | پیاده‌سازی کد حساب در V1 از نظر Backend/Frontend/Android تکمیل و CI-verified است: registration/login، guest conversion، email verification، forgot/reset/change/setup password، session list/revoke/logout، Google Credential Manager native sign-in و explicit linking. Google challenge در PostgreSQL فقط به‌صورت SHA-256 ذخیره می‌شود، پنج دقیقه اعتبار دارد و اتمیک یک‌بار مصرف می‌شود. فرم ثبت‌نام و صفحه پروفایل با scroll container اصلاح شده‌اند؛ اما پذیرش دستی روی دستگاه هنوز انجام نشده. برای اجرای واقعی لازم است Web OAuth client ID در GitHub secret `GOOGLE_WEB_CLIENT_ID` و Backend env `GOOGLE_CLIENT_ID` یکسان تنظیم شود، Android OAuth client با package/signing SHA-1 ثبت شود، SMTP و `EMAIL_VERIFICATION_URL`/`PASSWORD_RESET_URL` امن تنظیم شوند و `APP_LINK_HOST`/`VITE_APP_LINK_HOST` با دامنه دارای Digital Asset Links هماهنگ باشند. تا آن زمان Google/email live flow آماده کد است ولی live-accepted نیست. |
| Store و اقتصاد | storefront نمایشی دو‌زبانه روی APK باز می‌شود؛ catalog/ownership/inventory واقعی و purchase provider/پرداخت پیاده‌سازی یا پذیرش نشده‌اند. پرداخت واقعی عمداً deferred است. |
| Localization و تجربه | پوشش فعلی Frontend فارسی/انگلیسی است؛ localization جهانی و بررسی کامل تمام صفحات، اندازه‌ها، اسکرول و تعاملات باقی است. بازطراحی سراسری UI/UX عمداً deferred است. |
| امنیت/عملیات/انتشار | staging Docker/Compose baseline و CI validation موجود است؛ VPS، دامنه، DNS/TLS بیرونی، secrets، deployment، SMTP/OAuth credentials، انتشار فایل Digital Asset Links، observability/backup واقعی، load/security testing و release process نهایی باقی‌اند. Scale افقی نیز نیازمند rate-limit/worker coordination توزیع‌شده است. |
| برآورد اجرای V1 | حدود 48٪ ساخته‌شده / حدود 52٪ باقی‌مانده؛ برآورد مهندسی تقریبی با دامنه عدم‌قطعیت ±5 تا 8 واحد درصد، بر پایه دامنه V1 و معیارهای پذیرش این نقشه راه، نه تعداد فایل‌ها یا موفقیت CI به‌تنهایی. |
| آمادگی انتشار عمومی V1 | حدود 25–30٪؛ چون deploy واقعی، providerهای AI، تست دو دستگاه، حساب قابل‌استفاده، امنیت/عملیات و release acceptance هنوز باز هستند. |
| دامنه V2 | زیرساخت‌هایی مانند Companion و توسعه‌پذیری room وجود دارد؛ قابلیت‌های اجتماعی گروهی، روم‌ها، چالش تصویری و ظاهر واکنش‌گرای AI جزو درصد V1 محسوب نمی‌شوند. |

**روش تفسیر درصد:** 48٪ به معنی «نیمی از محصول آماده انتشار است» نیست. بخش قابل‌توجهی از هسته و کد Backend ساخته و CI-verified شده، اما پذیرش واقعی روی سرور/دستگاه و بخش‌های محصولی/عملیاتی هنوز تکمیل نشده‌اند.


| 2026-11-15 | R-024 / آغاز فاز تکمیل حساب و هویت | بازبینی مجدد کد و قراردادهای فعلی روی main انجام شد. هسته ثبت‌نام/ورود ایمیلی، Google verifier سمت Backend، Guest conversion، email verification، token rotation و session management موجودند؛ اما password recovery/change، explicit Google linking، native Google Android flow و پذیرش end-to-end حساب هنوز کامل نیستند. قرارداد NEX-BE-011 برای بازیابی و تغییر رمز عبور، توکن مستقل یک‌بارمصرف، پاسخ ضد-enumeration، ابطال نشست‌ها، audit و آزمون‌های لازم ثبت شد. هیچ کد اجرایی در این نوبت تغییر نکرده است. | Read-only audit of current auth/account/session services and tests; prior Backend CI run 43711111608 succeeded on d526eaa3, but no backend CI was run for this documentation-only contract commit. | main: 768c03ec665b1e83c435aedc5aca8b8e6c01f301; new contract: docs/NEX-BE-011-password-recovery-credential-lifecycle.md | ACCOUNT/IDENTITY AUDIT REFRESHED / PASSWORD LIFECYCLE CONTRACT LOCKED / IMPLEMENTATION NOT YET STARTED | گام بعد: اجرای NEX-BE-011 با مدل مستقل PasswordResetToken و migration افزایشی، service/controller/email adapter، atomic reset و revocation، password-change و unit/PostgreSQL integration tests؛ سپس Google linking/native sign-in و end-to-end account acceptance. UI polish remains deferred, but registration submission must pass before account-flow acceptance. |

| 2026-11-15 | R-025 / پیاده‌سازی Password Recovery & Credential Lifecycle | مدل PasswordResetToken و Migration افزایشی PostgreSQL، سرویس بازیابی رمز با توکن ۲۵۶بیتی هش‌شده و یک‌بارمصرف، پاسخ ضد-enumeration، ارسال ایمیل مستقل، ابطال همه نشست‌ها/Refresh Tokenها پس از Reset، API تغییر رمز با حفظ نشست جاری و ابطال نشست‌های دیگر و توکن‌های Reset قبلی، DTOها و تست واحد و PostgreSQL integration اضافه شدند. | Backend CI run 43727007771 روی commit d2e89d2e موفق: Prisma format/validate/generate، migration روی PostgreSQL، NestJS production build، 43 test suites و 238 tests PASS، ESLint، staging Compose validation و Docker image build PASS. | main code: d2e89d2e60225ca0219fbe6d8d7df7b7fa211999; CI: https://github.com/iniya-studio/App-Nexira-/actions/runs/43727007771 | PASSWORD LIFECYCLE IMPLEMENTED / POSTGRESQL INTEGRATION VERIFIED / CI GREEN | گام بعد: تکمیل Google account linking صریح و امن در Backend؛ سپس Google native Android sign-in، اتصال APIهای recovery/change به frontend، صفحه reset/deep-link، پیکربندی SMTP فقط در محیط امن، و پذیرش end-to-end حساب و نشست‌ها. |

| 2026-11-15 | R-026 / Google identity linking صریح | AccountIdentityService و API ‏POST /account/identities/google/link اضافه شد. اتصال فقط با USER احراز‌شده، ایمیل حساب تأییدشده و تطبیق ایمیل Google تأییدشده انجام می‌شود؛ اتصال خودکار با تطبیق ایمیل ممنوع است، اتصال تکراری idempotent و هویت متصل به حساب دیگر رد می‌شود؛ رویداد audit ثبت می‌شود. | Backend CI run 43727387178 روی commit d5ec1169 موفق: Prisma format/validate/generate، PostgreSQL migrations، NestJS build، 44 test suites و 244 tests PASS، ESLint، staging Compose و Docker image build PASS. Password lifecycle PostgreSQL integration نیز در run قبلی 43727007771 موفق بود. | main code: d5ec116957835aca3e08f57a5bbe045cb462b435; CI: https://github.com/iniya-studio/App-Nexira-/actions/runs/43727387178 | PASSWORD RECOVERY/CHANGE VERIFIED / EXPLICIT GOOGLE LINKING IMPLEMENTED / CI GREEN | گام بعد: Google native Android sign-in با مسیر SDK پشتیبانی‌شده؛ سپس اتصال APIهای reset/change/link به frontend و صفحه reset/deep-link، اصلاح ثبت‌نام دستی (submit/scroll)، SMTP امن و پذیرش end-to-end چنددستگاهی. |


| 2026-11-15 | R-027 / همگام‌سازی دفتر روزانه پس از تکمیل Backend Identity | وضعیت سند مرکزی با R-025 و R-026 تطبیق داده شد؛ نسخه سند به 3.7 ارتقا یافت، خلاصه بالای سند، وضعیت آیتم‌های 04.02/04.03 و داشبورد CI و Profile/Account به‌روزرسانی شدند. گزارش‌های R-025 و R-026 از قبل موجود بودند و تکرار نشدند. اسناد تخصصی دیگر عمداً تغییر نکردند. | Documentation-only update؛ هیچ کد، migration یا تنظیم اجرایی تغییر نکرد و تست جدیدی اجرا نشد. شواهد فنی همان Backend CI run 43727007771 (43 suites / 238 tests) و run 43727387178 (44 suites / 244 tests)، هر دو موفق، هستند. Android CI آخرین نتیجه ثبت‌شده run 43714635464 با 109 تست موفق است. | مبنای main پیش از این به‌روزرسانی: `cfa48a9faf4c7e79dec58a90d2a4f67047bf0405`; آخرین کد Backend حساب: `d5ec116957835aca3e08f57a5bbe045cb462b435` | DAILY LOG & DASHBOARD SYNCED / BACKEND IDENTITY CI GREEN / ACCOUNT UI ACCEPTANCE STILL OPEN | گام بعد: Google Sign-In بومی Android؛ سپس اتصال APIهای recovery/change/link به رابط کاربری، تکمیل صفحه reset/deep-link و اصلاح submit/scroll فرم ثبت‌نام. SMTP واقعی فقط پس از تنظیم امن محیط اجرا فعال شود. |


| 2026-11-15 | R-028 / تکمیل پیاده‌سازی یکپارچه حساب و هویت V1 | جریان‌های ثبت‌نام مستقل و Guest conversion، ورود ایمیلی، email verification، forgot/reset/change/setup password، مدیریت نشست‌ها، Google Sign-In بومی Android با Credential Manager، اتصال صریح Google و challenge endpoint یک‌بارمصرف server-issued تکمیل شدند. GoogleAuthChallenge با nonce hash شده، TTL پنج‌دقیقه‌ای، مصرف اتمیک و rate limit به Prisma/PostgreSQL اضافه شد؛ nonce مفقود/نامنطبق/منقضی/مصرف‌شده رد می‌شود. فرم ثبت‌نام و اسکرول صفحه پروفایل اصلاح شدند؛ reset/email verification از custom scheme و HTTPS App Links قابل پشتیبانی‌اند و host از build config خوانده می‌شود. قرارداد NEX-BE-002 به v1.2 همگام شد. | Backend CI run 43730559643: 44 suites / 251 tests PASS؛ Prisma format/validate/generate، migration PostgreSQL 16، Nest production build، ESLint، Compose و Docker image PASS. Android CI run 43730346205: 120/120 tests PASS، Vite/Capacitor/Gradle build، APK verification و upload PASS؛ Artifact 14168147820، 7,205,961 bytes، SHA-256 `197ba07f406c04f9b06da2a2b8d53f29c12563268e00062d668f68c696b80126`. | Backend/code/config baseline: `6572f1e97273b25b335829f7f95ac49ee1843c4c`; Android app CI commit: `cd4451e211a14f2f7742fd15f05d8e71d022d7c1`; new migration: `20261115000300_add_google_auth_challenges`; contract: `docs/NEX-BE-002-identity-access-contracts.md` v1.2 | ACCOUNT/IDENTITY IMPLEMENTATION COMPLETE / BACKEND & ANDROID CI GREEN / LIVE DEVICE & EXTERNAL CONFIG PENDING | دامنه کدنویسی فاز حساب بسته می‌شود و فقط به‌عنوان release gate پیگیری خواهد شد: GitHub secret `GOOGLE_WEB_CLIENT_ID` و Backend `GOOGLE_CLIENT_ID` یکسان؛ Android OAuth client با package و SHA-1؛ SMTP و URLهای HTTPS ایمیل؛ `APP_LINK_HOST` و Digital Asset Links؛ سپس نصب APK و پذیرش دستی submit/scroll، Google sign-in/link، email verification/reset، password change و session management. تا فراهم‌شدن این تنظیمات، هیچ ادعای live acceptance نداریم. کار توسعه بعدی می‌تواند به ممیزی localization جهانی و سپس Store catalog/ownership منتقل شود. |
| 2026-11-15 | R-029 / ثبت مسیر اجرایی تا انتشار و تفکیک پیاده‌سازی از پذیرش حساب | مسیر شش‌مرحله‌ای مورد توافق برای ادامه کار ثبت شد: (1) پیاده‌سازی حساب و هویت — کدنویسی V1 تکمیل؛ (2) پذیرش واقعی حساب — مرحله بعد و باز؛ (3) اتصال واقعی سرور و AI و آزمون دو دستگاه؛ (4) Store، موجودی، مالکیت و اقتصاد بدون برتری رقابتی پولی؛ (5) اصلاح جریان‌ها و بازطراحی نهایی UI/UX؛ (6) آماده‌سازی انتشار شامل امنیت، زیرساخت، پایش، پشتیبان‌گیری و آزمون انتشار. CI سبز جایگزین پذیرش واقعی نیست؛ مرحله 2 باید روی APK نصب‌شده و با OAuth/SMTP/App Links واقعی و سناریوهای end-to-end اجرا و مستند شود. | شواهد موجود: Backend CI run 43730559643 با 44 suite/251 tests و Android CI run 43730346205 با 120/120 tests موفق؛ این شواهد فقط آزمون خودکارند و پذیرش واقعی دستگاه/سرویس را اثبات نمی‌کنند. | مبنای main پیش از ثبت: `20fe87cfe408d08d99f501d5dbcaece113fcd370` | ROADMAP SEQUENCE RECORDED / ACCOUNT IMPLEMENTATION COMPLETE / REAL-WORLD ACCEPTANCE OPEN | گام بعدی: اجرای مرحله 2 پذیرش واقعی حساب و هویت؛ تا عبور از معیارهای آن، مرحله 1 از نظر کدنویسی بسته می‌ماند ولی انتشارپذیری حساب تأیید نهایی نمی‌شود. |

| 2026-11-17 | R-030 / ممیزی عمیق چرخه عمومی 1v1 و اثبات یکپارچه صف تا تسویه | ممیزی کد صف و مسابقه نشان داد جفت‌سازی FIFO/سازگار با category و language، قفل‌های PostgreSQL، cancellation race، idempotency پاسخ و تسویه مستقل از transport در کد موجودند. شکاف واقعی کلاینت: بازیابی سرد صف/مسابقه در صورت خطای موقت شبکه فقط یک‌بار تلاش می‌کرد؛ retry کنترل‌شده با backoff تا سقف 30 ثانیه اضافه شد. آزمون چنددوره‌ای Backend از ساخت مستقیم Match به شروع از public matchmaking queue تغییر کرد: دو principal احرازشده، دو queue entry، یک match، ده round مشترک، finalization، XP/Global Ranking exactly-once و وضعیت terminal صف هر دو کاربر را پوشش می‌دهد. اسناد NEX-BE-009 و NEX-BE-011 با شواهد همگام شدند. | Android CI run 44054787771 روی `050998f08fad0109a00858c3e4d1cbbd7c25b9ae`: 154/154 tests PASS، web/Android build، APK verify و upload موفق؛ Artifact `14315103410`. Backend CI run 44058707927 روی `099c86102076b22f1127e292a7f0bb136344ca61`: 45/45 suites و 257/257 tests PASS؛ بازیابی snapshot مسابقه فعال برای هر دو بازیکن، race پاسخ دیرهنگام در برابر Deadline Worker بدون پاسخ/جریمه تکراری، و انتقال مالکیت Guest به User در مسابقه فعال نیز بررسی شدند، PostgreSQL 16 migrations، Nest build، ESLint، Compose و Docker image PASS؛ تست `multi-round-lifecycle.integration.spec.ts` از صف عمومی تا تسویه کامل اجرا شد. | app fix: `050998f08fad0109a00858c3e4d1cbbd7c25b9ae`; Backend E2E baseline: `847f9d17383a66501acbb53e493fe81af3ff3eb8`; active recovery assertion: `6e43ed308447c1988134848b4864a8fe68016677`; answer/deadline race test: `48e72b2bd4ae4b30ae01eb19f6168a5705ad4c13`; guest-conversion active-match integration: `099c86102076b22f1127e292a7f0bb136344ca61`; NEX-BE-011 در main به‌روزرسانی شد. | PUBLIC 1v1 QUEUE-TO-SETTLEMENT AUTOMATED PATH VERIFIED / COLD-START NETWORK RETRY FIXED / TWO-DEVICE ACCEPTANCE PENDING | گام بعد: ادامه ممیزی race/reconnect و آزمون‌های امنیتی/مرزی 1v1؛ سپس اجرای سناریوهای NEX-BE-011 روی دو دستگاه واقعی با سرور HTTPS عملیاتی. تا ثبت شواهد تمام سناریوها، feature flags خاموش بمانند؛ CI سبز جایگزین پذیرش فیزیکی نیست. |

| 2026-11-17 | R-031 / بستن شکاف Guest Conversion در دور زنده و رقابت نشست/Logout | ممیزی نشان داد تست قبلی با وجود عنوان «active match» مسابقه را در WAITING نگه می‌داشت؛ تست یکپارچه اصلاح شد تا ابتدا یک دور واقعی ACTIVE ایجاد کند. پس از تبدیل مهمان، ownership صف و MatchParticipant منتقل می‌شود، حساب جدید و حریف همان سؤال و deadline را بازیابی می‌کنند و هر دو پاسخ ACCEPTED ثبت می‌کنند؛ هویت مهمان قدیمی نه می‌تواند مسابقه/سؤال را بخواند و نه پاسخ بفرستد. شکاف امنیتی دیگری نیز بسته شد: GuestIdentityService اکنون داخل تراکنش، ردیف UserSession دقیق درخواست را قفل و مالکیت/عدم ابطال/عدم انقضا را دوباره بررسی می‌کند؛ Logout زودتر از تبدیل، باعث رد درخواست و عدم ساخت User می‌شود. تست Deadline race نیز با semantics واقعی `FOR UPDATE SKIP LOCKED` همسو شد: اگر پاسخ ابتدا قفل دور را بگیرد، Worker می‌تواند آن poll را رد کند و در نوبت بعد retry می‌کند؛ معیار تست، تکمیل نهایی رکورد دور و ledger است، نه الزام به `true` در همان poll اول. اسناد NEX-BE-002، NEX-BE-009 و NEX-BE-011 همگام شدند. | Backend CI run 44061093871 روی `275ea52494129957b2d6cbe93ae7594d22be10bc`: 45/45 suites و 259/259 tests PASS؛ تست‌های `guest-identity-conversion.integration.spec.ts`، `session.integration.spec.ts` و `round-deadline.integration.spec.ts` PASS؛ Prisma format/validate/generate، migration PostgreSQL 16، Nest production build، ESLint، staging Compose و Docker image build همگی PASS. سپس پس از همگام‌سازی NEX-BE-011، Backend CI run 44061795160 روی `483f3dbf1cca3fa2109cf75dbab8448958a16217` نیز با 45/45 suites و 259/259 tests و تمام مراحل Docker/Compose موفق شد. اجرای قبلی 44060302368 به‌علت assertion بیش‌ازحد سخت‌گیرانه در تست Deadline شکست خورد (44/45 suites؛ تست Guest Conversion خودش PASS بود) و اصلاح شد؛ هر دو اجرای نهایی سبز هستند. | code: `df6370d6e1f40628e4a89b4d4b5dbe95b047754e` (session revalidation), `ddcbec8e36a2de4e5723174b13a7a1081efa6682` (active-round read/answer), `275ea52494129957b2d6cbe93ae7594d22be10bc` (deadline race test); docs NEX-BE-002/009/011 updated on main. | GUEST CONVERSION MID-ROUND AUTOMATED / STALE SESSION CONVERSION BLOCKED / DEADLINE SKIP-LOCKED RETRY VERIFIED / 259 TESTS PASS / TWO-DEVICE ACCEPTANCE PENDING | گام بعد: آزمون race هم‌زمان Logout در برابر Conversion و Conversion در برابر Match settlement، سپس سناریوهای NEX-BE-011 روی دو دستگاه واقعی و سرور HTTPS عملیاتی. Rate limiting توزیع‌شده طبق NEX-BE-003 همچنان release gate مستقل است؛ feature flags عمومی 1v1 خاموش بمانند. |

| 2026-11-19 | R-033 / مرور مسیر Localization و سخت‌سازی قرارداد زبان AI روی main | مسیر L10N-01 تا L10N-04 و اسناد NEX-BE-007/008/009 مرور شد. تأیید شد که UI از دیکشنری‌های محلی en/fa استفاده می‌کند و وابستگی ترجمه‌ای runtime به AI ندارد؛ matchmaking و profile در Backend فعلاً فقط en/fa را می‌پذیرند و صف عمومی 1v1 بر اساس category+language جفت‌سازی می‌کند. قرارداد Question Generator تقویت شد تا prompt، گزینه‌ها، answer key، rubric و متن localized را مستقیماً به زبان انتخابی تولید کند و از English-first/English-fallback منع شود. قرارداد AI Judge تقویت شد تا زبان ذخیره‌شده سؤال را مرجع ارزیابی معنایی بداند. تست‌های adapter برای درخواست فارسی و انگلیسی افزوده شدند. تصمیم cross-language matchmaking باز ماند: در وضعیت فعلی دو کاربر با زبان‌های متفاوت در یک صف 1v1 جفت نمی‌شوند؛ پیش از تغییر این رفتار باید تصمیم محصولی و طراحی per-participant localization/Judge ثبت شود. | تغییرات روی `main`: `5b5ac07b4c24398f3614f609393970babb60adcc`, `45101fdcba02b1c41348b264c072e42c5f4c922b`, `f1940d2d3dca475152be2c7d9bd087a5781ba331`, `7f6419185a37227c6b82d541b87b091d841ac46f`, `ccbacf0d77950b16e4419936c00545995fea95a6`, `78bace8e3bacf0af154c9bffe447ce1e53dc9e12`; اسناد: `9aa612e8537de05aa898d00409c3ba47c8e4c52f`, `7c76b4537c1b13bfe6b33ea32f0bb3252988f336`, `f5f529087cbd01827ffec59a379f855c19ce78d9`, `0faa9e5489c0e2e7f768b16579c9ee613c0accfe` و اصلاحات دفتر مرکزی | AI LANGUAGE CONTRACT HARDENED / TESTS ADDED — NOT YET EXECUTED / CROSS-LANGUAGE 1v1 DECISION OPEN | CI هنوز نتیجه‌ای برای تغییرات جدید ثبت نکرده؛ اجرای تست‌های adapter و Backend CI لازم است. گام بعد: تعیین تکلیف صف 1v1 چندزبانه، سپس افزودن تست‌های end-to-end زبان از انتخاب کاربر تا سؤال/داوری و تکمیل بسته‌های UI محلی. |\n| 2026-11-19 | R-032 / تثبیت race نشست و ثبت موارد Deferred | تست Guest Logout در برابر Guest Conversion از هم‌زمان‌سازی غیرقطعی به دو سناریوی deterministic با قفل PostgreSQL و اثبات ورود درخواست رقیب به صف انتظار lock تبدیل شد: در conversion-first، تبدیل موفق و Logout فقط نشست قدیمی را revoke می‌کند؛ در logout-first، تبدیل رد می‌شود و هیچ User ساخته نمی‌شود. کد Conversion در برابر Match Settlement بدون تغییر نگه داشته شد؛ تست‌های integration موجود آن در همین CI اجرا و موفق شدند. شکاف Android Keystore با شناسه `AND-SEC-KEYSTORE-001` طبق تصمیم مالک پروژه تا پایان سایر بررسی‌ها Deferred شد و به‌عنوان حل‌شده ثبت نمی‌شود. | GitHub Actions [Backend CI run 44392913659](https://github.com/iniya-studio/App-Nexira-/actions/runs/44392913659): `completed / success`؛ Job `Backend Quality Checks` موفق. همه مراحل 29گانه موفق، شامل Prisma format/validate/generate، PostgreSQL 16 migration، Nest production build، unit و PostgreSQL integration tests، ESLint، staging Compose validation و Docker image build. تست‌های race در `session.integration.spec.ts` و `guest-identity-conversion.integration.spec.ts` در مرحله تست‌های یکپارچه‌سازی اجرا شدند؛ تست‌های Conversion/Settlement نیز در مجموعه موجود اجرا شدند. | `f9e4b26d0d19928b8c1fe4d5c78903d25880aecb` | GUEST LOGOUT/CONVERSION RACE VERIFIED BY CI / CONVERSION-SETTLEMENT REGRESSION SUITE PASS / KEYSTORE DEFERRED | از چرخه هویت/نشست فعلاً خارج می‌شویم؛ گام بعدی باید از یک بخش مستقل و دارای معیار پذیرش روشن انتخاب شود. Keystore فقط در پایان و با تست instrumentation روی دستگاه/Emulator و اثبات بازیابی نشست واقعی بازبینی می‌شود. |

| 2026-11-19 | R-034 / تصویب دامنه نهایی Localization و معماری 1v1 چندزبانه | مالک محصول تأیید کرد هر ۲۰ زبان هدف باید در APK انتشار قابل انتخاب و واقعاً عملیاتی باشند و گزینه دوم برای 1v1 تصویب شد: بازیکنان با زبان‌های متفاوت در یک دسته می‌توانند جفت شوند؛ هر بازیکن همان سؤال معنایی/گزینه‌ها/شرایط را به زبان انتخابی خود دریافت می‌کند و پاسخ آزاد با زبان همان شرکت‌کننده داوری می‌شود. ممیزی تأیید کرد کد فعلی صف را با category+language جفت می‌کند و DTO/سرویس فقط en/fa را می‌پذیرند؛ این رفتار به‌عنوان شکاف شناخته‌شده ثبت شد. سند audit و ADR معماری اضافه شدند و ترتیب کار به قرارداد per-participant، backend delivery، پوشش کامل ۲۰ locale و release gates تقسیم شد. | Documentation commits on main: ثبت ADR و audit و این دفتر؛ هیچ ادعای پیاده‌سازی backend یا ترجمه ۲۰ زبان نشده است. تست جدیدی در این مرحله اجرا نشده است. | `docs/LOCALIZATION_GLOBALIZATION_AUDIT.md`; `docs/NEX-L10N-ADR-001-CROSS-LOCALE-1V1.md` | PRODUCT DECISION APPROVED / TECHNICAL IMPLEMENTATION OPEN | گام بعد: ممیزی schema و MatchService برای تعیین محل snapshot زبان هر participant و قرارداد question variant؛ سپس تغییر additive backend به matchmaking category-only و delivery/Judge participant-specific همراه PostgreSQL integration tests. بعد از تثبیت قرارداد، مهاجرت namespaceهای UI و تکمیل واقعی هر ۲۰ بسته زبان انجام می‌شود. |

## 9. قالب گزارش پایان هر نوبت کاری

- **انجام شد:** آیتم‌ها و تغییرات واقعی.
- **آزمون:** فرمان/سناریو و نتیجه دقیق.
- **main:** commit SHA و وضعیت working tree.
- **پیشرفت:** تعداد DONE و باقی‌مانده در فاز؛ بدون درصدسازی.
- **مانع:** فقط مانع واقعی و اثر آن.
- **گام بعدی:** یک آیتم مشخص با وابستگی‌های روشن.

## 10. Change Log

| نسخه | تاریخ | تغییر |
|---|---|---|
| 1.0 | 2026-11-13 | ایجاد نقشه راه جامع V1، پیش‌بینی زیرساخت V2، قواعد پذیرش و دفتر روزانه پیشرفت |
| 1.1 | 2026-11-13 | شفاف‌سازی وضعیت ممیزی شاخه‌ها به‌عنوان انجام‌شده و تفکیک آن از تطبیق اجرایی کد و آزمون‌های main |
| 1.2 | 2026-11-13 | ثبت پاک‌سازی ۱۳ شاخه remote، تأیید باقی‌ماندن فقط `main` در GitHub، و ثبت پیگیری شاخه محلی AI Opponent Worker برای بررسی ایمن در آینده |
| 1.3 | 2026-11-13 | ثبت بازسازی ۱۰۰ فایل Frontend، ۱۱۹ فایل Backend و ۱۱ سند از Snapshot تغییرناپذیر، حذف ساختار تکراری ریشه، و موفقیت کامل Android و Backend CI مستقل روی `main` |
| 1.4 | 2026-11-13 | تکمیل شواهد آزمون: ۸۴ تست Frontend/Match Engine، ساخت و آپلود APK با checksum ثبت‌شده، و ۱۶۸ تست Backend در ۳۲ suite همراه با migration و lint موفق |
| 1.5 | 2026-11-13 | ثبت ممیزی اتصال Frontend/Backend: شناسایی local adapter فعال و شکاف‌های public matchmaking و result API؛ تعیین گام بعدی برای vertical slice |
| 1.6 | 2026-11-13 | تکمیل قراردادهای result API و category/language برای 1vAI؛ اتصال production Frontend به server-driven lifecycle؛ ثبت ۸۷ تست Frontend و ۱۷۱ تست Backend موفق، APK build موفق، و موانع deployment/provider و 1v1 |
| 1.7 | 2026-11-13 | سخت‌سازی result API برای پنهان‌ماندن پاسخ/امتیاز تا finalization؛ gate کردن winner metadata؛ افزودن CORS allowlist برای Android Capacitor؛ ثبت ۱۷۳ تست Backend و CI سبز |
| 1.8 | 2026-11-13 | بازبینی کامل چرخه 1vAI؛ اصلاح برچسب‌های UI production؛ technical void برای شکست AI Opponent و محدودیت دو جایگزینی؛ ثبت آزمون ۱۰ دور و ۱۷۵ تست Backend در ۳۳ suite به‌همراه Android CI سبز |
| 1.9 | 2026-11-13 | رفع race بین Deadline Worker و AI Judge technical void؛ حفظ polling پس از خطای موقت API و تفکیک خطای ارسال پاسخ از خطای دریافت نتیجه؛ ثبت ۱۷۶ تست Backend و ۸۹ تست Frontend موفق به‌همراه APK تأییدشده |
| 2.0 | 2026-11-13 | ثبت پذیرش فنی هسته 1vAI در R-012.2 و افزودن قرارداد NEX-BE-009 برای public 1v1 matchmaking، صف پایدار و pairing اتمیک؛ شروع فاز implementation |
| 2.1 | 2026-11-14 | ثبت قرارداد NEX-BE-010 برای تسویه exactly-once XP/Ranking، پیشرفت مهمان و منحنی Level؛ تثبیت سیاست ادامه توسعه فقط روی main و عدم ادغام PR قدیمی بدون پذیرش واقعی |
| 2.2 | 2026-11-14 | ثبت شواهد بازبینی ایستای 1vAI، public 1v1، نشست و XP/Ranking؛ ثبت دقیق CI Prisma formatting blocker و تفکیک پیاده‌سازی موجود از آزمون‌های runtime و پذیرش زنده انجام‌نشده |
| 2.3 | 2026-11-14 | ثبت موفقیت کامل Backend CI روی main با ۳۸ suite و ۲۱۴ تست؛ بستن blocker قدیمی Prisma/Backend و تعیین R-017 برای Android verification، staging HTTPS/PostgreSQL، اتصال providerهای AI و پذیرش زنده 1vAI/1v1؛ پرداخت واقعی همچنان خارج از دامنه این مرحله است |
| 2.4 | 2026-11-14 | ثبت آغاز R-017؛ هم‌ترازی adapter/UI و تست Frontend با قرارداد عدم افشای امتیاز زنده؛ ثبت موفقیت مرحله Frontend tests روی HEAD و وضعیت درحال‌اجرای Gradle؛ ممیزی اولیه متغیرهای secrets و نبود فایل deployment/compose؛ بدون ادعای تکمیل APK یا پذیرش آنلاین |
| 2.5 | 2026-11-14 | ثبت موفقیت Android CI روی main: ۹۷/۹۷ تست Frontend، Vite/Capacitor build، Gradle assembleDebug، APK verification و upload artifact؛ R-017 برای staging و پذیرش آنلاین همچنان باز است |
| 2.6 | 2026-11-14 | ثبت Live Scoreboard سرورمحور با endpoint مستقل شرکت‌کنندگان، polling یک‌ثانیه‌ای کلاینت، عدم افشای پاسخ/داوری، حذف امتیازهای ساختگی و افزودن تست‌های Backend/Frontend؛ Backend CI موفق و Android CI در حال اجرا |
| 2.7 | 2026-11-14 | ثبت موفقیت نهایی Backend و Android CI برای Live Scoreboard؛ ۹۸/۹۸ تست Frontend/Match Engine، Gradle build، APK verification و upload artifact با شناسه `14131948582` |
| 2.8 | 2026-11-14 | ثبت خط‌پایه استقرار staging شامل Dockerfile، Compose، PostgreSQL خصوصی، Caddy/HTTPS، healthchecks، نمونه env و راهنمای عملیات؛ ثبت موفقیت کامل Backend CI، Compose validation و Docker image build در run `43643270328`؛ تفکیک شفاف موارد آماده‌شده از deploy واقعی، secrets/provider credentials و پذیرش زنده باقی‌مانده |
| 2.9 | 2026-11-15 | هم‌ترازی وضعیت اسناد matchmaking 1v1، progression/Ranking و Frontend–Backend با شواهد CI؛ ثبت ممیزی کد و تست‌های صف/جفت‌سازی؛ تفکیک صریح CI موفق از پذیرش دو دستگاه و اجرای زنده AI که همچنان باز هستند |
| 3.0 | 2026-11-15 | افزودن رابط کامل‌تر Store به‌صورت catalog preview دو‌زبانه با دسته‌بندی‌ها، جزئیات ظاهری و empty state مجموعه؛ بدون پرداخت، قیمت یا ادعای مالکیت ساختگی؛ ثبت CI و visual QA به‌عنوان pending |
| 3.1 | 2026-11-15 | ثبت تأیید دستی نصب APK و بازشدن Store روی دستگاه، نتیجه Android CI run 43684477886 با ۹۸/۹۸ تست موفق، و تصمیم جدید ترتیب اجرا: تکمیل/ممیزی زیرساخت و هسته، سپس Profile/Account و localization جهانی، و موکول‌کردن بازطراحی سراسری UI/UX به مرحله بعد |
| 3.2 | 2026-11-15 | ثبت ممیزی فقط‌خواندنی Profile/Account: تأیید نقاط قوت guest conversion و session security، شناسایی شکاف‌های profile server-sync، Google UI، verification deep-link، recovery، cold-restore account data، privacy/session management و نبود تست UI اختصاصی؛ بدون تغییر کد و بدون اجرای تست جدید |
| 3.3 | 2026-11-15 | ثبت پیاده‌سازی Profile/Account API و نشست‌ها، ثبت‌نام مستقل و deep-link ایمیل روی main؛ ثبت شکست پذیرش دستی submit/scroll در APK، نبود Google native UI، CI سبز Backend/Android و برآورد اولیه 48٪ اجرای V1 در برابر 25–30٪ آمادگی انتشار عمومی |
| 3.4 | 2026-11-15 | ثبت بازبینی مجدد Auth/Account/Session و قرارداد NEX-BE-011 برای password recovery/change، توکن مستقل یک‌بارمصرف، جلوگیری از account enumeration، ابطال نشست‌ها و معیارهای آزمون؛ پیاده‌سازی اجرایی هنوز شروع نشده است |
| 3.5 | 2026-11-15 | ثبت پیاده‌سازی کامل Password Recovery/Change در Backend، Migration و آزمون PostgreSQL؛ CI run 43727007771 با 43 suite و 238 test موفق و Docker image build سبز |
| 3.6 | 2026-11-15 | ثبت پیاده‌سازی اتصال صریح و امن Google به حساب موجود؛ CI run 43727387178 با 44 suite و 244 test موفق و Docker image build سبز |
| 3.7 | 2026-11-15 | همگام‌سازی خلاصه، وضعیت فاز هویت و داشبورد مرکزی با R-025/R-026؛ ثبت نتیجه نهایی Backend CI با 44 suite و 244 test، تفکیک روشن پیشرفت Backend از پذیرش UI حساب و ثبت R-027؛ بدون تغییر اسناد تخصصی یا کد اجرایی |
| 3.8 | 2026-11-15 | ثبت تکمیل پیاده‌سازی یکپارچه حساب و هویت V1 شامل Password Lifecycle UI/API، Google Credential Manager بومی، چالش یک‌بارمصرف server-issued با مصرف اتمیک و replay rejection، HTTPS App Links قابل پیکربندی، اصلاح اسکرول/فرم؛ ثبت Backend CI با 44 suite/251 tests و Android CI با 120 tests و تفکیک صریح live acceptance از تنظیمات OAuth/SMTP/domain باقی‌مانده |
| 3.9 | 2026-11-15 | ثبت مسیر اجرایی شش‌مرحله‌ای مورد توافق تا انتشار؛ تعیین مرحله 2 پذیرش واقعی حساب به‌عنوان گام بعدی الزامی و تفکیک روشن تکمیل کدنویسی از پذیرش روی APK/سرویس‌های واقعی؛ همگام‌سازی خلاصه و داشبورد با R-029 |
| 4.0 | 2026-11-17 | ثبت ممیزی عمیق public 1v1، اصلاح retry بازیابی سرد پس از خطای شبکه، اثبات یکپارچه مسیر public queue تا اجرای 10 دور و تسویه exactly-once در PostgreSQL integration test، ثبت CI با 44 suite/255 test و Android 154/154؛ تأکید بر بازماندن پذیرش فیزیکی دو دستگاه و خاموش‌ماندن feature flags تا عبور از NEX-BE-011 |
| 4.1 | 2026-11-17 | بستن شکاف تست تبدیل مهمان در دور ACTIVE، اثبات بازیابی سؤال/مهلت و ثبت پاسخ توسط حساب جدید و حریف، رد دسترسی/ارسال پاسخ از هویت مهمان قدیمی، قفل و revalidation نشست دقیق برای جلوگیری از تبدیل پس از Logout، اصلاح تست race مبتنی بر SKIP LOCKED؛ Backend CI با 45 suite/259 test سبز؛ پذیرش فیزیکی دو دستگاه همچنان باز |
| 4.2 | 2026-11-19 | افزودن تست deterministic برای هر دو ترتیب Guest Logout/Conversion با PostgreSQL row lock؛ تأیید موفق CI run `44392913659` شامل unit/integration، migration، build، lint، Compose و Docker؛ تأیید اجرای regression tests مربوط به Conversion/Settlement؛ ثبت Android Keystore به‌صورت DEFERRED/OPEN/NOT VERIFIED و تعیین خروج موقت از چرخه هویت/نشست |\n| 4.3 | 2026-11-19 | مرور مسیر Localization و تقویت قراردادهای Question Generator و AI Judge برای زبان انتخابی؛ افزودن تست‌های adapter انگلیسی/فارسی؛ ثبت محدودیت فعلی matchmaking بر اساس زبان و بازگذاشتن تصمیم cross-language 1v1؛ اجرای CI هنوز pending است |
| 4.4 | 2026-11-19 | تصویب الزام انتشار با ۲۰ زبان کامل و فعال در APK؛ تصویب matchmaking مستقل از locale و تحویل سؤال معنایی مشترک با نمایش/داوری participant-specific؛ ثبت ADR-001 و ترتیب اجرایی اصلاح‌شده L10N-02A تا L10N-04؛ پیاده‌سازی و آزمون‌های اجرایی همچنان باز هستند |

---

**قاعده نهایی:** این سند مسیر و وضعیت را تعیین می‌کند؛ کد واقعی و آزمون‌های موفق در `main` تعیین می‌کنند چه چیزی واقعاً انجام شده است. هر تغییر در محدوده محصول یا معماری باید با تصمیم ثبت‌شده و نسخه جدید این سند همراه باشد.

### R-034 — Cross-locale 1v1 contract and localization release execution
- Date: 2026-11-19
- Approved product scope: all 20 target locales must be fully functional in the final Android APK; cross-locale public 1v1 is allowed, with each player seeing the same semantic question in their own selected language.
- Reviewed current implementation: matchmaking still validates only `en/fa`, uses `(category, language)` compatibility locks and SQL filters; `MatchService` creates one question-generation context using the first participant's language; `MatchParticipant` has no locale snapshot; Question already has a locale-keyed `localized` JSON field; answer submission uses stable option IDs for multiple choice.
- Corrected the localization audit's historical open-decision wording so it no longer conflicts with the approved cross-locale decision.
- Added `backend/docs/docs/NEX-BE-010-cross-locale-1v1-contract.md` defining immutable participant locale snapshots, category-only compatibility, one semantic question with locale-specific renderings, participant-specific reads, Judge locale context, migration/backfill, security and acceptance tests.
- This is contract/documentation progress only. No matchmaking, schema, question delivery or Judge runtime code was changed in this entry. No tests or CI are claimed.
- Next execution: L10N-02A/02B implementation, beginning with the 20-locale server registry and participant locale snapshot, then category-only queue pairing, generation/rendering and participant-specific question/Judge routing. Keep production matchmaking feature flags disabled until end-to-end gates pass.

### R-035 — 20-locale backend registry foundation
- Date: 2026-11-19
- Added the canonical backend target registry for all 20 approved locale IDs, including native/English names, Intl locale tags and text direction.
- RTL metadata explicitly covers Persian, Arabic and Urdu.
- Added registry tests for the exact 20-locale set, locale ID validation, enablement separation and RTL metadata.
- Matchmaking service and enqueue DTO now consume the centralized enabled-locale allowlist instead of duplicated hard-coded `en/fa` checks.
- Added a regression test proving a target locale such as Arabic remains rejected until its full UI/game-content pack is enabled. This is intentional release gating, not a missing selector option in the final APK.
- Current enabled backend locales remain `en` and `fa`; the 18 other target locales are registered but not yet enabled. No user-facing selector or cross-locale queue behavior has been activated.
- Tests have been added but not executed in this session; no CI result is claimed.
- Next: add immutable locale snapshots to MatchParticipant and queue/match creation, then implement category-only pairing and participant-specific localized question delivery/Judge routing.

## R-036 — Immutable participant locale snapshot and category-only 1v1 compatibility

**Date:** 2026-11-19  
**Status:** Implementation committed; automated execution and integration evidence pending.

- Added required `MatchParticipant.language` with a deterministic additive migration. Historical rows backfill from the user's preferred locale, then the associated matchmaking entry, then the first historical question locale, and finally English for legacy records with no recoverable source.
- Match creation now writes each human participant's locale snapshot. 1vAI derives the snapshot and initial question request locale from the same resolved participant locale.
- Public matchmaking now locks and searches by category only. Each queue entry retains its own locale and pairing passes both participant locales into match creation.
- Registered users' matchmaking locale is resolved from the trusted `User.preferredLanguage`; guest locale remains validated from the guest queue request.
- Replaced the queue compatibility index with a category/FIFO index that excludes locale.
- Added a cross-locale regression assertion for pairing an English queue entry with a Persian entrant, and a MatchService assertion for independent participant snapshots.
- **Not yet verified:** Prisma migration execution, Prisma Client generation, unit/integration test execution, cross-locale question generation and participant-specific delivery/Judge routing. Do not enable cross-locale production matchmaking until those gates pass.

## R-037 — Shared semantic question with participant-locale renderings

**Date:** 2026-11-19  
**Status:** Implementation and regression tests committed on `main`; CI and PostgreSQL execution evidence pending.

- Question generation context now derives the exact distinct locale set from immutable HUMAN `MatchParticipant.language` snapshots. It fails closed if any human participant lacks a locale.
- The generator contract now requests one semantic question and a rendering for every required locale. Each rendering contains a localized prompt, expected answer, option text keyed by stable option IDs, and localized grading rubric.
- The Responses schema and adapter reject duplicate/missing/extra locales, incomplete localized fields, and option-ID/order drift. Generator input is restricted to the registered 20 target locale IDs; production queue enablement remains governed separately by complete-pack gates.
- Question worker validates exact required-locale coverage before persisting the question.
- Match question delivery ignores caller-selected language and resolves the immutable participant locale snapshot. A missing participant rendering blocks delivery; no canonical-language fallback is exposed.
- Free-text Judge now receives the participant-locale prompt, expected answer and rubric from the persisted rendering. Canonical fallback is permitted only for historical same-canonical-locale questions; cross-locale judging fails closed when localized judge context is absent.
- Added regression coverage for exact multi-locale generator output, missing locale rejection, caller-locale override resistance, cross-locale shared question delivery, and Persian Judge routing.
- **Not yet verified:** TypeScript compilation, Prisma Client generation, backend unit/integration execution, database migration execution, and GitHub Actions result. No CI pass is claimed.


## R-038 — Centralized competitive matchmaking UI copy

**Date:** 2026-11-19  
**Status:** UI copy migration committed on `main`; automated verification pending.

- Added matching English/Persian `match` namespaces for competitive mode selection and matchmaking status copy.
- Migrated the 1v1 and 1vAI mode labels, competitive section heading, and matchmaking screen text from inline locale ternaries to the centralized dictionary.
- Corrected the public 1v1 player-facing description: matchmaking compatibility is category-only; selected language does not restrict opponent pairing.
- Added regression assertions for complete English/Persian match-copy keys and explicit locale-independent matchmaking wording.
- Corrected the 1vAI online status badge to use the centralized translation key.
- Changes are on `main`; no branch was created.
- **Not verified:** frontend test execution, Android build, and GitHub Actions. The commit status endpoint returned an empty status list and the workflow lookup returned no runs; this is unknown/unavailable evidence, not a passing CI result.
- The frontend still contains 74 direct `language === 'fa'` conditionals elsewhere in `App.jsx`. Localization is therefore not complete and APK acceptance remains blocked.
- Next bounded work: migrate the remaining active competitive match-state/error/result copy into a dedicated namespace, add coverage, and then assess remaining non-match screens before closing the UI localization audit.

## R-039 — هم‌ترازسازی رجیستری ۲۰ زبان در Frontend

**تاریخ:** 2026-11-19  
**وضعیت:** رجیستری هدف ۲۰ زبان در Frontend ثبت شد؛ فعال‌سازی زبان‌های ناقص عمداً مسدود است؛ اجرای تست و CI هنوز تأیید نشده است.

- رجیستری مرکزی Frontend اکنون تمام ۲۰ زبان مصوب V1 را با نام بومی، نام انگلیسی، تگ استاندارد Intl، جهت نوشتار و وضعیت فعال‌سازی نگه می‌دارد.
- فقط انگلیسی و فارسی فعال هستند؛ ۱۸ زبان دیگر تا تکمیل بستهٔ رابط، محتوای بازی، QA زبانی و آزمون‌های مربوطه در انتخاب‌گر قابل انتخاب نیستند.
- جهت RTL برای فارسی، عربی و اردو در metadata ثبت شد؛ سایر زبان‌ها LTR هستند.
- توابع مرکزی تشخیص زبان هدف، زبان فعال، بازیابی امن زبان و قالب‌بندی عدد/تاریخ بر پایهٔ Intl اضافه شدند.
- آزمون Frontend اکنون فهرست ۲۰ زبان را با رجیستری Backend تطبیق می‌دهد و برابری فهرست زبان‌های فعال در دو سمت را نیز کنترل می‌کند؛ این مانع فعال‌سازی ناخواسته یا ناسازگار یک زبان در فقط یکی از دو سمت می‌شود.
- رفتار قبلی انتخاب و ذخیرهٔ زبان انگلیسی/فارسی حفظ شده است؛ زبان ناقص به‌صورت خودکار به‌عنوان زبان پشتیبانی‌شده پذیرفته نمی‌شود.
- Commitها روی `main`: `9cb4633` (رجیستری Frontend)، `633355e` و `35fb54b` (آزمون‌های رجیستری و هم‌ترازی).
- **مدرک اجرایی:** وضعیت check برای آخرین commit در زمان بررسی خالی بود و ابزار مربوطه اجرای Workflow را برنگرداند؛ بنابراین نتیجهٔ تست/CI نامشخص است و PASS اعلام نمی‌شود.

**گام بعد:** ادامهٔ L10N-02C با مهاجرت متن‌های باقی‌ماندهٔ مسابقه و سپس سایر صفحات از شرط‌های مستقیم زبان به فرهنگ ترجمه؛ هم‌زمان، تکمیل بسته‌های ۲۰ زبان و قرارداد محتوای بازی طبق ترتیب مصوب.

## R-040 — انتقال متن‌های فعال Gameplay مسابقه به فرهنگ ترجمه

**تاریخ:** 2026-11-19  
**وضعیت:** مهاجرت UI مسابقه و تست‌های بازدارنده روی `main` ثبت شد؛ اجرای تست و CI برای commitهای این مرحله هنوز تأیید نشده است.

- متن‌های حالت‌های waiting-question، waiting-result، submitting، submission-error، synchronization error، handoff و round-summary به فرهنگ مرکزی `COPY.en.match` و `COPY.fa.match` منتقل شدند.
- متن‌های ارسال مجدد پاسخ، بررسی وضعیت سرور، همگام‌سازی، نوبت بازیکن، ورود پاسخ متنی، داوری AI، وضعیت مسابقه آنلاین/پیش‌نمایش محلی و پیام‌های نتیجه مسابقه نیز متمرکز شدند.
- متن پایان‌یافتن جست‌وجوی Matchmaking نیز از ternary در کد به کلید ترجمه منتقل شد.
- برای کلیدهای جدید انگلیسی و فارسی آزمون پوشش اضافه شد؛ آزمون جدید همچنین تضمین می‌کند بخش فعال UI مسابقه دوباره از شرط مستقیم `language === 'fa'` استفاده نکند.
- تعداد شرط‌های مستقیم فارسی در `App.jsx` از ۷۴ به ۴۱ رسید؛ در محدودهٔ UI مسابقه (`match-game`) و نتایج مسابقه (`match-results`) تعداد این شرط‌ها صفر است.
- Commitها روی `main`: `7400b30` (فرهنگ ترجمه)، `3e151f9` (مهاجرت UI)، `4c13fb7` (پوشش کلیدها)، `18f8224` و `9c745ed` (قفل رگرسیون برای جلوگیری از برگشت ternaryهای زبان)، `cc4edef` و `52380e6` (تکمیل حذف شرط مستقیم در نتایج مسابقه و آزمون آن).
- **محدودیت باقی‌مانده:** پیام‌های خام خطای دریافتی از Backend ممکن است همچنان انگلیسی باشند؛ نگاشت امن خطاهای API به کدهای قابل ترجمه در مرحلهٔ جداگانه بررسی می‌شود. این تغییر متن‌های محتوای سؤال/گزینه‌ها را ترجمه نمی‌کند و بسته‌های ۲۰ زبان هنوز کامل نیستند.
- **مدرک اجرایی:** در زمان بررسی، combined status برای آخرین commit فهرست خالی داشت؛ این به معنی PASS نیست. تست Frontend و Android CI باید روی commit نهایی اجرا و نتیجهٔ واقعی ثبت شود.

**گام بعد:** انتقال متن‌های فعال رتبه‌بندی و پروفایل به فرهنگ ترجمه و سپس بررسی Settings، خطاهای API و متن‌های باقی‌مانده؛ بعد از مهاجرت UI، تکمیل بسته‌های محتوایی و QA هر ۲۰ زبان ادامه می‌یابد.
## R-041 — Localization end-to-end audit and evidence reconciliation

**Date:** 2026-11-19  
**Status:** Audit completed; Localization remains OPEN. No APK/release acceptance is claimed.

- Re-read the current main source rather than relying on the historical R-034/R-040 estimates.
- Confirmed the 20-locale target registry exists in both frontend and backend, but only en and fa are enabled. The other 18 locales are not complete packs and must not be exposed as working languages yet.
- Confirmed app/src/i18n.js contains only English and Persian UI dictionaries. The local question catalogue has English source questions and a Persian question pack; getQuestionCopy returns the original question for every other locale. Therefore AI/static game-content localization is not a complete 20-locale capability.
- Current source count: app/src/App.jsx still contains 41 direct language === 'fa' checks. app/src/components/AccountSessionPanel.jsx still contains a direct locale branch and 103 isFa references, so account/session UI is not yet centralized in the shared translation contract. Store catalog content also remains embedded as English/Persian pairs.
- Confirmed the cross-locale backend implementation is materially further along than the earlier R-034 baseline: participant locale snapshots, category-only queue pairing, required-locale generation context, strict generated rendering coverage, participant-specific question reads and participant-locale Judge routing are present in source.
- Backend evidence: GitHub Actions Backend CI run [44484969772](https://github.com/iniya-studio/App-Nexira-/actions/runs/44484969772), commit cf290444ec01eb7b0f60b99b214086fa5a858e67, completed success; 48/48 suites and 287/287 tests passed. Prisma format/validate/generate, PostgreSQL migrations, Nest production build, ESLint and staging Docker/Compose checks also passed. A commit comparison confirms the backend source files were unchanged between that verified commit and current localization APK commit e946fa5a25893627836f964084ec1ffd9ecdf804. This verifies the implemented backend baseline, not 20-locale production readiness or live two-device acceptance.
- Frontend/Android evidence: Android workflow run [44558816795](https://github.com/iniya-studio/App-Nexira-/actions/runs/44558816795), commit e946fa5a25893627836f964084ec1ffd9ecdf804, completed success; frontend suite 167/167 passed and a debug APK artifact was uploaded. This is a build/test result only; it does not close Localization.
- No new APK should be built as a Localization milestone until the 20 complete UI packs, 20 game-content packs, full locale propagation, API error mapping, RTL/LTR behavior, QA and release gates are actually complete.
- Remaining implementation scope: finish all UI surfaces and remove two-language assumptions; complete all 20 static UI dictionaries and game-content/localized question support; enable all 20 locales consistently in frontend/backend only after pack validation; complete language QA and cross-locale integration/device acceptance.
- Next execution: continue L10N-02C with complete migration of remaining account/session, ranking/profile, store, settings, dialogs and accessibility copy into a locale-neutral translation contract. Do not close a sub-area merely because its tests pass; all visible copy and behavior for the complete 20-locale release scope remain in the same open Localization workstream.
## R-042 — Ranking UI locale migration

**Date:** 2026-11-19  
**Status:** Code and regression guard committed on main; CI evidence pending.

- Added a dedicated ranking translation namespace to the English and Persian dictionaries, covering screen description, scope tabs, leaderboard headings, loading/error/retry states, guest eligibility, empty states, position, points, wins/losses and ranking policy copy.
- Migrated the Ranking screen in app/src/App.jsx from inline English/Persian ternaries to the shared translation namespace.
- Added translation-key coverage and a source-level regression assertion that prevents direct language === 'fa' branches from returning to the Ranking screen.
- Commits: 70b80e866dbc925d0c8c4d25d6b8b096d0417f0d (dictionary), 66de80b620e53edb4232afa1bbc9453bb8bfe98b (screen migration), f4ac2b788e58976d09a1ee94c19b1cc73dbbb754 (tests).
- This closes only the Ranking screen's English/Persian copy-centralization slice. It does not complete Profile, Account/Session, Store, Settings, API error mapping, the remaining inline locale branches, or any of the 18 missing locale packs. Localization remains OPEN and the 20-locale release requirement is unchanged.
- GitHub Actions runs 44562048724 and 44562085308 were triggered for the first two commits; their final results must be checked before claiming this slice verified. The test commit also requires its own workflow evidence.
- Next implementation: migrate Profile and the remaining account/session UI into the same locale-neutral contract, then Store/Settings/dialog/accessibility surfaces. After the entire UI surface is centralized, populate and QA all 20 static UI packs and game-content packs; do not enable incomplete locales.


## R-043 — مدرک CI مهاجرت Ranking و تعیین گام Account/Profile

**تاریخ:** 2026-11-19  
**وضعیت:** شواهد CI مرحله Ranking ثبت شد؛ Localization همچنان OPEN است.

- سه اجرای متوالی Workflow مربوط به تغییرات Ranking بررسی شدند:
  - Run [44562048724](https://github.com/iniya-studio/App-Nexira-/actions/runs/44562048724)، commit `70b80e8`: موفق؛ 167/167 تست، صفر شکست.
  - Run [44562085308](https://github.com/iniya-studio/App-Nexira-/actions/runs/44562085308)، commit `66de80b`: موفق؛ 167/167 تست، صفر شکست.
  - Run [44562111785](https://github.com/iniya-studio/App-Nexira-/actions/runs/44562111785)، commit `f4ac2b7`: موفق؛ 168/168 تست، صفر شکست و artifact آپلودشده.
- در هر سه اجرا Job ساخت و اعتبارسنجی Android debug APK با تمام مراحل موفق پایان یافت؛ این صرفاً مدرک صحت build/test همان commitهاست و به معنی تکمیل Localization یا پذیرش APK نیست.
- پس از آخرین اجرای کد، فقط commit مستنداتی `d40eae6` ثبت شده است؛ بنابراین کد Ranking تأییدشده همان کد جاری است.
- هشدار غیرمسدودکنندهٔ GitHub Actions درباره انتقال runnerهای مبتنی بر Node.js 20 به Node.js 24 به‌عنوان بدهی فنی ثبت می‌شود؛ در این مرحله علت شکست یا مانع اجرا نیست.
- مهاجرت Ranking فقط برای دو فرهنگ فعال فعلی (en/fa) انجام شده است. پوشش ۲۰ زبان، کل سایر صفحات، محتوای بازی، API error mapping، RTL/LTR و پذیرش نهایی همچنان باز هستند.
- ممیزی مجدد AccountSessionPanel نشان می‌دهد این مؤلفه هنوز متن‌های دو‌زبانهٔ inline و وابستگی مستقیم به `isFa` دارد؛ بنابراین گام بعدی، استخراج کامل پیام‌ها/labelها/statusها و تاریخ‌نمایی Account/Session به قرارداد ترجمهٔ مرکزی است. این کار باید همراه تست رندر هر دو زبان و guard ضد بازگشت شرط‌های locale انجام شود.
- هیچ زبان جدیدی فعال نشده و هیچ APK به‌عنوان milestone انتشار Localization اعلام نمی‌شود.

**گام بعد:** L10N-02C — مهاجرت کامل Account/Session و سپس Profile UI؛ پس از آن Store، Settings، Dialogها، خطاهای API و accessibility. بسته‌های کامل ۲۰ زبان و QA محتوای بازی همچنان جزء معیار بستن کل Localization هستند.


## R-044 — Account/Session + Profile localization: source and CI reconciliation

**Date:** 2026-11-19  
**Status:** Account/Session and Profile English/Persian code slices are present on main; CI verified for latest test commit. Overall Localization remains OPEN.

- Re-read current main source and confirmed the latest localization commits:
  - `02c574e0`: profile/account status translation namespace.
  - `f0d523b7`: Profile status/retry/server-record UI migration.
  - `6fb17176`: Profile locale parity regression test.
- Latest workflow run [44565157179](https://github.com/iniya-studio/App-Nexira-/actions/runs/44565157179), commit `6fb17176f7fddb81ba2d21624e1c1fedd417e1f1`, completed successfully. The immediately preceding run [44565146080](https://github.com/iniya-studio/App-Nexira-/actions/runs/44565146080), commit `f0d523b7154319417e371ca5ed87ca53c1c87ccf`, also completed successfully.
- Historical failed runs [44564718597](https://github.com/iniya-studio/App-Nexira-/actions/runs/44564718597), [44564762957](https://github.com/iniya-studio/App-Nexira-/actions/runs/44564762957) and [44564796241](https://github.com/iniya-studio/App-Nexira-/actions/runs/44564796241) were traced to test invocation of `getLocalizedAccountError` before it was exported/available from the component module. Current `AccountSessionPanel.jsx` exports the helper and the current test imports it through Vite SSR; the latest workflow passes the account error mapping test.
- Run [44565135953](https://github.com/iniya-studio/App-Nexira-/actions/runs/44565135953), commit `02c574e0`, passed frontend/match-engine tests (including the account API error mapping test) but Android packaging failed because Gradle could not resolve `com.google.errorprone:error_prone_annotations:2.3.1` from Google Maven or Maven Central. This is an external dependency-resolution/build failure, not evidence of a localization test regression. The next commit's Android build passed.
- Current source confirms `AccountSessionPanel.jsx` has zero direct `isFa` / `language === 'fa'` branches. The panel tests cover English/Persian rendering, safe API error mapping and localized session status labels. The translation test suite checks English/Persian dictionary parity and account/profile namespace coverage.
- Current `App.jsx` still has 13 direct `language === 'fa'` branches: Store category/item labels and descriptions, Settings language display, bottom navigation Store label, and exit-confirmation copy/actions. These remain open implementation work.
- Current `i18n.js` already has English/Persian `store` screen copy, but the six catalog entries and five Store tab labels remain embedded as inline `en/fa` pairs in `App.jsx`; they must move into the central translation contract with parity and regression tests.
- The latest source SHAs reviewed: `i18n.js` 71449df5ff7831e21ddab44dddfaadf94e417ce6; `App.jsx` 7f2962d669ca7948e8682ec2f09f1c23c3964e3d; `i18n.test.js` a2c37bada9eadf19af310e9621e88d20448a4182; `AccountSessionPanel.jsx` 4e25c083586910f7138d204713700b3baf4407e0; `AccountSessionPanel.test.js` 00af4e3707902edebacb014e088e904f406a3248.
- No new locale has been enabled. The 18 incomplete target locales, complete 20-locale UI and game-content packs, RTL/LTR acceptance, accessibility, API/error coverage and cross-locale device acceptance remain open. No APK/release acceptance is claimed.

**Next implementation:** migrate the complete Store catalog and tab labels into the translation dictionaries, remove the Store locale ternaries, add parity/content/source-regression tests, then migrate Settings language names, bottom navigation and exit-confirmation copy. Keep Localization OPEN until all 20 locale packs and end-to-end acceptance criteria are satisfied.


### R-044 scope addition — server errors and session-state localization (mandatory)

This is an explicit required part of the current Account/Session localization phase, not optional follow-up work:

- Audit every server/API error path reaching user-visible UI, including raw response bodies, backend `message` / `error` fields, nested causes, unknown error codes, network failures, timeouts, aborted requests, authorization failures, conflicts, validation errors, rate limits, and 5xx responses.
- Never render raw server text, stack traces, internal exception names, request diagnostics, or untrusted backend messages directly to users. Convert known machine-readable error codes/statuses into locale dictionary keys; use a safe localized generic fallback for unknown or malformed payloads.
- Localize every user-visible session state and transition, including loading/initializing, authenticated/active, guest, expired, revoked, superseded/replaced, reconnecting/recovery, conversion/recovery-window expiry, unauthorized, unavailable, and unknown states wherever applicable in the actual session lifecycle.
- Audit session banners, account panels, retry/reconnect actions, expiry/revocation notices, account conversion outcomes, session lists/status badges, dialogs, accessibility labels, and notifications/toasts—not only the Account/Session form.
- Preserve diagnostic detail only in controlled developer/server logs; do not expose secrets, tokens, raw payloads, or sensitive session identifiers in UI or logs.
- Add tests for English/Persian parity, every mapped error and session state, unknown/malformed backend payload fallback, absence of raw server-message rendering, interpolation safety, and all user-visible lifecycle paths. Extend the same contract to all 20 target locales before release.
- Verify server/API error mapping and session-state localization with integration/regression tests and device acceptance, including expired/revoked sessions and network/server failure scenarios.

**Acceptance gate:** Account/Session localization cannot be marked complete until both ordinary UI copy and server-originated errors/session states are localized, safe-fallback behavior is proven, and tests cover the relevant lifecycle paths. Current implementation of `getLocalizedAccountError` is a starting point only; it does not by itself prove exhaustive coverage.


## R-045 — Shared API error localization and session-state safeguards (in progress)

**Date:** 2026-11-19  
**Status:** Partial implementation committed; frontend test step passed on latest run; full workflow still running at the time of this entry. Account/Session localization and overall Localization remain OPEN.

### Source audit findings
- `httpClient.js` converts non-2xx responses into `ApiError` and retains backend `message` / payload details. These values are diagnostic inputs and must not be rendered directly.
- `AccountSessionPanel.jsx` already mapped account-operation errors to localized copy, but its mapping was component-local and did not cover the rest of the app.
- `App.jsx` had direct user-visible paths for match synchronization/submission and matchmaking failures that stored/rendered `error.message`. This was a real raw-server-message exposure.
- Progression/ranking failure UI already uses a fixed localized fallback (`text.ranking.loadError`), rather than rendering the raw error.
- Lifecycle `state.error` may still retain internal diagnostic text, but no direct `sessionState.error` render was found in `App.jsx`; AccountSessionPanel uses safe localized connection/account-data copy. Retaining diagnostic state internally is not proof of complete coverage across all screens and must remain under audit.

### Implemented changes
- Added shared `getLocalizedApiError(error, copy)` in `app/src/i18n.js`. It maps network, aborted request, superseded session, expired conversion recovery, HTTP 400/401/403/409/422/429/5xx, and unknown/malformed errors to safe localized English/Persian copy. Raw `message` and payload text are never used as display output.
- `AccountSessionPanel.jsx` now delegates its exported account error mapper to the shared helper.
- `App.jsx` now routes match, matchmaking, submission, retry and synchronization error UI through the shared mapper. Progression/ranking keeps its existing localized generic fallback. Direct `error.message` reads in App's UI error handlers were removed.
- Added regression tests for both active locales, known codes/statuses, unknown codes, untrusted raw messages, malformed/null errors, session lifecycle labels and UI guards against direct raw error rendering.

### Commits and CI evidence
- Shared mapper: `86bd5c4ea38406998f7dd4a5f7e607675deeb122`.
- Account component integration: `8774878eafd4bbfe8c28797a36accbfdc855b35b`; workflow [44588493129](https://github.com/iniya-studio/App-Nexira-/actions/runs/44588493129) succeeded.
- App error-display integration: `098ca06dee0421689b068e62069d728991167d13`; workflow [44588555446](https://github.com/iniya-studio/App-Nexira-/actions/runs/44588555446) succeeded.
- Initial regression-test commit `d1dc3e095d959e082473fb04d332112e59629205` failed because its assertion expected the progression error to use the API mapper, although the actual UI intentionally displays the existing localized ranking fallback. This was a test expectation defect, not a product-code failure.
- Session-state test commit `423a3c1406cde5bb8c08c0ec6ffa95907740cd13` inherited that same stale assertion and failed for the same reason.
- Corrected test commit: `a35cec4978a585c06babf2402679072f650e6f07`. Its workflow [44588798299](https://github.com/iniya-studio/App-Nexira-/actions/runs/44588798299) had completed the **frontend and match-engine test step successfully**; Android build/verification was still in progress when this entry was written. Do not claim the entire workflow passed until its final conclusion is checked.

### Remaining acceptance work
- Inspect every remaining frontend screen/component for raw `Error.message`, backend `message`, API payload, machine error code, and session lifecycle error rendering; include matchmaking, ranking, progression, account recovery, email verification, session revocation, and accessibility/notification surfaces.
- Review `onlineMatchAdapter` and other adapters to decide whether raw server messages should be removed from view state entirely (not merely safely mapped at render time).
- Expand session-state tests to cover actual lifecycle transitions and user-visible UI for idle, initializing/retrying, guest, authenticated, offline, error, unsupported, signed-out, revoked/expired and unknown states where applicable.
- Audit Backend error contracts and stable error codes/statuses; ensure no sensitive diagnostics or tokens enter client-facing error messages.
- Repeat the same localized-safe-fallback contract for all 20 target locales, plus integration and device acceptance.
- Keep Localization OPEN; this change is a bounded safety/localization improvement, not completion or release acceptance.

## R-046 — Online match error-state hardening (in progress)

**Date:** 2026-11-19  
**Status:** Online match adapter no longer places raw exception messages in its public view-state error field. Regression tests and localized UI guards are committed. The latest frontend/match-engine test step passed; complete workflow verification is still pending. Localization remains OPEN.

### Findings and changes
- app/src/game/onlineMatchAdapter.js previously copied Error.message into view.error for answer-submission and synchronization failures. This exposed untrusted backend/network text to every consumer of the adapter view.
- The adapter now stores only { code, status } descriptors for submission and synchronization failures. Question-generation failure and backend-cancelled match states are also represented by machine-readable codes; no raw server text is copied into the view model.
- app/src/i18n.js maps question-generation failure and cancelled-match codes to safe localized server-error copy.
- app/src/App.jsx had one additional match-startup branch that rendered matchError directly. It now routes the error through the shared localized mapper.
- Added adapter regression coverage proving raw diagnostic text is absent from view state, and i18n coverage for the new match error codes and startup fallback.
- Re-audit of the adapter source found no remaining error.message reads or raw message assignment in the view-state error path.

### Commits and CI evidence
- Adapter hardening: a75af52108611d430fff55e1aace55ed0381960c
- Localized match error mapping: fdc887801f3d95e81e3e2855881f80eed6111847
- Match startup UI fallback: 9d050730cc7be0d19b3238c29f0a684f5655f8af
- Adapter regression tests: 6412c10b83706b72a3042be268d285394d0992dd
- i18n regression tests: ba8c91b17fb0dec268331c280ae8894cee019c5a
- Workflow runs: [44589855627](https://github.com/iniya-studio/App-Nexira-/actions/runs/44589855627), [44589865623](https://github.com/iniya-studio/App-Nexira-/actions/runs/44589865623), [44589876230](https://github.com/iniya-studio/App-Nexira-/actions/runs/44589876230), [44589909941](https://github.com/iniya-studio/App-Nexira-/actions/runs/44589909941), [44589919021](https://github.com/iniya-studio/App-Nexira-/actions/runs/44589919021). At the time of this entry, the latest run's frontend/match-engine test step was successful; Android packaging/verification had not yet completed. Do not treat this as full workflow acceptance.

### Remaining work
- Audit sessionLifecycle.js: its internal state still retains raw exception messages in error and accountDataError; although current App JSX does not render those fields directly, migrate these state fields to safe descriptors or prove a strict internal-only boundary with tests.
- Audit all frontend error state and API adapters, including progression, account recovery, email verification, session revocation, and notification/accessibility surfaces.
- Backend has no dedicated global exception filter in the current source tree. Audit NestJS default exception serialization and endpoint exception contracts; establish stable machine-readable error codes and ensure diagnostics never enter public API responses.
- Extend integration tests for actual session transitions, expired/revoked sessions, abort/network/timeout and malformed API payloads.
- Maintain parity across all 20 target locales and complete UI/game content, RTL, and real-device acceptance.

**Acceptance:** This is a bounded hardening change only. Account/Session localization and overall Localization remain OPEN.
## R-047 — Session lifecycle error-state containment (in progress)

**Date:** 2026-11-19  
**Status:** Session lifecycle state now stores machine-readable error descriptors instead of raw exception messages. The latest frontend/match-engine test step passed on run 44590326009; full Android workflow is still running. Account/Session localization and overall Localization remain OPEN.

### Changes
- Added toSessionErrorDescriptor in app/src/api/sessionLifecycle.js and migrated initialization, account actions, guest-conversion recovery expiry, profile/account-data, email-verification, logout-all and sign-out state errors to { code, status } descriptors.
- Session invalidation now records SESSION_EXPIRED rather than a display sentence; the shared localization mapper resolves SESSION_EXPIRED and SESSION_REVOKED to the localized session-expired copy.
- AccountSessionPanel uses accountDataError as a presence flag and a fixed localized message; no raw descriptor is rendered.
- Updated lifecycle and localization regression tests to verify descriptor shape, safe mapping, and absence of raw Error.message assignments.
- Source re-audit of sessionLifecycle.js found no remaining error.message reads used for lifecycle state.

### Commits and CI evidence
- Lifecycle descriptor migration: c9bd93b92f0b5130c1210e68374cc06296c0b7ec
- Session expiry localization: c339cde3458fede3a69851f753fc52824e0ea7d6
- Lifecycle regression expectation: 761f8da71fb0dec268331c280ae8894cee019c5a
- Remaining raw-assignment removal: dd2f002c84f074ef3195716d87903c5ba19368da
- Effective raw-state guard and session error mapping tests: 01aa3924541f583709bf27f8e16ea5b7c6b50437 and dc8cd5744ca8427cb9c10d7745dc7aeabdae598c
- Runs 44590139140 and 44590151454 failed because they executed before the updated lifecycle assertion commit and still expected the former string-valued state.error. The expectation was updated to the descriptor shape in 761f8da; its frontend/match-engine test step subsequently passed. Run [44590326009](https://github.com/iniya-studio/App-Nexira-/actions/runs/44590326009) includes the final strengthened raw-error guard and its frontend/match-engine test step has passed; Android packaging/verification is pending.

### Remaining acceptance work
- Complete the final workflow and verify the latest main HEAD has successful CI evidence.
- Audit every frontend adapter and all account recovery, email verification, session revocation, notification/accessibility and remaining API error paths.
- Define and test stable backend error codes/statuses. The current backend source tree has no dedicated global exception filter; NestJS default exception serialization and all thrown HttpException messages still require a contract/security audit.
- Add integration coverage for actual expired/revoked session transitions, abort/network/timeout, malformed payloads and cross-locale error presentation.
- Maintain full coverage across all 20 target locales and complete UI/game content, RTL and real-device acceptance.

**Acceptance:** R-046/R-047 are bounded hardening steps, not completion. Localization remains OPEN.
## R-048 — Standardized backend HTTP error envelope (in progress)

**Date:** 2026-11-19  
**Status:** A global HTTP exception filter is registered on main. It emits stable status-based error codes and safe generic messages, strips exception/validation payload details, and leaves non-HTTP transports to their own exception handling. Backend build and full unit/PostgreSQL integration tests passed on run 44591425417; ESLint found an unused-import issue in the new WebSocket passthrough test, which was corrected in 079b9ce. The corrected run 44591740939 is still running at the time of this entry.

### Contract introduced
- HTTP error envelope: statusCode, code, message, timestamp.
- Stable mappings: 400/422 INVALID_REQUEST; 401 UNAUTHENTICATED; 403 FORBIDDEN; 404 NOT_FOUND; 409 CONFLICT; 429 RATE_LIMITED; 413 PAYLOAD_TOO_LARGE; 415 UNSUPPORTED_MEDIA_TYPE; other 5xx INTERNAL_SERVER_ERROR; remaining statuses REQUEST_FAILED.
- Response messages are safe generic copy. The filter never serializes HttpException response bodies, validation arrays, raw Error.message, stack traces, secrets, or database diagnostics.
- The filter is registered globally for HTTP requests only. Non-HTTP contexts return their exception through an RxJS error observable so WebSocket/RPC handlers retain transport-specific behavior.
- Added tests for status/code mappings, unknown exception normalization, validation/custom exception payload suppression, and non-HTTP passthrough.

### Commits and CI evidence
- Filter: c4c7bab522570321bffabda91a1e1f7367338b78
- Filter tests: 5803cb09a40fe7bf187eb2760b944f32c4a3b56b
- Global registration: 445f992ba11835b8fd2efbb19bfcfb8630174d7f
- Non-HTTP passthrough: 9b73332c2a3f3f01da02f00536c16871f593bc2d
- HTTP context test setup: ec100e6d9b878271adcef600a7ab9be4bc3756e6
- WebSocket passthrough test and typed cases: 5dcbea674c363d6e9f3f9226fcaf29223f498a5e, adac4a0593472171e492fbc4424d7c16585d750e, b9de5fb1e0fad1c6cc64d2046c198477ef54e07b, 079b9ce191db665dfe3b989ce2533dff09fdb04f
- Run 44591425417: Prisma formatting, schema validation, Prisma Client generation, database migrations, NestJS production build and all unit/PostgreSQL integration tests passed. ESLint failed only because the initial WebSocket passthrough test imports were not yet used; that test was then added.
- Run 44591740939 includes the corrected test and is pending at the time of this entry. Full backend CI acceptance is not yet claimed.

### Remaining work
- Verify corrected full backend CI, including ESLint, staging Compose validation and staging image build.
- Document this API envelope in the backend API contract docs and confirm every client path maps stable codes/statuses without displaying server message text.
- Refine generic status-level codes into endpoint/domain-specific stable codes where client behavior needs a distinction (e.g. expired/revoked session, invalid credentials, duplicate identity, match state conflict); preserve the generic safe fallback.
- Audit WebSocket gateway/guard error acknowledgements and client event handling separately; HTTP filter does not define WebSocket error payloads.
- Add HTTP integration tests against the real Nest application to prove the global filter is active for ValidationPipe, guards, controllers, and unexpected 500 errors.
- Keep Localization and Account/Session localization OPEN until all 20 locales, user-visible states, and device acceptance are complete.

**Acceptance:** This is the first shared HTTP error-envelope layer, not the final backend error-contract closure. Localization remains OPEN.
## R-048 — Global HTTP error response contract (in progress)

**Date:** 2026-11-19  
**Status:** A global HTTP exception response contract is implemented and documented. The latest backend CI run for the current implementation/docs HEAD is pending; do not treat this step as accepted until the run completes successfully and the final HEAD is verified.

### Audit findings
- Backend REST services/controllers use NestJS HTTP exceptions across auth, session, guest conversion, account/profile, match/round/answer, matchmaking and companion flows. Many exceptions carry free-form messages; these must remain internal and must not become the client contract.
- The frontend ApiError already retains HTTP status and response code, and getLocalizedApiError selects safe localized copy from code/status rather than rendering backend message text. The client HTTP contract tests verify status/code preservation.
- Two existing domain codes were already being thrown in guest conversion: CONVERSION_RECOVERY_EXPIRED (410) and CONVERSION_NOT_COMMITTED (409). A status-only filter would have erased the recovery code and broken the existing localized recovery behavior.
- NestJS documentation confirms global filters registered with app.useGlobalFilters do not apply to WebSocket gateways; gateway-specific exception behavior remains separate. REST changes must not add a gateway-scoped filter.

### Implemented
- Added ApiExceptionFilter and registered it globally for HTTP in backend/src/main.ts.
- Public error response is limited to statusCode, stable code, generic message and timestamp. Validation arrays, custom response bodies, exception messages, stack traces and database/request diagnostics are excluded.
- Added generic status mappings: INVALID_REQUEST, UNAUTHENTICATED, FORBIDDEN, NOT_FOUND, CONFLICT, RESOURCE_EXPIRED, RATE_LIMITED, PAYLOAD_TOO_LARGE, UNSUPPORTED_MEDIA_TYPE, REQUEST_FAILED and INTERNAL_SERVER_ERROR.
- Added a strict status-bound allowlist for CONVERSION_RECOVERY_EXPIRED (410) and CONVERSION_NOT_COMMITTED (409); arbitrary codes supplied in custom exception bodies are ignored.
- Unexpected non-HttpException failures are logged server-side while the response remains generic.
- Added tests for standard status mappings, unknown exceptions, validation/custom-body suppression, domain-code allowlisting and rejection of arbitrary codes.
- Added frontend mappings and tests for the preserved guest-conversion domain codes.
- Documented the response contract and WebSocket boundary in backend/README.md.

### Commits and CI evidence
- Global HTTP filter: 5e0f54ec50edaa226652ca2e6a2bbcb3935b5386 (followed by HTTP-only cleanup in the commits below)
- Domain-code allowlist and filter tests: 43750e7608b873cbf9c556c623039a924187cb94; 64fe009fd0fc8e2bb9b4eb62ec6c3d8d9bc7d2e4
- Frontend domain-code mappings/tests: a538aee3deef23497babc02b72895ddb0c6b09f3; 2695f04f6eb7436f19c11fc99915ba9ce928559a
- HTTP-only filter cleanup and test cleanup: de2b5aa407339d7d30a931ca270af1d2ea72842e; a8488a29d50530cee94be472adece8c15c36f88d
- API contract documentation: 1303cc14a1897564a2c265ab8a233d6ef3fc8e8b
- Prior workflow 44591740939 completed successfully for the initial HTTP filter, Nest build, unit/PostgreSQL integration tests, lint, Compose validation and staging backend image build. A later Lint failure in run 44591425417 was caused by unused imports in the not-yet-completed WebSocket test; the follow-up run 44591740939 passed after the test was corrected.
- Latest workflow [44593903976](https://github.com/iniya-studio/App-Nexira-/actions/runs/44593903976) is running against the current HEAD and must be checked before acceptance.

### Remaining work
- Verify the current CI run to completion, including Nest production build, unit/PostgreSQL integration tests, ESLint, staging Compose validation and backend image build.
- Add real HTTP-level integration coverage proving main.ts global registration produces the exact public response schema, not only direct filter unit tests.
- Continue replacing high-value domain failures with explicit stable codes where the UI needs distinct localized behavior; every new code requires status-bound allowlisting plus backend/frontend tests.
- Audit all remaining frontend consumers for direct error.message/raw payload rendering, including session recovery, email verification, session revocation, notifications and accessibility.
- Expand tests for malformed/non-JSON error payloads and 5xx/unknown status handling.
- Keep WebSocket authentication, matchmaking events and gateway-specific error payloads on their separate transport contract.

**Acceptance:** This is a backend contract foundation, not completion of Account/Session or Localization. The full 20-locale rollout and end-to-end/device acceptance remain OPEN.
### R-048 follow-up — HTTP integration coverage and CI status
- Added backend/src/common/http/api-exception.filter.integration.spec.ts. It boots a real Nest HTTP application on an ephemeral local port and verifies the actual response schema, suppression of validation/custom internal fields, and preservation of CONVERSION_RECOVERY_EXPIRED over HTTP.
- Integration-test commit: 72c83764bc6f2d9d6bcb361c92f85ee8928c8f97.
- Workflow 44593903976 was superseded/cancelled before dependency installation completed; it is not evidence of a pass or failure.
- Workflow [44594072191](https://github.com/iniya-studio/App-Nexira-/actions/runs/44594072191) completed with conclusion **success** for code commit 72c83764bc6f2d9d6bcb361c92f85ee8928c8f97.
- Verified successful steps: dependency installation, Prisma formatting/schema validation/client generation, CI PostgreSQL migrations, NestJS production build, unit and PostgreSQL integration tests, ESLint, staging Compose validation, staging backend image build, and cleanup/post steps.
- The verified main HEAD immediately before this Roadmap update was 75298176b05a3fdb6e501b40e73dc9257f89eb90. Its only change after the tested code SHA was the Roadmap documentation update; no application/backend source code changed after the tested SHA.

**Current acceptance state:** The R-048 HTTP error-envelope implementation and real HTTP integration coverage have successful full CI evidence. R-048 remains open for the separately listed domain-code refinement and frontend raw-error consumer audit. Account/Session and full 20-locale Localization acceptance remain OPEN.

## R-049 — Frontend error-boundary hardening and AI recovery-code sanitization (in progress)

**Date:** 2026-11-19

### Audit findings
- The current frontend UI error surfaces were re-audited: AccountSessionPanel uses the shared localized mapper; App match/matchmaking errors use `getLocalizedApiError`; progression/ranking renders a fixed localized fallback; session lifecycle stores machine-readable `{ code, status }` descriptors. No direct UI rendering of backend `error.message` or response payload text was found in these paths.
- `app/src/api/httpClient.js` previously copied the server-provided `message` and full error payload into `ApiError.message/details`. Although current UI mapping ignored those fields, retaining untrusted server text in a client-facing error object created an avoidable future exposure risk.
- `AiOpponentAnswerWorker` previously persisted `error.message.slice(0, 64)` as `AiAnswerJob.lastErrorCode`. The recovery endpoint returns that field to the client, so an arbitrary provider/adapter error message could cross the API boundary as a purported machine code.

### Implemented
- HTTP client now retains only response status and code for non-2xx responses; it assigns a fixed local error message and does not retain the server payload in `ApiError.details`.
- Updated HTTP client regression coverage with hostile message, stack and token-like diagnostic fields; asserts only stable status/code survive and the raw values do not enter the error object.
- AI opponent answer worker now accepts only an explicit allowlist of provider error codes, maps provider HTTP statuses to the stable `AI_OPPONENT_PROVIDER_HTTP_ERROR`, and maps arbitrary/unknown errors to `AI_ANSWER_INTERNAL_ERROR`.
- Extended PostgreSQL integration coverage to prove a mocked raw provider message is not persisted as `lastErrorCode`.
- The broader scan found no other direct frontend rendering of raw backend message/payload values. Backend worker logs that use exception messages remain server-side diagnostics and are not API response fields.

### Commits
- HTTP error payload minimization: 4a0740f4eeb5d1ae9793505062997eb174061fbf
- HTTP client regression test: 412479ca2c38f72f2a7b3f44c1e74d610eeb2293
- AI opponent error-code allowlist: 1290a8cc1d01ed535d79d7788792745f8a0b6328
- AI opponent recovery-code integration test: d5c4a7861ee71a9c647adaadab061e30649a8b75
- Provider HTTP status matcher correction: dbdc35b77008d5e5032562e7ca7e0f9dec4548ae

### CI evidence
- Android workflow [44596362607](https://github.com/iniya-studio/App-Nexira-/actions/runs/44596362607) completed successfully for frontend error-boundary changes at commit 412479ca2c38f72f2a7b3f44c1e74d610eeb2293; frontend and match-engine tests passed.
- Backend workflow [44596841554](https://github.com/iniya-studio/App-Nexira-/actions/runs/44596841554) completed with conclusion **success** against backend commit dbdc35b77008d5e5032562e7ca7e0f9dec4548ae. All steps passed: dependency install, Prisma formatting/schema validation/client generation, CI PostgreSQL migrations, NestJS production build, unit and PostgreSQL integration tests, ESLint, staging Compose validation, staging backend image build, and cleanup.

**Acceptance:** Frontend transport hardening and AI recovery-code sanitization have successful full CI evidence (Android workflow for frontend changes and full Backend CI for backend changes). This closes the CI gate for these changes, not the wider error-contract audit. Continue auditing endpoint-specific codes only where client behavior materially differs; do not create one code per free-form exception message. Localization and full 20-locale acceptance remain OPEN.

## R-050 — Context-neutral API error copy and domain-code classification (in progress)

**Date:** 2026-11-19

### Audit finding
- The shared `getLocalizedApiError` mapper is used by both AccountSessionPanel and gameplay/matchmaking surfaces in `App.jsx`.
- It receives `text.account` at both call sites. Several shared fallback strings were account-specific (for example, conflict referred to existing account information, invalid input referred to account details, and generic failure referred to an account request). This made valid gameplay/matchmaking errors display misleading account-oriented wording.
- Backend status/code review confirms that most current Auth, Session, Guest Identity, Account, Matchmaking, Match, Answer and Round exceptions can safely use the stable HTTP status envelope. Existing status-based frontend mapping covers 400/401/403/409/429/5xx. Guest conversion remains the justified explicit domain-code exception because recovery-expired and not-committed outcomes require different user actions.
- No broad per-exception code expansion is warranted from the current audit: add domain codes only when the client must take a materially different action or show a materially different localized explanation.

### Implemented
- Changed shared English/Persian API error copy to be context-neutral across account and gameplay surfaces: authorization, conflict, invalid input, rate limiting and generic failure.
- Added a regression test asserting the shared fallback messages do not assume an account-only context in either active locale.

### Commits
- Context-neutral shared error copy: 1b6249a29e1bfe5cfcc139ad38c997d0f8ccca25
- Regression test: 4b6b2795d0c10dcb6339f69ac70e12d307285fe9

### CI
- Android workflow [44599016452](https://github.com/iniya-studio/App-Nexira-/actions/runs/44599016452) completed with conclusion **success** against commit 4b6b2795d0c10dcb6339f69ac70e12d307285fe9. Frontend/match-engine tests, web build, Android package build, artifact verification and upload all passed.

**Acceptance:** The context-neutral shared API error copy change has full Android CI evidence. R-050's scoped copy correction is accepted. The broader endpoint-to-UI behavior review remains open for guest-only/registered-only authorization, idempotency conflicts, active-match conflicts, and retryable session states. Keep WebSocket errors on their independent transport contract. Localization and full 20-locale acceptance remain OPEN.

## R-051 — Question-generation and transport diagnostic boundary hardening

**Date:** 2026-11-19

### Audit findings
- The question-generation worker could persist an arbitrary `QuestionGenerationError.code` as `lastErrorCode`. The question-recovery API returns that field, so arbitrary adapter/provider diagnostics could cross the backend/client boundary as a machine code.
- The frontend HTTP client was normalized for non-2xx payloads, but network and abort paths also needed explicit regression coverage to ensure raw exception/caller cancellation diagnostics are not retained in the client-facing error object.
- The API error view model must carry only stable machine-readable descriptors (code/status), not server/provider/network messages.

### Implemented
- Added an allowlist of recognized question-generation recovery codes. Provider HTTP status variants normalize to `GENERATOR_PROVIDER_HTTP_ERROR`; unknown/untrusted error codes normalize to `GENERATOR_INTERNAL_ERROR`.
- Added PostgreSQL integration coverage proving an arbitrary provider diagnostic is not persisted as a question-recovery code; known timeout recovery behavior remains covered.
- Added HTTP client tests proving hostile non-2xx response messages, stack/diagnostic fields, network exception messages and caller abort diagnostics do not enter client-facing errors.
- Removed unused abort-diagnostic arguments so caller-provided abort reasons are not retained as error details.
- Reviewed online match adapter state: submission/synchronization errors are represented as `{ code, status }`; question-generation failure and cancelled-match states use stable descriptors and localized fallbacks.
- Reviewed API exception filter boundary: REST errors remain status/code based, with only the two status-bound guest-conversion codes explicitly allowlisted. WebSocket errors remain on their separate transport/filter contract.

### CI evidence
- Backend workflow [44599423819](https://github.com/iniya-studio/App-Nexira-/actions/runs/44599423819) completed with conclusion **success** against backend commit `9e170f311a87da9ba94d22c749d9915106e2e8de`. All stages passed, including Prisma checks/migrations, production build, Unit and PostgreSQL Integration tests, ESLint, staging Compose validation, Docker image build and cleanup.
- Android workflow [44599433206](https://github.com/iniya-studio/App-Nexira-/actions/runs/44599433206) completed with conclusion **success** against main source commit `7d0681e60856f96554529f2f16b7db81f4415463`. Frontend/match-engine tests, web build, APK build, artifact verification and upload passed.
- The Android workflow [44599016452](https://github.com/iniya-studio/App-Nexira-/actions/runs/44599016452) also verifies the preceding context-neutral API copy change.

**Acceptance:** The question-generation recovery-code boundary, HTTP transport error normalization and context-neutral shared API copy have successful relevant CI evidence. The broader endpoint-to-UI behavior review is still open; do not treat the entire error-contract audit as closed. Localization and full 20-locale acceptance remain OPEN.

## R-052 — Non-retryable answer conflicts must reconcile server state

**Date:** 2026-11-19

### Audit finding
- `AnswerService.submitAnswer` uses HTTP 409 for non-retryable conditions including an already-used idempotency key with a different payload, a round that is no longer accepting answers, a prior participant answer, and an expired answer deadline.
- The online match UI previously presented “Retry the same answer” as the primary action for every submission failure. Replaying the same answer is safe for uncertain transport failures, but repeating a definitive 409 cannot resolve these terminal state conflicts; the client must first reconcile with authoritative match state.

### Implemented
- Added active-locale copy in English and Persian explaining that a 409 answer conflict requires checking server match state.
- The submission-error panel now hides the retry action when either the adapter's safe error descriptor or the caught API error reports HTTP 409. “Check server status” becomes the primary action.
- For retryable failures, the same-answer retry remains available and server-status reconciliation remains secondary.
- Both retry and reconciliation handlers now refresh the React view from the adapter after failure and clear stale error state after successful reconciliation.
- Added frontend regression assertions for the 409-specific branch and both locale strings.

### CI evidence
- Android workflow [44600823559](https://github.com/iniya-studio/App-Nexira-/actions/runs/44600823559) is running against source commit `47c8d7d45c0ab6d80808862281d38b2b744626d1`. At this entry, dependency installation and frontend/match-engine tests have completed successfully; web/Android package build is in progress, with artifact verification and upload pending.
- Earlier intermediate Android runs were triggered by sequential commits; final acceptance must use the workflow for the latest source commit above.

**Acceptance:** Code and regression tests are committed on `main`; frontend/match-engine test step passed on the latest source commit. Full Android workflow acceptance remains pending until build, artifact verification, upload and cleanup complete. Do not claim this change CI-complete before run 44600823559 concludes successfully. The wider error-contract audit and 20-locale Localization remain OPEN.


## R-053 — 20-locale localization contract and recursive baseline audit (in progress)

**Date:** 2026-11-19

### Verified source inventory
- The frontend and backend registries both contain the fixed 20-locale target set; only `en` and `fa` are enabled.
- `COPY` still contains only the English and Persian UI dictionaries. `getQuestionCopy` still localizes the local question catalogue only for Persian.
- `App.jsx` contains 13 direct Persian-only conditional branches. The Store still contains 23 bilingual English/Persian data pairs across tabs and item copy; these must move into locale dictionaries.
- The app shell and document direction already derive from locale metadata. Existing RTL CSS mirrors selected directional icons, so this baseline should be extended rather than rewritten.
- `AccountSessionPanel.jsx` has no direct Persian-only rendering branch and already consumes the shared dictionary and Intl locale metadata.
- Current bundled fonts are Inter and Orbitron only. Complex-script font coverage and Android WebView fallback still require explicit validation and, where needed, script-specific font assets.

### Implemented
- Added `NEXIRA/LOCALIZATION-20-LOCALE-PLAN.md` as the acceptance contract: complete UI and game-content scope, registry/dictionary parity, placeholder integrity, RTL/formatting/font checks, Android QA, strict enablement, and definition of done.
- Extended `app/src/i18n.test.js` with recursive dictionary-tree parity, non-empty leaf validation, interpolation placeholder parity, and static nested UI translation-path coverage for the existing English/Persian baseline.
- Kept all 18 incomplete locales disabled. No placeholder translations or silent locale activation were introduced.

### CI evidence
- Android workflow [44613602371](https://github.com/iniya-studio/App-Nexira-/actions/runs/44613602371) completed successfully against commit `e0fdd7d766031c83ccab78f65d4f6bd56ab1486b`.
- Frontend/Match Engine tests: **182/182 passed**.
- Web production build, Android package build, APK verification and artifact upload: **success**.
- Uploaded artifact: `NEXIRA-Android-debug`, 7,214,391 bytes; artifact ID `14574001710`.

### Commits
- Localization acceptance contract: `9f5997970cf2023e76985ca9d96294cee29014a1`
- Recursive dictionary/UI audit tests and matcher correction: `bc0854ccca17a4f8de32709b02623fef7a76af03`, `217274eca5a5204f41ec10a2c7ac65c6a6716740`, `e0fdd7d766031c83ccab78f65d4f6bd56ab1486b`

**Acceptance:** The localization contract and stronger English/Persian baseline audit are committed and have successful Android CI evidence. This does not complete multi-locale translation. L10N remains OPEN until all 20 UI dictionaries and question packs are complete, all locale assumptions are removed, complex-script/RTL QA passes, and all 20 locales are enabled together with matching backend support.

## 2026-11-20 — 20-locale foundation continuation

- Re-audited the existing localization implementation instead of rebuilding it. The frontend/backend 20-locale registries, en/fa enablement gate, persisted settings.language, root direction propagation, and cross-locale match/Judge contracts were confirmed in source.
- Removed the remaining hard-coded Persian/English matchmaking language label; the label now comes from the participant locale's native registry name.
- Removed the settings summary's fixed two-language wording while preserving separate English and Persian copy.
- Added frontend BCP-47 canonicalization to match backend behavior. Canonical casing is normalized before enabled-locale validation; disabled target locales remain disabled.
- Added locale-aware plural-category selection and RTL FSI/PDI isolation for interpolated dynamic values. Updated timer/progress and account session-count call sites; account counts now use locale-aware number formatting.
- Added tests for 20-locale number/date/plural formatter support, frontend/backend locale canonicalization, native locale labels, and RTL interpolation behavior.
- Updated docs/LOCALIZATION_GLOBALIZATION_AUDIT.md with the verified baseline and remaining infrastructure gaps.
- Current source head at the time of this roadmap entry: 78173bd1afce5105780add81baad988d22562218.
- Verification status: GitHub connector returned no combined status checks and no PR-associated workflow runs for this commit. CI execution is therefore not confirmed here; do not mark this work green until the push-triggered workflow result is inspected.
- Still open before translation production: script-font coverage/Android glyph QA, complete RTL visual/layout audit, plural-message catalog contract, full visible-literal/accessibility audit, and locale-specific no-fallback acceptance. No new locale was enabled.