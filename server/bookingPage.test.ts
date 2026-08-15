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

  it("يوفر رابط حجز ورمز QR قابلين للنسخ والمشاركة والطباعة", () => {
    const printMethod = page.slice(page.indexOf("printBookingQr()"), page.indexOf("updateAppointmentStatus", page.indexOf("printBookingQr()")));
    expect(page).toContain("getBookingShareUrl()");
    expect(page).toContain("renderBookingShareQr()");
    expect(page).toContain("copyBookingLink()");
    expect(page).toContain("shareBookingViaWhatsApp()");
    expect(page).toContain("printBookingQr()");
    expect(page).toContain('id="appointmentBookingQrCode"');
    expect(page).not.toContain("<script>window.onload=()=>{window.focus();window.print()}");
    expect(printMethod).toContain("printWindow.document.open()");
    expect(printMethod).not.toContain("</head>");
    expect(printMethod).not.toContain("<body");
  });
});
