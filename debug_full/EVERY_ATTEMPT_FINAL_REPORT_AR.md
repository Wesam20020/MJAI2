# تقرير الإصلاح النهائي لنظام الأسئلة - Every Attempt Fix

## الهدف
المطلوب أن يعمل نظام الأسئلة لأي عدد من المحاولات:

- المحاولة الحالية تعرض أسئلة فورًا ولا تنتظر OpenAI.
- المحاولة التالية تكون جاهزة قدر الإمكان.
- إذا تأخر OpenAI أو فشل، لا يعلق المستخدم ولا تضيع الجلسة.
- إذا وصل OpenAI لاحقًا، يحسن/يستبدل النسخة المحلية الجاهزة.

## الإصلاح الأساسي الجديد
تمت إضافة نظام **Instant Local Prepared Backup**:

1. بعد إرسال أي أسئلة للمستخدم، الباكند يبدأ تجهيز المحاولة القادمة.
2. أول خطوة الآن ليست OpenAI، بل تجهيز set محلي جاهز فورًا باسم:
   `instant-local-prepared`
3. بعدها يبدأ OpenAI في الخلفية.
4. لو OpenAI نجح، يحفظ set أفضل باسم:
   `openai-prepared` أو `hybrid-openai-local-prepared`
   ويجعل النسخة المحلية الاحتياطية `expired`.
5. لو المستخدم فتح المحاولة التالية قبل أن ينتهي OpenAI، سيجد set محلي جاهز بدل أن يعلق أو يرجع لخطأ.

## معنى هذا عمليًا
الفلو أصبح:

Session 1:
- تعرض local أو prepared بسرعة.
- يتم إنشاء instant-local-prepared فورًا للمحاولة 2.
- OpenAI يحاول تحسينها بالخلفية.

Session 2:
- تستخدم أفضل READY set موجود.
- إذا OpenAI جهز set، تستخدمه.
- إذا OpenAI لم يجهز بعد، تستخدم instant-local-prepared.
- بعدها يتم تجهيز محاولة 3 بنفس الطريقة.

Session 3, 4, 5...:
- نفس النظام دائمًا.

## أهم الملفات المعدلة
- `BACEND/routes/questionRoutes.js`

## تعديلات مهمة داخل questionRoutes.js
- `getReadyPreparedQuestionSet` أصبح يفضل AI/hybrid sets على instant-local sets.
- تمت إضافة `ensureImmediateLocalPreparedSet`.
- `prepareNextSessionQuestionsInBackground` أصبح يضمن local backup حتى لو OpenAI job قيد التشغيل.
- `prepareNextSessionQuestionSet` لم يعد يتوقف بسبب وجود `instant-local-prepared`; يسمح لـ OpenAI بتبديلها لاحقًا.
- `savePreparedQuestionSet` عندما يحفظ AI/hybrid set يجعل instant-local القديمة expired.

## إعدادات env المقترحة
في `BACEND/.env`:

```env
OPENAI_TIMEOUT_MS=180000
RECOMMENDATION_TIMEOUT_MS=15000
SQLITE_BUSY_TIMEOUT_MS=10000
```

## رسائل اللوج المتوقعة
عندما يجهز backup محلي:

```text
[questions] Instant local prepared set is ready for user X; AI can upgrade it in the background.
```

عندما يجهز OpenAI/hybrid:

```text
[questions] Prepared next-session hybrid-openai-local-prepared question set for user X
```

عند استخدام set جاهز:

```text
[questions] Loaded READY prepared set N for user X as prepared-next-session.
```

## نتيجة الفحص
- Backend JS syntax check: OK
- Frontend JS/JSX syntax check: OK
- المشروع لا يعتمد على انتظار OpenAI في GET /api/questions.
