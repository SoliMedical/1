import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const indexHtml = readFileSync(resolve(projectRoot, 'client/index.html'), 'utf8');
const localPlan = readFileSync(resolve(projectRoot, 'docs/LAUNCH_PLAN_MANSOURA_EGP.md'), 'utf8');
const implementationPlan = readFileSync(resolve(projectRoot, 'docs/SUBSCRIPTION_IMPLEMENTATION_AR.md'), 'utf8');

describe('صفحة تسعير Soli Medical', () => {
  it('توفّر مسار تسعير عاماً منفصلاً عن الحجز وتسجيل الدخول', () => {
    expect(indexHtml).toContain('const isPublicPricingUrl');
    expect(indexHtml).toContain("params.has('pricing')");
    expect(indexHtml).toContain('isPublicPricing: publicPricingMode');
    expect(indexHtml).toContain('!isPublicBooking && !isPublicPricing');
  });

  it('تعرض أسعار المنصورة المتفق عليها وتجربة بلا تحصيل آلي', () => {
    expect(indexHtml).toContain('250</span><span class="mb-2 text-sm font-bold text-slate-300">جنيه / شهر');
    expect(indexHtml).toContain('2,500</span><span class="mb-1 text-sm font-bold text-cyan-100">جنيه / سنة');
    expect(indexHtml).toContain('14 يوماً بلا بطاقة');
    expect(indexHtml).toContain('طلب التجربة والدفع لم يُفعّلا بعد');
    expect(localPlan).toContain('**250 جنيه/شهر**');
    expect(localPlan).toContain('**2,500 جنيه/سنة**');
  });

  it('يوثق أن الاشتراك الفعلي يحتاج تحققاً خادمياً وويب هوك موثقاً', () => {
    expect(implementationPlan).toContain('الخادم هو مصدر الحقيقة');
    expect(implementationPlan).toContain('Webhook موثق');
    expect(implementationPlan).toContain('لا حذف تلقائي لبيانات المرضى');
  });
});

