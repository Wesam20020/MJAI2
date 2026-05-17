# تقرير تعديل سرعة OpenAI للنتائج والشات والكورسات

## المشكلة
اختبار OpenAI المباشر من PowerShell رجع `OK` خلال حوالي ثانيتين، لذلك المفتاح والاتصال يعملان. سبب الـ fallback داخل التطبيق كان أن طلبات النتائج والشات والكورسات تطلب مخرجات طويلة أو prompts كبيرة، فتتجاوز timeouts مثل 30000ms.

## التعديلات
تم تعديل `BACEND/services/openaiService.js` بحيث:

- `callOpenAI` يدعم `maxTokens` و `timeoutMs` لكل نوع طلب.
- AI recommendation يستخدم `RECOMMENDATION_MAX_TOKENS=750` افتراضيًا.
- AI chat يستخدم `CHAT_MAX_TOKENS=420` افتراضيًا.
- AI course content يستخدم `COURSE_CONTENT_MAX_TOKENS=850` افتراضيًا.
- prompts الخاصة بالنتائج والكورسات أصبحت مختصرة.
- chat history تم تقليله إلى آخر 3 رسائل فقط، مع قص النصوص الطويلة.
- كل route صار يقطع طلب OpenAI نفسه عند timeout بدل أن يستمر في الخلفية بعد رجوع fallback.

## ملفات تم تعديلها
- `BACEND/services/openaiService.js`
- `BACEND/routes/resultRoutes.js`
- `BACEND/routes/chatRoutes.js`
- `BACEND/routes/coursesRoutes.js`
- `BACEND/.env.example`

## القيم المقترحة في BACEND/.env
```env
OPENAI_TIMEOUT_MS=180000
RECOMMENDATION_TIMEOUT_MS=30000
CHAT_TIMEOUT_MS=30000
COURSE_CONTENT_TIMEOUT_MS=30000
SQLITE_BUSY_TIMEOUT_MS=10000
RECOMMENDATION_MAX_TOKENS=750
CHAT_MAX_TOKENS=420
COURSE_CONTENT_MAX_TOKENS=850
```

## الاختبارات التي تم تنفيذها
- Backend syntax check لكل ملفات JavaScript: OK.
- fallback test بدون API key: OK، يرجع نتائج fallback فورًا.
- mock OpenAI test: OK.
  - Recommendation request يرسل `max_tokens=750`.
  - Chat request يرسل `max_tokens=420`.
  - Courses request يرسل `max_tokens=850`.
  - prompts أصبحت أقصر بكثير.

## ملاحظة
لم يتم تنفيذ اختبار Live OpenAI من داخل بيئة ChatGPT لأن مفتاحك غير موجود هنا. لكن اختبارك أنت على PowerShell أثبت أن المفتاح سريع وصحيح، وهذا التعديل يعالج ثقل prompts داخل التطبيق.
