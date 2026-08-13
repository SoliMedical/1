# ملاحظات مرجعية من Firebase الرسمية

## Email/Password Authentication

المصدر: https://firebase.google.com/docs/auth/web/password-auth

توضح وثائق Firebase أن تفعيل الحسابات البريدية يتم من Firebase Console عبر Security → Authentication → Sign-in method، ثم تفعيل Email/password والضغط على Save. كما توثق استخدام `createUserWithEmailAndPassword` لإنشاء الحساب و`signInWithEmailAndPassword` لتسجيل الدخول. آخر تحديث ظاهر في الصفحة: 2026-08-09 UTC.

## Cloud Firestore Security Rules

المصدر: https://firebase.google.com/docs/firestore/security/get-started

توضح وثائق Firebase أن طلبات عملاء الويب إلى Firestore تُقيَّم وفق قواعد الأمان، وأن شرط `request.auth != null` يقصر الوصول على المستخدم المصادق عليه. كما توصي باستخدام Authentication مع Rules لبناء تحكم قائم على المستخدم أو الدور، وتوفر Rules Simulator من تبويب Rules لاختبار الطلبات المصادق عليها وغير المصادق عليها. آخر تحديث ظاهر في الصفحة: 2026-08-10 UTC.
