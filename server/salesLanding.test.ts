import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const salesPage = readFileSync(resolve(import.meta.dirname, "../sales/index.html"), "utf8");

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
    expect(salesPage).toContain("لن تُرسل البيانات إلى خادم");
  });
});
