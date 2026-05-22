# Benchmark Report — 2026-05-21T11:48:02.513Z

| Status | Test | Duration | Error |
|--------|------|----------|-------|
| ❌ | 100 concurrent .trigger.tmp writes | 69ms | 100 tmp files not cleaned |
| ✅ | trigger rename collision: 50 simultaneous | 67ms | - |
| ✅ | daemon trigger mechanism functional | 683ms | - |
| ✅ | execHidden all git calls safe | 1ms | - |
| ✅ | spawn windowsHide verified | 11ms | - |

**Passed: 4/5**
**Failed: 1**