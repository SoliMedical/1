import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const page = readFileSync(resolve(import.meta.dirname, "../client/index.html"), "utf8");
const interfaceScript = readFileSync(resolve(import.meta.dirname, "../client/soli-interface-enhancements.js"), "utf8");
const interfaceStyles = readFileSync(resolve(import.meta.dirname, "../client/soli-interface-enhancements.css"), "utf8");

describe("لغة الواجهة والتباين", () => {
  it("يعرض بطاقة الإعدادات ويُبقي اختيار اللغة محفوظاً وقابلاً للتطبيق فوراً", () => {
    expect(page).toContain('class="soli-language-card');
    expect(page).toContain('x-show="currentView === \'settings\'" class="soli-language-card');
    expect(page).toContain('role="radio" :aria-checked="appLanguage === \'ar\'" @click="applyAppLanguage(\'ar\')"');
    expect(page).toContain('role="radio" :aria-checked="appLanguage === \'en\'" @click="applyAppLanguage(\'en\')"');
    expect(page).toContain("@click=\"applyAppLanguage('ar')\"");
    expect(page).toContain("@click=\"applyAppLanguage('en')\"");
    expect(page).toContain("appLanguage: window.SoliInterface?.getStoredLanguage?.() || 'ar'");
    expect(page).toContain('applyAppLanguage(language, persist = true)');
    expect(page).toContain("initializeArabicDatePickers(document, selectedLanguage, true)");
    expect(page).toContain("localStorage.getItem('soliMedicalTheme_v1') !== 'light'");
    expect(page).toContain("localStorage.setItem('soliMedicalTheme_v1', value ? 'dark' : 'light')");
    expect(page).toContain('./soli-interface-enhancements.js');
  });

  it("يغيّر اتجاه الوثيقة والعنوان ويترجم النصوص دون التأثير في الشفرة أو الأنماط", () => {
    expect(interfaceScript).toContain("const STORAGE_KEY = 'soliMedicalLanguage_v1'");
    expect(interfaceScript).toContain("html.dir = activeLanguage === 'en' ? 'ltr' : 'rtl'");
    expect(interfaceScript).toContain("document.title = activeLanguage === 'en'");
    expect(interfaceScript).toContain("window.SoliInterface = { applyLanguage, getStoredLanguage, setLanguage, translate, translations }");
    expect(interfaceScript).toContain("const ignoredParents = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE'])");
  });

  it("يحتوي على ترجمة لكل أقسام التنقل الرئيسة ورسائل الحجز المهمة", () => {
    const mainSections = {
      "لوحة التحكم": "Dashboard",
      "إضافة زيارة / كشف": "New visit / consultation",
      "المواعيد والتقويم": "Appointments & calendar",
      "مرضى في الانتظار": "Waiting patients",
      "المتابعة القادمة": "Upcoming follow-ups",
      "المرضى والملفات الطبية": "Patients & medical records",
      "الفواتير والمالية": "Invoices & finance",
      "المنصرف": "Expenses",
      "التقارير الشاملة": "Reports",
      "الوصفات والروشتات": "Prescriptions",
      "الروشتة": "Prescription",
      "إعدادات النظام": "System settings",
    };
    for (const [arabic, english] of Object.entries(mainSections)) {
      expect(interfaceScript).toContain(`'${arabic}': '${english}'`);
    }

    expect(interfaceScript).toContain("'يرجى كتابة الاسم والتاريخ والوقت قبل المتابعة.': 'Please enter the name, date, and time before continuing.'");
    expect(interfaceScript).toContain("'رقم استقبال العيادة غير متاح في هذا الرابط. يرجى طلب رابط الحجز من الاستقبال.': 'The clinic reception phone number is unavailable in this link. Please request the booking link from reception.'");
    expect(interfaceScript).toContain("'طلب حجز آمن عبر واتساب': 'Secure appointment booking via WhatsApp'");
    expect(interfaceScript).toContain("'هذه الصفحة مخصصة لطلب الموعد فقط، ولا تعرض أي مواعيد أو ملفات طبية.': 'This page is only for appointment requests and does not display appointments or medical records.'");
    expect(interfaceScript).toContain("'تم حفظ القائمة المتكررة وظهرت أعلى الروشتة.': 'Recurring list saved and now available above the prescription.'");
    expect(interfaceScript).toContain("'يرجى اختيار أو كتابة تشخيص طبي واحد على الأقل أولاً': 'Please select or enter at least one clinical diagnosis first.'");
    expect(interfaceScript).toContain("'حدث خطأ غير متوقع أثناء الحفظ:': 'An unexpected error occurred while saving:'");
    expect(interfaceScript).toContain('normalized.startsWith(source)');
    expect(interfaceScript).toContain("new URLSearchParams(window.location.search).get('lang')");
  });

  it("يحافظ على المصطلحات والاختصارات الطبية الإنجليزية المعيارية", () => {
    const clinicalTerms = {
      "ضغط الدم": "Blood Pressure (BP)",
      "النبض": "Heart Rate (HR)",
      "معدل التنفس": "Respiratory Rate (RR)",
      "تشبع الأكسجين": "Oxygen Saturation (SpO₂)",
      "مؤشر كتلة الجسم": "Body Mass Index (BMI)",
      "صورة دم كاملة CBC": "Complete Blood Count (CBC)",
      "سكر تراكمي HbA1c": "Glycated Haemoglobin (HbA1c)",
      "أشعة مقطعية CT": "Computed Tomography (CT)",
      "رنين مغناطيسي MRI": "Magnetic Resonance Imaging (MRI)",
      "تخطيط القلب": "Electrocardiogram (ECG)",
      "الوصفة الطبية": "Medical Prescription (Rx)",
      "ارتفاع ضغط الدم": "Hypertension (HTN)",
      "السكري - النوع الثاني": "Type 2 Diabetes Mellitus (T2DM)",
      "عند اللزوم / الحاجة": "As needed (PRN)",
      "قبل الأكل بربع ساعة": "15 minutes before meals (AC)",
      "بعد الأكل مباشرة": "Immediately after meals (PC)",
    };
    for (const [arabic, english] of Object.entries(clinicalTerms)) {
      expect(interfaceScript).toContain(`'${arabic}': '${english}'`);
    }
  });

  it("يترجم الرسائل والعناصر الديناميكية ووحدات العملة دون المساس ببيانات المريض", () => {
    const dynamicTerms = {
      "حذف تحصيل": "Delete collection",
      "حذف ملف": "Delete record",
      "إزالة": "Remove",
      "، روشتات": ", prescriptions",
      "، زيارات": ", visits",
      "، فواتير": ", invoices",
    };
    for (const [arabic, english] of Object.entries(dynamicTerms)) {
      expect(interfaceScript).toContain(`'${arabic}': '${english}'`);
    }
    expect(interfaceScript).toContain("const inlineReplacements = [");
    expect(interfaceScript).toContain("{ source: ' ج.م', replacement: ' EGP' }");
    expect(interfaceScript).toContain("{ source: ' جنيه', replacement: ' EGP' }");
    expect(interfaceScript).toContain("result.replaceAll(source, replacement)");
  });

  it("يستبدل الأبيض الناصع بنهاري هادئ ويوضح القراءة على ليل أعمق", () => {
    expect(page).toContain('soli-interface-enhancements.css');
    expect(interfaceStyles).toContain('--soli-day-canvas: #e8eef2');
    expect(interfaceStyles).toContain('--soli-day-surface: #f4f7f8');
    expect(interfaceStyles).toContain('--soli-night-canvas: #020711');
    expect(interfaceStyles).toContain('--soli-night-text: #f5f8fc');
    expect(interfaceStyles).toContain('html.dark .dark\\:text-white { color: #fbfdff !important; }');
  });
});
