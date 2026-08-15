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
    expect(page).toContain('في حال نسيان كلمة المرور:');
    expect(page).toContain('يرى كلمة المرور الحالية مكتوبة بوضوح أو يغيّرها مباشرةً');
    expect(page).toContain('x-model="u.password"');
    expect(page).toContain('x-model="loginForm.password"');
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
