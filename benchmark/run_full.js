const fs=require("fs"),path=require("path"),{execSync}=require("child_process");
const ROOT=process.cwd();
const {Metrics,now}=require("./_lib/metrics");
const line=()=>console.log("");

console.log("XUANLIN OVERMIND v4 — FULL BENCHMARK");
console.log(new Date().toISOString());
line();

console.log("=== 1. MODULE LOADING ===");
const files=fs.readdirSync(".").filter(f=>f.endsWith(".js")&&!f.startsWith("."));
const skip=new Set(["install.js","inject.js","consolidate.js","extract_worker.js","seed_v3.js"]);
const metLoad=new Metrics();let loadSum=0;
for(const f of files){if(skip.has(f))continue;const t=now();try{delete require.cache[require.resolve("./"+f)];require("./"+f);loadSum+=now()-t;}catch(e){metLoad.record(0,true)}}
console.log("JS files: "+files.length+"  modules: "+(files.length-skip.size)+"  load: "+loadSum.toFixed(0)+"ms  avg: "+(loadSum/(files.length-skip.size)).toFixed(2)+"ms");
line();
console.log("Benchmark output redirected to log");
