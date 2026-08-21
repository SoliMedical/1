import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const page = readFileSync(resolve(import.meta.dirname, "../client/index.html"), "utf8");
const sw = readFileSync(resolve(import.meta.dirname, "../client/public/sw.js"), "utf8");

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

    expect(page).toContain("if (isFirebaseConfigured && !publicBookingMode && !publicPricingMode)");
    expect(page).toContain('<template x-if="isPublicBooking">');
    expect(page).toContain('<template x-if="!isPublicBooking && !isPublicPricing">');
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

  it("يقصر QR الروشتة على واتساب أو رابط بديل ولا يعرض صفحة حجز المواعيد", () => {
    expect(page).toContain("bookingLink: ''");
    expect(page).toContain("alternateQrLink: ''");
    expect(page).toContain('<option value="whatsapp">محادثة واتساب</option>');
    expect(page).toContain('<option value="custom">رابط بديل مستقبلي</option>');
    expect(page).not.toContain('<option value="booking">صفحة حجز المواعيد</option>');
    expect(page).toContain('if (this.doctorInfo.qrMode === \'booking\')');
    expect(page).toContain("this.doctorInfo.qrMode = 'custom'");
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

	  it("يبقي حقول كلمة المرور المحلية دون بطاقات استعادة أو مزامنة تقنية داخل الإعدادات", () => {
    expect(page).not.toContain('استعادة كلمة مرور المدير دون إنترنت');
    expect(page).not.toContain('هوية Firebase وعضوية العيادة');
    expect(page).not.toContain('ترحيل قاعدة Firebase وأرشفة العرض');
    expect(page).toContain("'🟡 وضع محلي - بانتظار الاتصال'");
    expect(page).toContain('x-model="u.password"');
	    expect(page).toContain('x-model="loginForm.password"');
	  });

	  it("يدوّر الإصدار وعامل الخدمة عند إصلاح ربط بطاقة مدير النظام", () => {
	    expect(page).toContain("const SOLI_APP_VERSION = 'v1.7.8'");
	    expect(page).toContain("navigator.serviceWorker.register('./sw.js?v=soli-v1.7.8'");
	    expect(sw).toContain('soli-medical-pwa-v29');
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
    expect(page).toContain('if (!localCredentialsMatch && navigator.onLine && this.cloudSyncEnabled && firebaseAuth)');
    expect(page).toContain('await this.prepareUsersForOnlineLogin()');
  });

  it("يقبل الحساب المحلي الصحيح أولاً ولا يسمح لفشل Firebase بتعطيل دخول المدير", () => {
    expect(page).toContain('firebaseLogin = await this.signInFirebaseForLocalUser(');
    expect(page).toContain('if (!localCredentialsMatch && navigator.onLine && this.cloudSyncEnabled && firebaseAuth)');
    expect(page).toContain('{ allowAnonymousFallback: false, createIfMissing: false }');
    expect(page).toContain('if (firebaseLogin.persistent)');
    expect(page).toContain('await this.prepareUsersForOnlineLogin()');
    expect(page).toContain('if (matchedUser && !matchedUser.password && firebaseLogin.persistent)');
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
    expect(page).toContain("async callClinicAccountGateway(action, user)");
    expect(page).toContain("await this.callClinicAccountGateway('upsert', user)");
    expect(page).toContain("await this.callClinicAccountGateway('delete', user)");
  });

  it("يغطي مسارات المزامنة الأساسية للأجهزة الجديدة والانقطاع والتعارض", () => {
    expect(page).toContain('offline');
    expect(page).toContain('syncConflicts');
    expect(page).toContain('deviceTrust');
    expect(page).toContain('conflictKey');
  });

  it("يمنع النسخة العامة القديمة من استبدال users الأحدث بين متصفحين", () => {
    const persistentKeysMatch = page.match(/persistentKeys:\s*\[([^\]]+)\]/);
    expect(persistentKeysMatch?.[1]).toBeTruthy();
    expect(persistentKeysMatch?.[1]).not.toContain("'users'");
    expect(page).toContain('normalizeUsers(users)');
    expect(page).toContain('this.users = this.mergeCloudUsersWithLocalCredentials(data.users)');
    expect(page).toContain('async persistUsersToCloudNow()');
    expect(page).toContain('usersWriteInFlight');
    expect(page).toContain("get({ source: 'server' })");
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
    expect(page).toContain("locale: isEnglish ? 'default' : window.flatpickr.l10ns?.ar");
    expect(page).toContain("disableMobile: true");
  });

  it("يربط صلاحية المواعيد مستقلاً عن مرضى الانتظار مع دعم الحسابات القديمة", () => {
    expect(page).toContain("{ key: 'appointments', label: 'المواعيد والتقويم' }");
    expect(page).toContain("appointments: 'appointments'");
    expect(page).toContain("permissions.appointments = Boolean(permissions.waitingQueue)");
    expect(page).toContain("permissions[module.key] = true");
    expect(page).toContain("currentUser?.permissions?.appointments || currentUser?.permissions?.waitingQueue");
  });

  it("ينشئ تحصيلاً واحداً للموعد ويربطه بالمريض وقائمة الانتظار", () => {
    expect(page).toContain('ensureAppointmentFinancialLink(appointment)');
    expect(page).toContain("source: 'appointment'");
    expect(page).toContain('appointmentId, patientId: patient?.id');
    expect(page).toContain('ensureAppointmentQueueLink(appointment)');
    expect(page).toContain('invoiceId: invoice?.id || null');
  });

  it("ينقل الموعد المكتمل إلى إدارة المرضى ويحفظه في السجل مع إبقاء الفاتورة", () => {
    expect(page).toContain('completeAppointment(appointment)');
    expect(page).toContain("appointment.status = 'completed'");
    expect(page).toContain('appointment.completedAt');
    expect(page).toContain('this.ensureAppointmentFinancialLink(appointment)');
    expect(page).toContain('اكتمل الموعد وحُفظ في السجل');
    expect(page).toContain('removeFromQueueForPatient(patientId)');
  });

  it("يعرض رقم إصدار واضحاً يطابق النسخة المنشورة الحالية", () => {
    expect(page).toContain("const SOLI_APP_VERSION = 'v1.7.8'");
    expect(page).toContain('appVersion: SOLI_APP_VERSION');
    expect(page).toContain("'إصدار ' + appVersion");
    expect(page).toContain("'إصدار النظام ' + appVersion");
    expect(page).toContain('نسخة النظام');
  });

  it("يعرّف دالة QR التي يستدعيها فتح صفحة المواعيد حتى لا تنهار تهيئة Alpine", () => {
    expect(page).toContain('this.renderBookingShareQr()');
    expect(page).toContain('renderBookingShareQr() {');
    expect(page).toContain("document.getElementById('bookingShareQrCode')");
  });

  it("يستخدم تعريفاً واحداً لفتح المواعيد مع التوافق مع صلاحية الانتظار", () => {
    const matches = page.match(/^\s*openAppointmentsPage\s*\([^)]*\)\s*\{/gm) || [];
    expect(matches).toHaveLength(1);
    expect(page).toContain("const canOpen = user?.role === 'admin' || permissions.appointments || permissions.waitingQueue");
    expect(page).toContain("this.currentView = 'appointments'");
  });

  it("يرفع نسخة Service Worker عند تغييرات التطبيق حتى لا تبقى نسخة مواعيد قديمة", () => {
    expect(page).toContain("navigator.serviceWorker.register('./sw.js?v=soli-v1.7.8', { updateViaCache: 'none' })");
    expect(sw).toContain('soli-medical-pwa-v29');
    expect(sw).toContain('const isAppShell');
    expect(sw).toContain('const SCOPE_PATH = new URL(self.registration.scope).pathname');
    expect(sw).toContain('fetch(event.request)');
  });
});


describe("تحديث جلسة المستخدم بعد مزامنة الصلاحيات", () => {
  it("يحدّث currentUser من users الجديدة قبل فحص صلاحية المواعيد", () => {
    expect(page).toContain("syncCurrentUserFromUsers()");
    expect(page).toContain("if (freshUser) this.currentUser = this.withCompatiblePermissions(freshUser);");
    expect(page).toContain("this.users = this.mergeCloudUsersWithLocalCredentials(data.users);\n                                this.syncCurrentUserFromUsers();");
  });
});

describe("إصلاحات الزيارة والجلسة والتنبيهات", () => {
  it("يحفظ أسعار أنواع الزيارات ويعيد مزامنتها بعد التعديل", () => {
    expect(page).toContain("saveVisitTypePrices() {");
    expect(page).toContain("this.persistState();");
    expect(page).toContain("this.queueCloudSync();");
    expect(page).toContain("تم حفظ أسعار أنواع الزيارات والفواتير تلقائياً");
    expect(page).toContain("this.saveVisitTypePrices();");
  });
  it("يستعيد الجلسة والقسم الحالي بعد إعادة تحميل الصفحة عند الاتصال", () => {
    expect(page).toContain("localStorage.getItem('soliLastSection')");
    expect(page).toContain("navigator.onLine || this.isDeviceTrustValid(user)");
    expect(page).toContain("this.currentView = savedView");
  });
  it("يعرض تنبيهاً بصرياً وقائمة الزيارات المسجلة ويربطها بالمتابعة القادمة", () => {
    expect(page).toContain("showFlashNotice(message, type = 'success')");
    expect(page).toContain("setTimeout(() => { this.flashNotice = ''; }, 1000)");
    expect(page).toContain("recentRegisteredPatients");
    expect(page).toContain("تم تسجيل زيارة");
    expect(page).toContain("navigateTo('followUps')");
  });
});
