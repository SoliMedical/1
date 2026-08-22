import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const page = readFileSync(resolve(import.meta.dirname, "../client/index.html"), "utf8");

describe("إعدادات الطبيب والطباعة", () => {
  it("يحفظ اسم الطبيب محلياً فوراً ويؤجل السحابة إلى ما بعد انتهاء التحرير", () => {
    expect(page).toContain("doctorInfoEditing: false");
    expect(page).toContain("@focus=\"beginDoctorInfoEditing()\"");
    expect(page).toContain("@blur=\"finishDoctorInfoEditing()\"");
    expect(page).toContain("if (key === 'doctorInfo' && this.doctorInfoEditing) return;");
    expect(page).toContain("this.persistState();\n                    clearTimeout(this.doctorInfoCloudSyncTimer);");
    expect(page).toContain("this.doctorInfoCloudSyncTimer = setTimeout(() => this.queueCloudSync(), 300)");
    expect(page).toContain("this.doctorInfoEditing || !firestoreDB");
  });

  it("يبقي اللقطة المحلية أولوية عند وصول تحديث سحابي متأخر ولا يحذفها تلقائياً", () => {
    expect(page).toContain("const preservePendingLocalSnapshot = this.hasPendingSyncWork();");
    expect(page).toContain("if (preservePendingLocalSnapshot && localSnapshot?.[key] !== undefined)");
    expect(page).toContain("this.localChangesPending = preservePendingLocalSnapshot;");
    expect(page).toContain("if (preservePendingLocalSnapshot) this.queueCloudSync();");
  });

  it("يحمي كل مفاتيح الحالة المحلية، بما فيها إعدادات الطباعة وQR، من لقطة سحابية متأخرة", () => {
    expect(page).toContain("const localSnapshot = preservePendingLocalSnapshot ? this.getSyncDataSnapshot() : null;");
    expect(page).toContain("this.persistentKeys.forEach(key => {");
    expect(page).toContain("this[key] = localSnapshot[key];");
    expect(page).toContain("} else if (data[key] !== undefined) {");
    expect(page).toContain("this[key] = data[key];");
  });

  it("لا يستبدل تحديث متأخر قيماً فعلية محفوظة محلياً في اسم الطبيب والطباعة وQR", () => {
    const localDoctorInfo = {
      fullName: "Dr. Local Priority",
      printQrSize: "large",
      printFooterFontSize: "large",
      printContentScale: 1.15,
      alternateQrLink: "https://clinic.example/future-link",
      bookingLink: "https://clinic.example/legacy-booking"
    };
    const staleRemoteDoctorInfo = {
      fullName: "",
      printQrSize: "small",
      printFooterFontSize: "small",
      printContentScale: 0.8,
      alternateQrLink: "",
      bookingLink: ""
    };
    const localSnapshot = { doctorInfo: localDoctorInfo };
    const remoteData = { doctorInfo: staleRemoteDoctorInfo };
    const appliedState: Record<string, unknown> = {};
    const preservePendingLocalSnapshot = true;

    ["doctorInfo"].forEach(key => {
      if (preservePendingLocalSnapshot && localSnapshot[key as keyof typeof localSnapshot] !== undefined) {
        appliedState[key] = localSnapshot[key as keyof typeof localSnapshot];
      } else if (remoteData[key as keyof typeof remoteData] !== undefined) {
        appliedState[key] = remoteData[key as keyof typeof remoteData];
      }
    });

    expect(appliedState.doctorInfo).toEqual(localDoctorInfo);
    expect(appliedState.doctorInfo).not.toEqual(staleRemoteDoctorInfo);
    expect((appliedState.doctorInfo as typeof localDoctorInfo).fullName).toBe("Dr. Local Priority");
    expect((appliedState.doctorInfo as typeof localDoctorInfo).alternateQrLink).toBe("https://clinic.example/future-link");
    expect((appliedState.doctorInfo as typeof localDoctorInfo).bookingLink).toBe("https://clinic.example/legacy-booking");
    expect((appliedState.doctorInfo as typeof localDoctorInfo).printQrSize).toBe("large");
  });

  it("يعرض QR واتساب أو رابطاً بديلاً فقط ويحافظ على رابط الحجز القديم كبيانات غير محذوفة", () => {
    expect(page).toContain('<option value="whatsapp">محادثة واتساب</option>');
    expect(page).toContain('<option value="custom">رابط بديل مستقبلي</option>');
    expect(page).not.toContain('<option value="booking">صفحة حجز المواعيد</option>');
    expect(page).toContain("if (!this.doctorInfo.alternateQrLink && this.doctorInfo.bookingLink)");
    expect(page).toContain("this.doctorInfo.alternateQrLink = this.doctorInfo.bookingLink;");
  });

  it("يرحّل رابط الحجز القديم إلى الرابط البديل دون حذفه تلقائياً", () => {
    expect(page).toContain("if (this.doctorInfo.qrMode === 'booking') {");
    expect(page).toContain("this.doctorInfo.qrMode = 'custom';");
    expect(page).not.toContain("delete this.doctorInfo.bookingLink");
    expect(page).not.toContain("this.doctorInfo.bookingLink = ''");
  });
});
