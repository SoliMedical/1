/*
 * إعداد Firebase العام لبيئة Soli Medical Sync الجديدة.
 * هذه القيم مخصصة لتطبيق Web وللمصادقة والمزامنة فقط.
 * لا تضع كلمات مرور أو مفاتيح Admin SDK هنا؛ تلك المفاتيح تبقى في خادم موثوق خارج GitHub Pages.
 */
window.SOLI_FIREBASE_CONFIG = {
    apiKey: "AIzaSyDzrN5l8zZcgKZjbbvcHw-rh2DpW4XDWCE",
    authDomain: "soli-medical-sync.firebaseapp.com",
    projectId: "soli-medical-sync",
    storageBucket: "soli-medical-sync.firebasestorage.app",
    messagingSenderId: "674942739099",
    appId: "1:674942739099:web:d6f7d6a21f03e7122a5c3e"
};

// لا توجد بوابة Admin SDK مرتبطة بالمشروع الجديد ضمن نطاق الدخول والمزامنة الحالي.
// تبقى إدارة حسابات الموظفين معطلة حتى تُنشر بوابة موثوقة للمشروع الجديد.
window.SOLI_CLINIC_ACCOUNT_GATEWAY_URL = "";
