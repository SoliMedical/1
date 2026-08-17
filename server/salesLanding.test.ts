import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const salesPage = readFileSync(resolve(import.meta.dirname, "../sales/index.html"), "utf8");
const packageManifest = readFileSync(resolve(import.meta.dirname, "../package.json"), "utf8");

describe("صفحة مبيعات Soli Medical", () => {
  it("تستخدم اسم مستخدم واتساب في جميع وجهات التواصل ولا تكشف رقم المبيعات السابق", () => {
    expect(salesPage).toContain("https://wa.me/Ahmed0soliman");
    expect(salesPage).toContain("راسلنا عبر واتساب: <bdi>Ahmed0soliman</bdi>");
    expect(salesPage).not.toContain("201021434947");
    expect(salesPage).not.toContain("01021434947");
  });

  it("يوفر زر واتساب عائماً ونموذج طلب عرض لا يرسل البيانات إلى خادم", () => {
    expect(salesPage).toContain('class="whatsapp-float"');
    expect(salesPage).toContain('id="demoRequestForm"');
    expect(salesPage).toContain("navigator.clipboard.writeText(message)");
    expect(salesPage).toContain("window.open(WHATSAPP_USERNAME_LINK, '_blank', 'noopener')");
    expect(salesPage).toContain("لا تُرسل البيانات إلى خادم");
  });

  it("يعرض حل العيادة الفردية وحل المجمعات بصورة منفصلة ويتيح تحديدهما في طلب العرض", () => {
    expect(salesPage).toContain("عيادة الطبيب الواحد");
    expect(salesPage).toContain("مجمع العيادات والمستشفيات الصغيرة");
    expect(salesPage).toContain('value="مجمع عيادات"');
    expect(salesPage).toContain('data-product-link="clinic"');
    expect(salesPage).toContain('data-product-link="complex"');
    expect(salesPage).toContain("soli-medical-complex-dashboard-enhanced_4ef474a0.png");
  });

  it("يضم صفحة المبيعات ضمن حزمة الإنتاج للاستضافة المستقلة", () => {
    expect(packageManifest).toContain("cp sales/index.html dist/public/sales/index.html");
  });
});
