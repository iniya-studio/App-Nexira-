# NEXIRA — نقشه راه اجرایی و دفتر روزانه پیشرفت

- شناسه سند: NEX-ROADMAP-001
- نسخه: 4.0
- وضعیت: نسخه 4.0 — ممیزی عمیق چرخه عمومی 1v1 روی main پیش رفته است؛ بازیابی cold-start پس از خطای موقت شبکه با retry کنترل‌شده اصلاح و Android CI با 154/154 تست موفق شد. آزمون یکپارچه PostgreSQL اکنون مسیر صف عمومی تا جفت‌سازی، اجرای کامل 10 دور، نتیجه و تسویه exactly-once را پوشش می‌دهد؛ Backend CI با 44 suite و 255 test موفق است. پذیرش فیزیکی دو دستگاه، اجرای زنده AI/سرور و مرحله واقعی پذیرش حساب همچنان باز هستند؛ feature flag عمومی 1v1 باید خاموش بماند تا تمام سناریوهای NEX-BE-011 روی دو دستگاه پاس شوند. برآورد اجرای V1 حدود 48٪ و تقریبی است.
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
| شاخه مرجع و HEAD | `main`؛ آخرین HEAD ثبت‌شده در این همگام‌سازی: `20af3850ea3b8de15b86215780d29b75135c4df3`. توسعه و اصلاحات فقط روی main انجام می‌شوند؛ هیچ شاخه جدیدی ساخته نشده است. |
| مسیر اجرایی جاری تا انتشار | 1) حساب و هویت — پیاده‌سازی کد V1 تکمیل؛ 2) پذیرش واقعی حساب — **مرحله بعد و هنوز باز**؛ 3) اتصال واقعی سرور و AI و آزمون دو دستگاه؛ 4) Store، inventory، ownership و اقتصاد منصفانه؛ 5) اصلاح جریان‌ها و بازطراحی نهایی UX؛ 6) امنیت، عملیات، پایش، پشتیبان‌گیری و آزمون انتشار. مراحل وابسته به شواهد واقعی بسته می‌شوند، نه صرفاً CI سبز. |
| وضعیت اسناد ENG | ENG-001 و ENG-002 اسناد ممیزی/حفظ دارایی شاخه‌ها در snapshot مورخ 2026-11-13 هستند، نه سنجه پیشرفت محصول. آمار 74 فایل main در ENG-001 مربوط به snapshot تاریخی است؛ main فعلی 284 فایل tracked دارد. |
| وضعیت کیفیت خودکار | Backend CI [run 44056655461](https://github.com/iniya-studio/App-Nexira-/actions/runs/44056655461) روی commit `6e43ed30` موفق: 44/44 suite و 255/255 test PASS؛ Prisma format/validate/generate، PostgreSQL 16 migrations، Nest build، ESLint، Compose validation و staging Docker image build PASS. این run آزمون یکپارچه public queue → دو MATCHED entry → بازیابی همان match فعال برای هر دو principal → ده دور synchronized → MatchResult → XP/Global Ranking exactly-once را نیز اجرا کرد. Android CI [run 44054787771](https://github.com/iniya-studio/App-Nexira-/actions/runs/44054787771) روی app commit `050998f0` موفق: 154/154 تست، Vite/Capacitor build، Gradle APK build، APK verification و artifact upload PASS؛ Artifact `14315103410`، 7,207,905 bytes. |
| هسته Backend و داده | NestJS/Prisma/PostgreSQL، migration chain، identity/session، match/round lifecycle، AI workers، matchmaking و progression/settlement در main موجود و CI-verified هستند؛ استقرار واقعی و provider execution تأیید نشده است. |
| 1vAI و 1v1 | هسته 1vAI و public 1v1 در main پیاده‌سازی و CI-verified هستند. بازیابی سرد 1vAI/1v1 پس از خطای موقت شبکه با retry افزایشی پوشش داده شده است. مسیر Backend از صف عمومی تا اجرای کامل 10 دور و تسویه exactly-once در PostgreSQL integration test پاس شده؛ اما پذیرش فیزیکی دو دستگاه، reconnect واقعی شبکه، guest conversion حین مسابقه و live AI/server هنوز باز هستند. هر دو feature flag عمومی 1v1 تا عبور از NEX-BE-011 خاموش بمانند. |
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

| 2026-11-17 | R-030 / ممیزی عمیق چرخه عمومی 1v1 و اثبات یکپارچه صف تا تسویه | ممیزی کد صف و مسابقه نشان داد جفت‌سازی FIFO/سازگار با category و language، قفل‌های PostgreSQL، cancellation race، idempotency پاسخ و تسویه مستقل از transport در کد موجودند. شکاف واقعی کلاینت: بازیابی سرد صف/مسابقه در صورت خطای موقت شبکه فقط یک‌بار تلاش می‌کرد؛ retry کنترل‌شده با backoff تا سقف 30 ثانیه اضافه شد. آزمون چنددوره‌ای Backend از ساخت مستقیم Match به شروع از public matchmaking queue تغییر کرد: دو principal احرازشده، دو queue entry، یک match، ده round مشترک، finalization، XP/Global Ranking exactly-once و وضعیت terminal صف هر دو کاربر را پوشش می‌دهد. اسناد NEX-BE-009 و NEX-BE-011 با شواهد همگام شدند. | Android CI run 44054787771 روی `050998f08fad0109a00858c3e4d1cbbd7c25b9ae`: 154/154 tests PASS، web/Android build، APK verify و upload موفق؛ Artifact `14315103410`. Backend CI run 44056655461 روی `6e43ed308447c1988134848b4864a8fe68016677`: 44/44 suites و 255/255 tests PASS؛ بازیابی snapshot مسابقه فعال برای هر دو بازیکن نیز بررسی شد، PostgreSQL 16 migrations، Nest build، ESLint، Compose و Docker image PASS؛ تست `multi-round-lifecycle.integration.spec.ts` از صف عمومی تا تسویه کامل اجرا شد. | app fix: `050998f08fad0109a00858c3e4d1cbbd7c25b9ae`; Backend E2E baseline: `847f9d17383a66501acbb53e493fe81af3ff3eb8`; active recovery assertion: `6e43ed308447c1988134848b4864a8fe68016677`; NEX-BE-011 در main به‌روزرسانی شد. | PUBLIC 1v1 QUEUE-TO-SETTLEMENT AUTOMATED PATH VERIFIED / COLD-START NETWORK RETRY FIXED / TWO-DEVICE ACCEPTANCE PENDING | گام بعد: ادامه ممیزی race/reconnect و آزمون‌های امنیتی/مرزی 1v1؛ سپس اجرای سناریوهای NEX-BE-011 روی دو دستگاه واقعی با سرور HTTPS عملیاتی. تا ثبت شواهد تمام سناریوها، feature flags خاموش بمانند؛ CI سبز جایگزین پذیرش فیزیکی نیست. |

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

---

**قاعده نهایی:** این سند مسیر و وضعیت را تعیین می‌کند؛ کد واقعی و آزمون‌های موفق در `main` تعیین می‌کنند چه چیزی واقعاً انجام شده است. هر تغییر در محدوده محصول یا معماری باید با تصمیم ثبت‌شده و نسخه جدید این سند همراه باشد.
