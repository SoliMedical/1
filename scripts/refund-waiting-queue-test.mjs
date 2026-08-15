import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../client/index.html', import.meta.url), 'utf8');
const start = html.indexOf("document.addEventListener('alpine:init'");
const end = html.indexOf('</script>', start);
if (start < 0 || end < 0) throw new Error('تعذر العثور على شيفرة التطبيق المضمنة.');

let appFactory;
const alerts = [];
const confirmations = [];
let confirmResult = true;
const localStorageData = new Map();
const sandbox = {
  Alpine: { data: (_name, factory) => { appFactory = factory; } },
  document: { addEventListener: (_event, callback) => callback() },
  window: { SOLI_FIREBASE_CONFIG: null, addEventListener: () => {}, matchMedia: () => ({ matches: false }) },
  localStorage: { getItem: key => localStorageData.get(key) ?? null, setItem: (key, value) => localStorageData.set(key, String(value)), removeItem: key => localStorageData.delete(key) },
  alert: message => alerts.push(String(message)),
  confirm: message => { confirmations.push(String(message)); return confirmResult; },
  console,
  setTimeout,
  clearTimeout,
  Date,
  JSON,
  Math,
};

vm.runInNewContext(`const isFirebaseConfigured = false;\n${html.slice(start, end)}`, sandbox, { filename: 'soli-inline-app.js' });
if (!appFactory) throw new Error('تعذر تحميل نموذج بيانات التطبيق.');

function newApp() {
  const app = appFactory();
  app.invoices = [];
  app.waitingQueue = [];
  app.appointments = [];
  app.auditLogs = [];
  app.persisted = 0;
  app.synced = 0;
  app.persistState = () => { app.persisted += 1; };
  app.queueCloudSync = () => { app.synced += 1; };
  app.recordAudit = (...entry) => { app.auditLogs.push(entry); };
  return app;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const app = newApp();
const linkedItem = { id: 'WQ-100', invoiceId: 'INV-100', patientId: 'P-100', patientName: 'دينا رمضان', createdAt: '2026-08-15T09:00:00.000Z', appointmentId: 'APT-100', status: 'waiting' };
app.waitingQueue = [linkedItem];
app.invoices = [
  { id: 'INV-100', waitingQueueId: 'WQ-100', patientId: 'P-100', patientName: 'دينا رمضان', serviceName: 'رسوم كشف طبي', amount: 350, discount: 0, tax: 0, total: 350, status: 'مدفوعة', date: '2026-08-15' },
  { id: 'INV-OTHER', patientId: 'P-OTHER', patientName: 'مريض آخر', serviceName: 'رسوم كشف طبي', amount: 200, total: 200, status: 'مدفوعة', date: '2026-08-15' },
];
app.appointments = [{ id: 'APT-100', status: 'waiting' }];
assert(app.removeWaitingWithPaymentRefund(linkedItem, 'إزالة') === true, 'يجب قبول إزالة البطاقة بعد التأكيد.');
assert(app.waitingQueue.length === 0, 'يجب حذف بطاقة الانتظار فقط.');
assert(app.invoices.length === 1 && app.invoices[0].id === 'INV-OTHER', 'يجب حذف التحصيل المرتبط فقط والإبقاء على بقية الفواتير.');
assert(app.appointments[0].status === 'cancelled', 'يجب تحديث الموعد المرتبط إلى ملغي.');
assert(confirmations[0]?.includes('استرداد مبلغ'), 'يجب أن توضح رسالة التأكيد قيمة الاسترداد.');
assert(alerts[0]?.includes('استرداد'), 'يجب تأكيد تنفيذ الاسترداد للمستخدم.');

const legacyApp = newApp();
const legacyItem = { id: 'WQ-LEGACY', patientId: 'P-LEGACY', patientName: 'مريض قديم', createdAt: '2026-08-15T09:00:00.000Z', status: 'waiting' };
legacyApp.waitingQueue = [legacyItem];
legacyApp.invoices = [{ id: 'INV-LEGACY', patientId: 'P-LEGACY', patientName: 'مريض قديم', source: 'waiting_checkin', serviceName: 'رسوم كشف طبي', amount: 300, total: 300, status: 'مدفوعة', date: '2026-08-15' }];
assert(legacyApp.removeWaitingWithPaymentRefund(legacyItem, 'إلغاء') === true, 'يجب دعم البيانات القديمة غير المرتبطة بمعرف مباشر.');
assert(legacyApp.invoices.length === 0, 'يجب استرداد تحصيل الزيارة القديمة المطابق للمريض والتاريخ.');

const completedApp = newApp();
const completedItem = { id: 'WQ-COMPLETE', invoiceId: 'INV-COMPLETE', patientId: 'P-COMPLETE', patientName: 'مريض مكتمل', status: 'waiting' };
completedApp.waitingQueue = [completedItem];
completedApp.invoices = [{ id: 'INV-COMPLETE', waitingQueueId: 'WQ-COMPLETE', patientId: 'P-COMPLETE', amount: 500, total: 500, status: 'مدفوعة', date: '2026-08-15' }];
completedApp.setWaitingStatus(completedItem, 'completed');
assert(completedApp.invoices.length === 1, 'إكمال الكشف يجب ألا يسترد أو يحذف التحصيل.');

const declinedApp = newApp();
const declinedItem = { id: 'WQ-DECLINED', invoiceId: 'INV-DECLINED', patientId: 'P-DECLINED', patientName: 'مريض متراجع', status: 'waiting' };
declinedApp.waitingQueue = [declinedItem];
declinedApp.invoices = [{ id: 'INV-DECLINED', waitingQueueId: 'WQ-DECLINED', amount: 250, total: 250, status: 'مدفوعة', date: '2026-08-15' }];
confirmResult = false;
const selectElement = { value: 'cancelled' };
declinedApp.setWaitingStatus(declinedItem, 'cancelled', selectElement);
assert(declinedApp.waitingQueue.length === 1 && declinedApp.invoices.length === 1, 'رفض التأكيد يجب أن يُبقي البطاقة والتحصيل كما هما.');
assert(selectElement.value === 'waiting', 'رفض التأكيد يجب أن يعيد القائمة المنسدلة إلى الحالة السابقة.');

console.log('اختبار استرداد تحصيل قائمة الانتظار: ناجح');
