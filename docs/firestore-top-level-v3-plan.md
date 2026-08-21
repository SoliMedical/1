# مخطط Firestore بالمجموعات العليا — Medicenter V3

## الهدف

يعرض Firebase Console الأقسام التشغيلية مباشرة في المستوى الأعلى، بالشكل الذي طلبه الطبيب، بدلاً من إبقائها مجموعات فرعية تحت `clinics/shared-clinic-v1`. لا يعني هذا أن كل صفحة واجهة تحتاج مجموعة باسمها؛ فاللوحة والتقارير والمتابعة صفحات مشتقة من سجلات مرضى وزيارات ومواعيد وفواتير موجودة بالفعل.

تحتفظ كل وثيقة بحقل `clinicId: "shared-clinic-v1"`. يحافظ هذا الحقل على عزل بيانات العيادة ويمنع تعارض المعرّفات إذا أضيفت عيادة أخرى مستقبلاً، بينما تبقى أسماء المجموعات ظاهرة وسهلة المراجعة في عمود Firebase Console الأيسر.

## الشجرة المستهدفة

```text
patients/{clinicId}__{patientId}
visits/{clinicId}__{visitId}
appointments/{clinicId}__{appointmentId}
invoices/{clinicId}__{invoiceId}
prescriptions/{clinicId}__{prescriptionId}
expenses/{clinicId}__{expenseId}
waitingQueue/{clinicId}__{queueId}
auditLogs/{clinicId}__{auditId}
archiveManifests/{clinicId}__{archiveId}
clinicSettings/{clinicId}__general
clinicCatalogs/{clinicId}__clinical
clinicCatalogs/{clinicId}__templates
migrationManifests/{clinicId}__{migrationId}

clinics/{clinicId}                         ← بيانات وصفية وحالة الترحيل فقط
soliMedicalApp/sharedClinicData            ← نسخة الاسترداد القديمة فقط
```

| قسم التطبيق | مجموعة المستوى الأعلى | ملاحظة الاستهلاك |
|---|---|---|
| المرضى والملفات الطبية | `patients` | قراءة ملف المريض لا تسحب المرضى الآخرين. |
| الزيارات | `visits` | الزيارة منفصلة عن ملف المريض وقابلة للفهرسة. |
| المواعيد والانتظار | `appointments` و`waitingQueue` | لا تُكتب قائمة يوم كامل في وثيقة واحدة. |
| الفواتير والمصروفات | `invoices` و`expenses` | قيود مالية مستقلة قابلة للتقرير. |
| الروشتات | `prescriptions` | روشتة مستقلة عن الزيارة وقوالبها. |
| التدقيق والأرشفة | `auditLogs` و`archiveManifests` | سجلات متنامية لا تضخم الإعدادات. |
| الإعدادات والقوائم | `clinicSettings` و`clinicCatalogs` | ثلاث وثائق مرجعية صغيرة فقط، وليست بيانات طبية. |

## انتقال غير مدمر

ينشئ برنامج إداري جديد نسخة V3 من مخطط V2 المتحقق، ثم يقارن الأعداد ومعرّفات السجلات قبل اعتماد الحالة. لا ينفذ أي حذف في `clinics/shared-clinic-v1` أو `soliMedicalApp/sharedClinicData`، ولا يغير طريقة تسجيل الدخول المحلي أو نسخة العمل دون اتصال. بعد الاعتماد فقط يقرأ التطبيق ويكتب إلى مجموعات المستوى الأعلى، مع بقاء V2 والوثيقة القديمة قابلتين للاسترداد.

> **لا تُنشأ مجموعات باسم Dashboard أو Reports أو FollowUps.** هذه واجهات حسابية تستمد بياناتها من المجموعات السابقة؛ نسخ نتائجها سيزيد القراءات والكتابات بدلاً من تخفيضها.
