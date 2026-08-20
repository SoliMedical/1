# دليل مراجعة ترحيل Firebase وتخزين شعار العيادة وأرشفة السجلات

**المشروع:** Soli Medical / Medicenter PWA  
**الإصدار المرجعي:** v1.5.5  
**الحالة:** تصميم وكود مقترحان للمراجعة فقط. لا يغيّر هذا الدليل طريقة مزامنة التطبيق الحالية ولا ينقل أو يحذف بيانات أي عيادة.

> **قاعدة سلامة:** لا تُحذف بيانات المرضى أو الزيارات أو الروشتات تلقائياً. لا يبدأ أي ترحيل على بيانات فعلية قبل وجود نسخة احتياطية قابلة للتحقق، وتجربة ناجحة على بيانات اختبار، وموافقة صريحة من مالك العيادة.

## 1. المشكلة الحالية باختصار

تكتب النسخة الحالية جميع مفاتيح الحالة الدائمة في الوثيقة الواحدة:

```text
soliMedicalApp/sharedClinicData
```

وتتضمن هذه الوثيقة المرضى، وسجل الزيارات المضمّن داخل المريض، والمواعيد، والفواتير، والروشتات، والمصروفات، والقوائم المرجعية، والإعدادات، والشعار بصيغة Base64، وسجل التدقيق. عند تعديل عنصر واحد، يعيد `pushStateToCloud()` رفع اللقطة الكاملة من `persistentKeys`.

حد وثيقة Cloud Firestore الواحدة هو **1 MiB**؛ لذلك يعالج المخطط التالي كل سجل كبير بوثيقة مستقلة [1].

| الهدف | القرار المقترح | النتيجة |
|---|---|---|
| منع امتلاء الوثيقة | جعل المريض والزيارة والروشتة والموعد والفاتورة وثائق مستقلة | لا تؤثر زيارة واحدة في حجم جميع بيانات العيادة |
| تقليل مساحة الشعار | رفع الملف إلى Storage وحفظ الرابط فقط | لا يدخل Base64 في وثيقة Firestore |
| حماية السجل الطبي | لا حذف تلقائي لبطاقة مريض أو زيارة أو روشتة | يبقى التاريخ متاحاً للاسترجاع |
| تسريع القوائم اليومية | وسم الموعد القديم بـ `archivedAt` واستبعاده من العرض الافتراضي | تبقى الواجهة مركزة على السجلات النشطة |

## 2. نموذج البيانات المقترح

يستخدم كل عميل/عيادة معرّفاً ثابتاً باسم `clinicId`، ولا يعتمد على وثيقة مشتركة لجميع العيادات.

```text
clinics/{clinicId}                         ← تعريف العيادة الصغير فقط
clinics/{clinicId}/settings/general        ← الطبيب، الأسعار، اللغة، التفضيلات
clinics/{clinicId}/members/{uid}           ← دور المستخدم وحالة الوصول
clinics/{clinicId}/patients/{patientId}    ← بيانات المريض الأساسية
clinics/{clinicId}/appointments/{id}       ← موعد واحد لكل وثيقة
clinics/{clinicId}/visits/{id}             ← زيارة واحدة لكل وثيقة
clinics/{clinicId}/prescriptions/{id}      ← روشتة واحدة لكل وثيقة
clinics/{clinicId}/invoices/{id}           ← فاتورة واحدة لكل وثيقة
clinics/{clinicId}/expenses/{id}           ← مصروف واحد لكل وثيقة
clinics/{clinicId}/auditLogs/{id}          ← حدث واحد لكل وثيقة
clinics/{clinicId}/catalogs/{catalogName}  ← القوائم المرجعية الصغيرة فقط
clinics/{clinicId}/archiveManifests/{id}   ← فهرس الأرشيف وبيانات التحقق
```

| البيانات | ما يدخل الوثيقة | ما لا يدخلها |
|---|---|---|
| `patients/{patientId}` | الاسم، الهاتف، بيانات تعريف موجزة، الحالة، `lastVisitAt` | مصفوفة `records` الكاملة والروشتات والفواتير |
| `visits/{visitId}` | `patientId`، التاريخ، التشخيص، الملاحظات السريرية، العلامات الحيوية | سجل جميع زيارات المريض الأخرى |
| `prescriptions/{id}` | `patientId`، `visitId`، الأدوية والجرعات والطباعة | الروشتات الأخرى |
| `settings/general` | بيانات الطبيب وخيارات الطباعة والرابط `logoUrl` | شعار Base64 أو المرضى أو الفواتير |
| `catalogs/*` | التشخيصات والأدوية والقوالب والقوائم المتكررة | سجلات المرضى التشغيلية |

هذا التقسيم لا يعني أن كل البيانات تُحمّل عند فتح التطبيق. يجب قراءة الصفحة أو الفترة اللازمة فقط، مثل آخر 50 موعداً أو نتائج بحث المريض [2].

## 3. كود كتابة المريض والزيارة — Firebase Compat

يستخدم التطبيق الحالي Firebase `10.13.0` بواجهة Compat، ولذلك يتوافق المثال التالي معه. يجب إضافته كطبقة جديدة بعد موافقة واضحة، **ولا يستبدل** `pushStateToCloud()` دفعة واحدة.

```html
<!-- يضاف فقط عند اعتماد Firebase Storage في التنفيذ الفعلي -->
<script src="https://www.gstatic.com/firebasejs/10.13.0/firebase-storage-compat.js"></script>
```

```js
const db = firebase.firestore();
const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp;

function clinicCollection(clinicId, name) {
  if (!clinicId) throw new Error('clinicId مطلوب قبل الكتابة السحابية');
  return db.collection('clinics').doc(String(clinicId)).collection(name);
}

async function savePatientV2(clinicId, patient) {
  if (!patient?.id) throw new Error('معرّف المريض مطلوب');

  // لا تحفظ records هنا: كل زيارة تصبح وثيقة مستقلة.
  const { records, ...profile } = patient;
  await clinicCollection(clinicId, 'patients').doc(String(patient.id)).set({
    ...profile,
    searchName: String(patient.name || '').trim().toLowerCase(),
    lastVisitAt: patient.lastVisitAt || null,
    updatedAt: serverTimestamp(),
    schemaVersion: 2
  }, { merge: true });
}

async function saveVisitV2(clinicId, patientId, visit) {
  if (!visit?.id) throw new Error('معرّف الزيارة مطلوب');
  await clinicCollection(clinicId, 'visits').doc(String(visit.id)).set({
    ...visit,
    patientId: String(patientId),
    updatedAt: serverTimestamp(),
    schemaVersion: 2
  }, { merge: true });
}

async function savePrescriptionV2(clinicId, prescription) {
  if (!prescription?.id || !prescription?.patientId) {
    throw new Error('معرّف الروشتة والمريض مطلوبان');
  }
  await clinicCollection(clinicId, 'prescriptions').doc(String(prescription.id)).set({
    ...prescription,
    patientId: String(prescription.patientId),
    updatedAt: serverTimestamp(),
    schemaVersion: 2
  }, { merge: true });
}
```

> لا تستخدم رقم الهاتف أو الاسم كمعرّف وثيقة؛ استخدم `id` عشوائياً ثابتاً. ولا تعتمد على منع التعديل من الواجهة فقط؛ قواعد Firestore هي حارس الوصول الحقيقي.

### ترحيل تجريبي قابل للإعادة

المثال التالي يوضّح **شكل** ترحيل نسخة مصدّرة من البيانات القديمة. ينفّذ أولاً وضع المعاينة `dryRun`، ويعتمد `legacyId` و`migrationId` لتتبع السجل ومنع التكرار عند إعادة التشغيل. لا يُشغّل على بيانات إنتاجية قبل بناء تقرير مقارنة مستقل.

```js
function splitIntoChunks(items, size) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, index * size + size)
  );
}

function requiredLegacyId(value, label) {
  if (value === undefined || value === null || value === '') {
    throw new Error(`لا يمكن ترحيل ${label} دون معرّف ثابت.`);
  }
  return String(value);
}

async function migrateLegacyPatientsPreview({ clinicId, legacyState, migrationId, dryRun = true }) {
  const clinicRef = db.collection('clinics').doc(String(clinicId));
  const operations = [];

  for (const patient of legacyState.patients || []) {
    const patientId = requiredLegacyId(patient.id, 'المريض');
    const { records = [], ...profile } = patient;
    operations.push({
      ref: clinicRef.collection('patients').doc(patientId),
      data: { ...profile, legacyId: patientId, migrationId, schemaVersion: 2, updatedAt: serverTimestamp() }
    });

    for (const visit of records) {
      const visitId = requiredLegacyId(visit.id, `زيارة المريض ${patientId}`);
      operations.push({
        ref: clinicRef.collection('visits').doc(visitId),
        data: { ...visit, patientId, legacyId: visitId, migrationId, schemaVersion: 2, updatedAt: serverTimestamp() }
      });
    }
  }

  const report = { migrationId, dryRun, operations: operations.length };
  if (dryRun) return report;

  // 400 عملية هامش أمان دون الحد الأقصى للدفعة؛ تبقى العملية قابلة للاستئناف.
  for (const chunk of splitIntoChunks(operations, 400)) {
    const batch = db.batch();
    chunk.forEach(({ ref, data }) => batch.set(ref, data, { merge: true }));
    await batch.commit();
  }

  await clinicRef.collection('migrationRuns').doc(String(migrationId)).set({
    ...report,
    dryRun: false,
    status: 'completed',
    completedAt: serverTimestamp()
  }, { merge: true });

  return report;
}
```

تُطبّق التحويلات نفسها على `appointments` و`invoices` و`expenses` و`prescriptions` بعد تثبيت حقولها ومعرّفاتها في بيئة الاختبار. وتبقى الدفعات أصغر من الحد الأقصى لكتابات الدفعة الواحدة في Firestore [3].

## 4. كود مقترح لرفع شعار العيادة إلى Firebase Storage

### أ. المبدأ

بدلاً من حفظ `clinicLogoDataUrl` في Firestore كنص Base64، يرفع الملف إلى Storage، ثم تحفظ وثيقة الإعدادات فقط `logoUrl` و`logoPath`. تظل النسخة المحلية المؤقتة اختيارية للعرض دون اتصال، لكن لا تدخل لقطة Firestore.

```js
const storage = firebase.storage();

function assertLogoFile(file) {
  const allowed = ['image/png', 'image/jpeg', 'image/webp'];
  if (!file || !allowed.includes(file.type)) {
    throw new Error('اختر شعاراً بصيغة PNG أو JPEG أو WebP.');
  }
  if (file.size > 2 * 1024 * 1024) {
    throw new Error('حجم الشعار يجب ألا يتجاوز 2 MiB قبل الرفع.');
  }
}

async function uploadClinicLogoV2(clinicId, file) {
  assertLogoFile(file);
  const extension = file.name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
  const objectPath = `clinics/${clinicId}/branding/logo-${Date.now()}.${extension}`;
  const objectRef = storage.ref().child(objectPath);

  const snapshot = await objectRef.put(file, {
    contentType: file.type,
    cacheControl: 'private,max-age=86400'
  });
  const logoUrl = await snapshot.ref.getDownloadURL();

  await db.collection('clinics').doc(String(clinicId))
    .collection('settings').doc('general').set({
      branding: {
        logoUrl,
        logoPath: snapshot.ref.fullPath,
        logoUpdatedAt: serverTimestamp()
      },
      updatedAt: serverTimestamp(),
      schemaVersion: 2
    }, { merge: true });

  return { logoUrl, logoPath: snapshot.ref.fullPath };
}
```

### ب. الاستبدال والحذف

بعد التأكد من أن رابط الشعار الجديد حُفظ بنجاح وظهر في الواجهة، يمكن حذف الكائن السابق عبر `storage.ref(oldLogoPath).delete()`. لا تحذف القديم قبل نجاح الكتابة الجديدة، واحتفظ بسجل تدقيق يحوي المسار القديم والجديد. تعتمد صلاحية الرفع والقراءة على قواعد Storage، لا على إخفاء زر الرفع فقط [4].

## 5. قواعد وصول مبدئية — للمراجعة الأمنية

هذا مثال بنيوي فقط؛ يجب مراجعة قواعد الإنتاج واختبارها في Firebase Emulator قبل الاعتماد:

```firestore
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function memberPath(clinicId) {
      return /databases/$(database)/documents/clinics/$(clinicId)/members/$(request.auth.uid);
    }
    function isActiveMember(clinicId) {
      return request.auth != null &&
        exists(memberPath(clinicId)) &&
        get(memberPath(clinicId)).data.active == true;
    }
    match /clinics/{clinicId}/{document=**} {
      allow read, write: if isActiveMember(clinicId);
    }
  }
}
```

قواعد Storage يجب أن تقيد المسار `clinics/{clinicId}/branding/*` بالعضو النشط في العيادة المقابلة. لا تستخدم قاعدة تسمح لأي مستخدم مسجل بقراءة بيانات كل العيادات.

## 6. ضمان العمل دون اتصال أثناء الانتقال

حفظ البيانات محلياً أولاً ميزة أساسية في التطبيق، ولذلك لا يجوز تحويل الكتابة إلى Firestore مباشرة أو استبدال `pushStateToCloud()` فجأة. عند تنفيذ المخطط فعلياً، يلزم طابور عمليات محلي قابل لإعادة الإرسال يسجّل العملية ذاتها، مثل «إنشاء زيارة» أو «تعديل موعد»، قبل أي طلب سحابي. ثم تُرسل العملية عند عودة الشبكة وتُعلَّم بالنجاح أو الفشل من دون إنشاء نسخة ثانية.

| اختبار إلزامي | النتيجة المقبولة |
|---|---|
| إنشاء مريض وزيارة دون شبكة | تبقيان ظاهرين محلياً بعد إغلاق التطبيق وفتحه |
| استعادة الشبكة | ترسل كل عملية مرة واحدة وتظهر في وثائق v2 الصحيحة |
| تحديث جهازين | تظهر حالة تعارض قابلة للمراجعة ولا يحذف أي طرف بيانات الطرف الآخر تلقائياً |
| عطل أثناء الترحيل | تبقى الوثيقة القديمة صالحة للقراءة، ويمكن استئناف العملية من `migrationId` |

## 7. خطة ترحيل آمنة من الوثيقة القديمة

1. **نسخة احتياطية قابلة للتحقق:** تصدير `sharedClinicData` محلياً وسحابياً مع عدد المرضى والزيارات والفواتير وروشتات التجميع و`sha256` للملف.
2. **مشروع اختبار:** تطبيق النموذج الجديد على نسخة مجهولة الهوية من البيانات؛ لا تبدأ ببيانات إنتاجية.
3. **ترحيل تجريبي فقط:** يحول كل مريض إلى وثيقة، ثم `records` إلى زيارات منفصلة، ثم الروشتات والفواتير والمواعيد. يكتب حقل `migrationId` و`legacyId` لكل سجل كي تكون العملية قابلة للإعادة دون تكرار.
4. **دفعات صغيرة:** لا تجمع أكثر من 400 عملية كتابة في دفعة واحدة، وسجل تقريراً بعد كل دفعة ناجحة.
5. **تحقق بالمقارنة:** قارن الأعداد والمبالغ والمعرفات قبل وبعد، ولا تستبدل القراءة القديمة بعد وجود تطابق كامل.
6. **قراءة مزدوجة مؤقتة:** اقرأ المخطط الجديد أولاً، ثم ارجع للقديم عند عدم وجود `schemaVersion: 2`، مع إبقاء الوثيقة القديمة للقراءة فقط خلال فترة مراجعة متفق عليها.
7. **إيقاف قديم صريح:** لا تحذف الوثيقة القديمة تلقائياً. يلزم نسخ احتياطي وفحص واستحصال موافقة مكتوبة قبل الحذف النهائي.

## 8. استراتيجية أرشفة آمنة

### ما الذي يؤرشف؟

لا تؤرشف بطاقة المريض لمجرد عدم وجود زيارة، ولا تحذف السجل الطبي تلقائياً. الأرشفة تستهدف عناصر العرض اليومي المكتملة: المواعيد المنتهية أو الملغاة، سجلات التدقيق القديمة، ونسخ PDF أو المرفقات الكبيرة بعد انتهاء فترة الاحتفاظ التي يحددها الطبيب والقانون المحلي.

| الطبقة | بعد كم؟ | الإجراء | هل يحذف؟ |
|---|---:|---|---|
| قائمة المواعيد اليومية | 6 أشهر أو مدة تعتمدها العيادة | وضع `archivedAt` وإخفاؤها من العرض الافتراضي | لا |
| `waitingQueue` المؤقتة | 30 يوماً بعد الانتهاء | إضافة `expiresAt` واستخدام TTL فقط إن لم تكن سجلاً طبياً | بعد اعتماد صريح |
| سجل التدقيق | 12 شهراً مقترحاً | تصدير شهري محكم مع فهرس وتحقق | لا تلقائياً |
| الزيارات والروشتات | حسب سياسة الطبيب والاستشارة القانونية | أرشفة عرض فقط أو تصدير قابل للاستعادة | لا تلقائياً |
| صور وشعار ومرفقات | عند الاستبدال أو انتهاء سياسة الاحتفاظ | حذف فقط بعد تأكيد النسخة الجديدة أو اكتمال الأرشيف | وفق موافقة صريحة |

### سجل الأرشيف

كل أرشيف يجب أن ينشئ وثيقة `archiveManifests/{archiveId}` تحتوي: فترة السجلات، العدد، معرفات السجلات، من طلب الأرشفة، وقتها، سببها، مسار الملف المشفر، بصمة `sha256`، و`retentionUntil`. لا تنشئ عملية دورية للحذف دون موافقة صريحة وسياسة احتفاظ مكتوبة.

> **تمييز مهم:** وسم الوثيقة بـ `archivedAt` لا يخفض مساحة Firestore، لكنه يخفض حجم الاستعلامات والقوائم اليومية. أما خفض التخزين فعلياً فيتطلب تصديراً قابلاً للاستعادة وحذف النسخة التشغيلية لاحقاً؛ وهذا غير مسموح تلقائياً للبيانات الطبية. يمكن لسياسات TTL حذف وثائق مؤهلة بعد وقت محدد، لكنها ليست فورية ولا تناسب المرضى أو الزيارات أو الروشتات [5].

## 9. نقاط قرار قبل البرمجة الفعلية

1. هل ستكون المزامنة السحابية لكل عيادة في مشروع Firebase مستقل أم في مشروع SaaS واحد متعدد العيادات؟
2. ما المدة القانونية/الطبية التي يعتمدها الطبيب للاحتفاظ بالزيارات والروشتات؟ يجب تأكيدها قانونياً في مصر قبل حذف أي نسخة.
3. هل أرشيف Storage يشمل ملفات PDF فقط، أم ملفات JSON قابلة للاستعادة أيضاً؟
4. هل يتم الترحيل أولاً لعيادة اختبار واحدة ثم بقية العيادات؟

## المراجع

[1]: https://firebase.google.com/docs/firestore/quotas "Firebase — Cloud Firestore quotas"
[2]: https://firebase.google.com/docs/firestore/data-model "Firebase — Cloud Firestore data model"
[3]: https://firebase.google.com/docs/firestore/manage-data/transactions "Firebase — Transactions and batched writes"
[4]: https://firebase.google.com/docs/storage/web/upload-files "Firebase — Upload files with Cloud Storage on the web"
[5]: https://firebase.google.com/docs/firestore/ttl "Firebase — Manage data retention with TTL policies"
