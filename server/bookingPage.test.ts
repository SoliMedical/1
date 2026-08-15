import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const page = readFileSync(resolve(import.meta.dirname, "../client/index.html"), "utf8");

describe("صفحة الحجز الذاتي عبر واتساب", () => {
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
});
