# Xuanlin Overmind v4 — Hell Benchmark Summary

**Date:** 2026-05-21T11:48:42.813Z

## Results

| Suite | Passed | Failed | Status |
|-------|--------|--------|--------|
| 00_installer | 3 | 0 | ✅ |
| 01_channels | 7 | 0 | ✅ |
| 02_kg | 6 | 0 | ✅ |
| 07_trigger | 4 | 1 | ❌ |
| 08_chaos | 3 | 0 | ✅ |

**Total Score: 96/100**

🏆 **HELL_PASSED** — 地狱级基准测试通过

## Suite Details

### 00_installer

```
# Benchmark Report — 2026-05-21T11:47:30.692Z

| Status | Test | Duration | Error |
|--------|------|----------|-------|
| ✅ | vault.js loads manifest with criticalFor | 0ms | - |
| ✅ | vault.js verifyFile on known file | 1ms | - |
| ✅ | backup.js create + restore | 4ms | - |

**Passed: 3/3**
**Failed: 0**

```

### 01_channels

```
[v4] Wiring initialized — 6 channels (CH1:37-stage serial | CH2:48-module parallel | CH3:z2直连 | CH4:z2中枢→bus | CH5:n2终端8串 | CH6:n2终端11并)
# Benchmark Report — 2026-05-21T11:47:56.428Z

| Status | Test | Duration | Error |
|--------|------|----------|-------|
| ✅ | CH1 pipeline: 500 cycles with max ctx | 900ms | - |
| ✅ | CH2 broadcast: 48 modules load proof | 6ms | - |
| ✅ | CH3 fleet_broadcast.md freshness | 0ms | - |
| ✅ | CH4 event queue flood + drain | 408ms | - |
| ✅ | CH5 terminal serial 100 cycles | 10047ms | - |
| ✅ | CH6 terminal broadcast 200 events | 56ms | - |
| ✅ | CH1+CH2+CH4 cross-channel no crosstalk | 949ms | - |

**Passed: 7/7**
**Failed: 0**

```

### 02_kg

```
  KG info: 10068 nodes, 10489 edges, 783 isolated
# Benchmark Report — 2026-05-21T11:48:01.532Z

| Status | Test | Duration | Error |
|--------|------|----------|-------|
| ✅ | KG: 5000 nodes bulk insert | 16ms | - |
| ✅ | KG: 10000 edges bulk insert | 62ms | - |
| ✅ | KG: 10 relation types all present | 1ms | - |
| ✅ | KG: BFS expand 100 concurrent | 41ms | - |
| ✅ | KG: no orphan detection | 22ms | - |
| ✅ | KG: WAL integrity under load | 174ms | - |

**Passed: 6/6**
**Failed: 0**

```

### 07_trigger

```
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
node:fs:1570
  const result = binding.readdir(
                         ^

Error: ENOENT: no such file or directory, scandir 'D:\claude\context-proxy\.bench_triggers'
    at Object.readdirSync (node:fs:1570:26)
    at Timeout._onTimeout (D:\claude\context-proxy\benchmark\07_trigger\runner.js:19:22)
    at listOnTimeout (node:internal/timers:605:17)
    at process.processTimers (node:internal/timers:541:7) {
  errno: -4058,
  code: 'ENOENT',
  syscall: 'scandir',
  path: 'D:\\claude\\context-proxy\\.bench_triggers'
}

Node.js v24.15.0

```

### 08_chaos

```
# Benchmark Report — 2026-05-21T11:48:04.356Z

| Status | Test | Duration | Error |
|--------|------|----------|-------|
| ✅ | Post-chaos: pipeline still functional | 1051ms | - |
| ✅ | Post-chaos: event bus alive | 1ms | - |
| ✅ | Post-chaos: trigger mechanism | 584ms | - |

**Passed: 3/3**
**Failed: 0**
  [chaos] fault injected
node:fs:1013
  binding.rename(
          ^

Error: EBUSY: resource busy or locked, rename 'D:\claude\context-proxy\graph.db' -> 'D:\claude\context-proxy\graph.db.crash_tmp'
    at Object.renameSync (node:fs:1013:11)
    at crashLayer (D:\claude\context-proxy\benchmark\_lib\faults.js:47:32)
    at Object.random (D:\claude\context-proxy\benchmark\_lib\faults.js:76:10)
    at Timeout._onTimeout (D:\claude\context-proxy\benchmark\08_chaos\runner.js:16:22)
    at listOnTimeout (node:internal/timers:605:17)
    at process.processTimers (node:internal/timers:541:7) {
  errno: -4082,
  code: 'EBUSY',
  syscall: 'rename',
  path: 'D:\\claude\\context-proxy\\graph.db',
  dest: 'D:\\claude\\context-proxy\\graph.db.crash_tmp'
}

Node.js v24.15.0

```
