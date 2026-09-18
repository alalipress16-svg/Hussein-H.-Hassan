# تشغيل النسخة الحالية

## 1) Supabase
المشروع الصحيح: `buqbkxdebnobfhvtwgbj`

من Supabase:
Authentication → Sign In / Providers → فعّل Anonymous Sign-Ins.

## 2) قاعدة البيانات
شغّل الملف:
`supabase/current_project_setup.sql`

هذا الملف لا يحذف الجداول الحالية ولا البيانات الموجودة.

## 3) ضبط الرمز السري
بعد تشغيل الملف، نفّذ في SQL Editor سطرًا منفصلًا، مع كتابة الرمز الحقيقي مباشرة في SQL Editor فقط:

```sql
update public.app_secret
set code_hash = crypt('ضع-الرمز-الحقيقي-هنا', gen_salt('bf'))
where id = true;
```

لا تحفظ هذا السطر داخل المشروع ولا GitHub.

## 4) الاتصال
افتح `js/supabaseClient.js` وضع Publishable/Anon Key العامة للمشروع الصحيح بدل:
`PUT_YOUR_PUBLISHABLE_OR_ANON_KEY_HERE`

لا تستخدم service_role أو secret key.

## 5) الاختبار
1. افتح `index.html` عبر خادم محلي أو GitHub Pages، وليس `file://`.
2. انتظر إنشاء الجلسة.
3. أدخل الرمز السري.
4. جرّب قراءة الوارد.
5. أضف واردًا.
6. أضف مصروفًا.
7. أضف خدمة.
8. أضف صنف مخزون.
9. أضف طلب عمل.
10. أضف دفعة للطلب.
11. تحقق من المدفوع والمتبقي.
12. افتح البرنامج من جهاز آخر وأدخل الرمز نفسه.
