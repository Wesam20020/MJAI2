# إصلاح تعليق المحاولة الثانية وعدم ظهور الأسئلة الجديدة

## السبب
بعد أن يطبع الباكند:

```text
Prepared next-session hybrid-openai-local-prepared question set for user X
```

هذا يعني أن الأسئلة الجاهزة تم حفظها. لكن عند فتح المحاولة الثانية كان `GET /api/questions` يعيد فحص الـ prepared set ضد تاريخ المستخدم الجديد ويعمل repair إذا تغير التاريخ. هذا جعل الطلب يتأخر، والفرونت يلغي الطلب بعد `VITE_QUESTION_REQUEST_TIMEOUT_MS` فتظهر الرسالة:

```text
The request took too long. Please make sure the backend is returning local questions immediately and try again.
```

## الإصلاح
تم تعديل `BACEND/routes/questionRoutes.js` بحيث:

1. عند وجود READY prepared set يستخدمه بسرعة ولا يعيد فحصه ضد history جديد.
2. يكتفي بفحص safety داخلي سريع: العدد، التصنيفات، التكرار الداخلي، والتشابه الداخلي.
3. لو الـ prepared set نفسه تالف فقط، يعمل repair سريع أو يعلّمه invalid ويعود للـ local fallback.
4. أضيف log واضح عند الاستخدام:

```text
[questions] Loaded READY prepared set <id> for user <id> as prepared-next-session.
```

## المتوقع بعد التشغيل
- أول محاولة: `mode: fast-adaptive`
- أثناءها يتم تجهيز الجلسة القادمة.
- المحاولة الثانية: `mode: prepared-next-session`
- بعدها يجهز للجلسة الثالثة بنفس الطريقة.

## ملاحظة
إذا ظهر:

```text
OpenAI request timed out...
```

فهذا لا يمنع الموقع من العمل. معناه أن أسئلة AI لم تصل في الوقت المحدد، والنظام سيكمل من local fallback ويحفظ set جاهز.
