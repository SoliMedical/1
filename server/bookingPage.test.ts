import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const page = readFileSync(resolve(import.meta.dirname, "../client/index.html"), "utf8");

const getEgyptianPhoneValidator = () => {
  const match = page.match(/const validateEgyptianPhone = \(value\) => \{[\s\S]*?^\s*};/m);
  if (!match) throw new Error("تعذر العثور على دالة التحقق من الهاتف المصري");
  return new Function(`${match[0]}; return validateEgyptianPhone;`)() as (value: unknown) => string | null;
};

describe("صفحة الحجز الذاتي عبر واتساب", () => {
  it("يقبل أرقام المحمول المصرية الصحيحة ويطبعها بصيغة محلية موحدة", () => {
    const validateEgyptianPhone = getEgyptianPhoneValidator();

    expect(validateEgyptianPhone("01012345678")).toBe("01012345678");
    expect(validateEgyptianPhone("+201012345678")).toBe("01012345678");
    expect(validateEgyptianPhone("201012345678")).toBe("01012345678");
    expect(validateEgyptianPhone("00201012345678")).toBe("01012345678");
  });

  it("يرفض الأرقام غير المصرية أو غير المكتملة", () => {
    const validateEgyptianPhone = getEgyptianPhoneValidator();

    expect(validateEgyptianPhone("123456")).toBeNull();
    expect(validateEgyptianPhone("0501234567")).toBeNull();
    expect(validateEgyptianPhone("abcdefghijk")).toBeNull();
  });

  it("تعزل وضع الحجز العام عن Firebase وتخزين العيادة المحلي", () => {
    const bookingStart = page.indexOf("Alpine.data('bookingApp'");
    const bookingEnd = page.indexOf("Alpine.data('appData'", bookingStart);
    const bookingComponent = page.slice(bookingStart, bookingEnd);

    expect(page).toContain("if (isFirebaseConfigured && !publicBookingMode)");
    expect(page).toContain('<template x-if="isPublicBooking">');
    expect(page).toContain('<template x-if="!isPublicBooking">');
    expect(bookingComponent).not.toContain("localStorage");
    expect(bookingComponent).not.toContain("firestore");
  });

  it("ينشئ رسالة واتساب منظمة ويجعل الاستقبال هو من يضيف الموعد", () => {
    expect(page).toContain("buildWhatsAppMessage()");
    expect(page).toContain("طلب حجز موعد جديد");
    expect(page).toContain("الحالة المطلوبة: بانتظار التأكيد");
    expect(page).toContain("https://wa.me/${this.receptionPhone}?text=${encodeURIComponent(this.buildWhatsAppMessage())}");
    expect(page).toContain("prepareWhatsAppAppointment()");
    expect(page).toContain("status: 'pending_confirmation'");
    expect(page).toContain("{ key: 'pending_confirmation', label: 'بانتظار التأكيد'");
  });

  it("يوفر رابط الحجز داخل إعدادات الروشتة ويدعم رابط QR بديلاً", () => {
    expect(page).toContain("getBookingShareUrl()");
    expect(page).toContain("bookingLink: ''");
    expect(page).toContain("alternateQrLink: ''");
    expect(page).toContain('<option value="custom">رابط بديل مستقبلي</option>');
    expect(page).not.toContain('id="appointmentBookingQrCode"');
    expect(page).toContain('id="appointmentPhoneInput"');
    expect(page).toContain('autocomplete="tel-national"');
  });

  it("يعرّف كل حقول البحث كحقول مستقلة لا يقترح مدير كلمات المرور تعبئتها", () => {
    const searchInputs = [...page.matchAll(/<input\b(?=[^>]*x-model="[^"]*[Ss]earch[^"]*")[^>]*>/g)].map(match => match[0]);

    expect(searchInputs.length).toBeGreaterThanOrEqual(9);
    for (const input of searchInputs) {
      expect(input).toContain('type="search"');
      expect(input).toContain('autocomplete="off"');
      expect(input).toContain('data-form-type="other"');
      expect(input).toContain('data-lpignore="true"');
      expect(input).toContain('data-1p-ignore="true"');
      expect(input).toContain('data-bwignore="true"');
    }

    expect(page).toContain("const initializeSearchFieldProtections");
    expect(page).toContain("input.setAttribute('data-protonpass-ignore', 'true')");
    expect(page).toContain("input.setAttribute('data-soli-search', 'true')");
    expect(page).toContain("initializeSearchFieldProtections();");
    expect(page).toContain("document.addEventListener('focusin'");
  });

  it("يبقي طريقة كلمة المرور المحلية واضحة للمدير دون تحويل حقل الدخول إلى حقل بحث", () => {
    expect(page).toContain('استعادة كلمة مرور المدير دون إنترنت');
    expect(page).toContain('كلمات المرور مخفية افتراضياً');
    expect(page).toContain('احفظ سؤالاً وإجابة لا يعرفهما غير المدير');
    expect(page).toContain('x-model="u.password"');
    expect(page).toContain('x-model="loginForm.password"');
  });

  it("يعرض صفوف المعمل والأشعة مع نوع محتوى واضح في الإدخال والطباعة", () => {
    expect(page).toContain('value="request">طلب</option>');
    expect(page).toContain('value="result">نتيجة</option>');
    expect(page).toContain('value="report">تقرير</option>');
    expect(page).toContain('formatClinicalItem(item)');
    expect(page).toContain('class="print-medical-row');
    expect(page).toContain('>المعمل:</span>');
    expect(page).toContain('>الأشعة:</span>');
    expect(page).not.toContain('نتيجة المعامل (اختياري):');
    expect(page).not.toContain('الأشعة المطلوبة');
    expect(page).not.toContain('نتيجة المعمل المطلوبة');
  });

  it("يعطي وضع الورق المطبوع مسبقاً هامشاً صفرياً عند إخفاء الرأس أو التذييل", () => {
    expect(page).toContain('print-no-header { padding-top: 0 !important; }');
    expect(page).toContain('print-no-footer { padding-bottom: 0 !important; }');
    expect(page).toContain('printHeaderEnabled = false; doctorInfo.printFooterEnabled = false');
  });

  it("يطبق اعتماد الجهاز بعد أول دخول متصل ويسمح بالعمل المحلي لاحقاً", () => {
    expect(page).toContain("deviceTrustKey: 'soliMedicalDeviceTrust_v1'");
    expect(page).toContain('restoreDeviceTrust()');
    expect(page).toContain('enrollDevice(user)');
    expect(page).toContain('deviceTrustDurationMs: 30 * 24 * 60 * 60 * 1000');
    expect(page).toContain('isDeviceTrustValid(user)');
    expect(page).toContain('revokeDeviceTrust()');
    expect(page).toContain("mode: 'online-first-local-afterward'");
    expect(page).toContain('هذا المتصفح غير معتمد بعد. اتصل بالإنترنت لأول تسجيل دخول');
    expect(page).toContain('if (this.cloudSyncEnabled && !trustedForThisUser) this.enrollDevice(matchedUser)');
    expect(page).toContain('async prepareUsersForOnlineLogin()');
    expect(page).toContain("get({ source: 'server' })");
    expect(page).toContain('waitForCloudAuthReady');
    expect(page).toContain('persistUsersToCloudNow');
    expect(page).toContain('await this.prepareUsersForOnlineLogin()');
  });

  it("يفرض أحدث نسخة للحساب عند كل دخول متصل ولا يستعيد جلسة قديمة أثناء الاتصال", () => {
    expect(page).toContain('const latestUsersLoaded = await this.prepareUsersForOnlineLogin()');
    expect(page).toContain("تعذر التحقق من أحدث بيانات الحسابات. تأكد من اتصال الإنترنت ثم حاول مرة أخرى.");
    expect(page).toContain("وفق أحدث نسخة للحسابات. استخدم البيانات الجديدة بعد أي تعديل من المدير.");
    expect(page).toContain('&& !navigator.onLine)');
    expect(page).toContain('this.clearSession();');
    expect(page).toContain('this.revokeDeviceTrust();');
  });

  it("يثبت أن طباعة A5 تستخدم ورقة بيضاء بلا حواف أو ظلال داكنة", () => {
    expect(page).toContain('size: A5 portrait;');
    expect(page).toContain('margin: 0;');
    expect(page).toContain('background: #fff !important;');
    expect(page).toContain('background: white !important;');
    expect(page).toContain('box-shadow: none !important;');
    expect(page).toContain('border: 0 !important;');
    expect(page).toContain('print-color-adjust: exact;');
  });

  it("يحفظ تغييرات الحسابات مباشرة قبل تأكيدها عند توفر الإنترنت", () => {
    expect(page).toContain('async addUser()');
    expect(page).toContain('async removeUser(userId)');
    expect(page).toContain('async saveUserPermissions(userId)');
    expect(page).toContain('const cloudResult = await this.persistUsersToCloudNow()');
    expect(page).toContain('تم حفظ الحساب محلياً، لكن لم يؤكَّد حفظه في السحابة');
  });

  it("يغطي مسارات المزامنة الأساسية للأجهزة الجديدة والانقطاع والتعارض", () => {
    expect(page).toContain('offline');
    expect(page).toContain('syncConflicts');
    expect(page).toContain('deviceTrust');
    expect(page).toContain('conflictKey');
  });

  it("يعرض كل حقول اليوم والشهر باتجاه عربي صحيح", () => {
    const dateInputs = page.match(/<input\b[^>]*type="(?:date|month)"[^>]*>/g) || [];

    expect(dateInputs.length).toBeGreaterThanOrEqual(7);
    for (const input of dateInputs) {
      expect(input).toContain('lang="ar-EG"');
      expect(input).toContain('dir="rtl"');
      expect(input).toContain('soli-date-input');
    }
    expect(page).toContain('input.soli-date-input[type="date"]');
    expect(page).toContain('input.soli-date-input[type="month"]');
    expect(page).toContain('flatpickr/dist/l10n/ar.js');
    expect(page).toContain('const initializeArabicDatePickers');
    expect(page).toContain('locale: window.flatpickr.l10ns.ar');
    expect(page).toContain("disableMobile: true");
  });
});
