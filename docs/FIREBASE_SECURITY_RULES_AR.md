# قواعد أمان Firebase لعيادة Soli Medical

## مراجع التصميم

تعتمد القواعد المقترحة على وثيقة عضوية مرتبطة بمعرّف Firebase Auth حقيقي، وليس على الدور المحلي داخل المتصفح. تسمح قواعد Firestore باستخدام `get()` و`exists()` للتحقق من وثائق العضوية، لكن هذا يستهلك قراءات ويخضع لحدود استدعاءات الوصول؛ كما أن القواعد ليست مرشحات للاستعلامات. [1]

تستطيع قواعد Storage الرجوع إلى Firestore للتحقق من العضوية، لكنها تحتاج قاعدة Firestore الافتراضية، ويمكن أن تستهلك قراءة من Firestore لكل تقييم ذي صلة، مع حد أقصى لاستدعاء وثيقتين في التقييم. [2]

يحتوي `request.auth.uid` على هوية Firebase Authentication الموثوقة فقط. ولا تكفي كلمة مرور النظام أو الدور المخزن محلياً في المتصفح لتقييد قواعد Firebase. [3]

## الملفات المضافة إلى المشروع

| الملف | الغرض |
|---|---|
| `firestore.rules` | يقيّد الوثيقة القديمة ومسارات V2 وفق عضوية نشطة لكل عيادة، ويمنع حذف السجل الطبي والسجل التدقيقي من العميل. |
| `storage.rules` | يقيّد شعار العيادة بملكية عضو إداري نشط، ويقبل WebP أو PNG أو JPEG حتى 2 MiB، ويمنع حذف الشعار من المتصفح. |
| `firebase.json` | يربط أوامر Firebase CLI بملفي القواعد. |
| `server/firebaseSecurityRules.test.ts` | يتحقق محلياً من وجود حواجز العضوية، والمنع من الحذف، ومسارات النشر. |

## نموذج وثيقة العضوية

ينشئ مالك المشروع، من Firebase Console أو Admin SDK فقط، وثيقة واحدة لكل مستخدم Firebase Authentication في المسار التالي:

```text
clinics/shared-clinic-v1/members/{firebaseUid}
```

ويكون الحد الأدنى للبيانات:

```json
{
  "status": "active",
  "role": "owner",
  "createdAt": "2026-08-21T00:00:00.000Z",
  "createdBy": "bootstrap-admin"
}
```

الأدوار المدعومة هي `owner` و`admin` و`clinician` و`assistant`. يستطيع المالكان والمديرون إدارة الإعدادات وقوالب القوائم وتقارير الترحيل؛ بينما يستطيع الفريق الطبي النشط فقط إنشاء وتعديل البيانات السريرية. لا تمنح القواعد أي عميل القدرة على إنشاء عضويته أو تغيير دوره أو حذف السجل الطبي.

## قيد مهم للمصادقة الحالية

يستخدم الإصدار الحالي من التطبيق `signInAnonymously()` لمزامنة Firebase، مع تسجيل دخول محلي منفصل. لذلك لا يمكن تفعيل القواعد الحية بأمان قبل ربط كل جهاز بهوية Firebase ثابتة وتسجيل `firebaseUid` في وثيقة العضوية. تسجيل الخروج من Firebase ينشئ هوية مجهولة جديدة لاحقاً وقد يمنع الجهاز من الوصول، حتى يُضاف إلى العضوية مجدداً.

البديل الموصى به قبل النشر الحي هو تحويل حساب المالك والفريق إلى Firebase Authentication دائم، مثل البريد الإلكتروني وكلمة المرور أو مزود هوية مناسب، ثم إنشاء العضويات عبر خادم موثوق. لا تعتمد القواعد على كلمة مرور النظام المحفوظة محلياً؛ إذ لا يمكن اعتبارها إثبات هوية عند Firebase.

## قيود التنفيذ

لا تُنشر القواعد الحية من هذا المشروع تلقائياً. يجب أولاً إنشاء وثيقة العضوية `clinics/{clinicId}/members/{firebaseUid}` بواسطة حساب مالك موثوق أو مسار خادمي محمي، ثم اختبار الدخول وإنشاء السجلات ورفع الشعار في بيئة Firebase اختبارية قبل النشر الحي.

بعد تجهيز هوية Firebase دائمة وعضوية اختبارية، تكون أوامر النشر المقترحة:

```bash
firebase use clinic1-ba255
firebase deploy --only firestore:rules,storage
```

يُنفَّذ ذلك من حساب Firebase المالك فقط وبعد اختبار القواعد؛ لا يُشغَّل تلقائياً من صفحة التطبيق أو من GitHub Pages.

## المراجع

[1]: https://firebase.google.com/docs/firestore/security/rules-conditions "Writing conditions for Cloud Firestore Security Rules"
[2]: https://firebase.google.com/docs/storage/security/rules-conditions "Use conditions in Firebase Cloud Storage Security Rules"
[3]: https://firebase.google.com/docs/rules/rules-and-auth "Firebase Security Rules and Firebase Authentication"
