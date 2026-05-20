// Statistical metrics for benchmark reporting
'use strict'

function mean(arr) { if (!arr.length) return 0; return arr.reduce((a,b)=>a+b,0)/arr.length }
function variance(arr) { if (arr.length<2) return 0; const m=mean(arr); return arr.reduce((s,x)=>s+(x-m)**2,0)/(arr.length-1) }
function stdev(arr) { return Math.sqrt(variance(arr)) }
function median(arr) { if(!arr.length) return 0; const s=[...arr].sort((a,b)=>a-b); const mid=Math.floor(s.length/2); return s.length%2?s[mid]:(s[mid-1]+s[mid])/2 }
function min(arr) { return arr.length?Math.min(...arr):0 }
function max(arr) { return arr.length?Math.max(...arr):0 }
function percentile(arr,p) { if(!arr.length) return 0; const s=[...arr].sort((a,b)=>a-b); const idx=(p/100)*(s.length-1); const lo=Math.floor(idx),hi=Math.ceil(idx); return lo===hi?s[lo]:s[lo]+(s[hi]-s[lo])*(idx-lo) }
function cohensD(a,b) { if(a.length<2||b.length<2) return 0; const ma=mean(a),mb=mean(b),va=variance(a),vb=variance(b),pooled=Math.sqrt(((a.length-1)*va+(b.length-1)*vb)/(a.length+b.length-2)); return pooled===0?0:(ma-mb)/pooled }
function ci95(arr) { if(arr.length<2) return {lo:0,hi:0}; const m=mean(arr),sd=stdev(arr),se=sd/Math.sqrt(arr.length),tCrit=arr.length>30?1.96:2.262,hw=tCrit*se; return {lo:m-hw,hi:m+hw,halfWidth:hw} }
function prf1(predicted,truth) { let tp=0,fp=0,fn=0,tn=0; for(let i=0;i<predicted.length;i++){if(predicted[i]&&truth[i])tp++;else if(predicted[i]&&!truth[i])fp++;else if(!predicted[i]&&truth[i])fn++;else tn++} const p=tp+fp===0?0:tp/(tp+fp),r=tp+fn===0?0:tp/(tp+fn),f=p+r===0?0:2*p*r/(p+r); return {tp,fp,fn,tn,precision:p,recall:r,f1:f,accuracy:(tp+tn)/predicted.length} }
function linregress(x,y) { if(x.length!==y.length||x.length<2) return {slope:0,intercept:0,r2:0}; const n=x.length,mx=mean(x),my=mean(y); let num=0,denX=0,denY=0; for(let i=0;i<n;i++){num+=(x[i]-mx)*(y[i]-my);denX+=(x[i]-mx)**2;denY+=(y[i]-my)**2} const slope=denX===0?0:num/denX,intercept=my-slope*mx,r2=(denX===0||denY===0)?0:(num*num)/(denX*denY); return {slope,intercept,r2} }
function summarize(arr) { return {n:arr.length,mean:mean(arr),median:median(arr),stdev:stdev(arr),min:min(arr),max:max(arr),p50:percentile(arr,50),p95:percentile(arr,95),p99:percentile(arr,99),ci95:ci95(arr)} }

module.exports = { mean,variance,stdev,median,min,max,percentile,cohensD,ci95,prf1,linregress,summarize }
