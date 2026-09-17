'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
delete process.env.NETLIFY; delete process.env.SITE_ID;
process.env.ADMIN_API_TOKEN = 'analytics-test-token';
const store = require('../netlify/functions/_lib/analytics-store');
const imaging = require('../netlify/functions/track-event');
const sdr = require('../netlify/functions/track-sdr-event');
const summary = require('../netlify/functions/admin-analytics-summary');
const day = new Date().toISOString().slice(0,10);
const read = file => fs.readFileSync(path.join(__dirname,'..',file),'utf8');
async function event(handler, data) {
 const result=await handler({httpMethod:'POST',headers:{},body:JSON.stringify({type:'pageview',path:'/',sessionId:'same-id',visitorId:'same-visitor',...data})});
 assert.equal(result.statusCode,200);return JSON.parse(result.body);
}
async function stats(site,auth=true) {
 const result=await summary.handler({httpMethod:'GET',headers:auth?{authorization:'Bearer analytics-test-token'}:{},queryStringParameters:{site,range:'today'}});
 return {status:result.statusCode,...JSON.parse(result.body)};
}
function browserTracker(rel, consent, privacy=false) {
 const values=new Map(consent?[['specter_analytics_consent_v1',consent]]:[]);const requests=[];const listeners={};
 const document={readyState:'complete',cookie:'',referrer:'https://www.reddit.com/',visibilityState:'visible',body:{appendChild(){}},querySelector(){return null;},getElementById(){return null;},addEventListener(name,fn){listeners[name]=fn;},createElement(){return {setAttribute(){},querySelector(){return {};}};}};
 const context={document,window:{addEventListener(name,fn){listeners[name]=fn;}},navigator:{globalPrivacyControl:privacy},localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},location:{pathname:'/',search:'?utm_source=reddit&utm_medium=paid_social&utm_campaign=sdr_launch&utm_content=array-h1'},URLSearchParams,crypto:{randomUUID:()=>Math.random().toString()},fetch:(url,opts)=>{requests.push({url,...JSON.parse(opts.body)});return Promise.resolve({});},Date,Math,Number,JSON};
 vm.runInNewContext(read(rel),context);
 return {requests,context,values,listeners};
}
(async()=>{
 await store.recordEvent({type:'pageview',path:'/legacy',ts:day+'T01:00:00Z',sessionId:'legacy'});
 await event(imaging.handler,{site:'sdr',utmContent:'imaging-test'});
 await event(sdr.handler,{site:'imaging',utmSource:'reddit',utmMedium:'paid_social',utmCampaign:'sdr-launch',utmContent:'array-h1',referrer:'https://specter-sdr.com/help/'});
 await event(sdr.handler,{type:'download',path:'/download'});
 let a=await stats('imaging'),b=await stats('sdr');
 assert.equal(a.totals.pageviews,2);assert.equal(a.totals.downloads,0);
 assert.equal(b.totals.pageviews,1);assert.equal(b.totals.downloads,1);
 assert.equal(b.topUtmContents[0].content,'array-h1');assert.equal(b.topUtmMediums[0].medium,'paid_social');
 assert.equal(b.topReferrers[0].referrer,'direct/none');assert.equal(b.topPages[0].path,'/');
 assert.equal((await stats('bad')).status,400);assert.equal((await stats('sdr',false)).status,401);
 assert((await event(sdr.handler,{type:'invalid'})).skipped);
 for(const file of ['public/analytics-track.js','sdr-site/analytics-track.js']) {
  assert.equal(browserTracker(file,'denied').requests.length,0);
  assert.equal(browserTracker(file,null).requests.length,0);
  assert.equal(browserTracker(file,'granted',true).requests.length,0);
  const browser=browserTracker(file,'granted');assert.equal(browser.requests.length,1);assert.equal(browser.requests[0].utmContent,'array-h1');
  browser.context.window.specterTrackDownload('installer');assert.equal(browser.requests.length,2);
  browser.values.set('specter_analytics_consent_v1','denied');browser.context.window.specterTrackDownload('installer');browser.listeners.pagehide();assert.equal(browser.requests.length,2);
 }
 const markup=read('public/admin/index.html');const ids=[...markup.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length,'unique admin IDs');
 assert(markup.includes('data-panel="sdr-analytics"'));assert(markup.includes('id="sdr-analytics-top-utm-contents"'));
 assert(read('sdr-site/_redirects').includes('/api/track-event https://specter-imaging.com/.netlify/functions/track-sdr-event 200!'));
 console.log('analytics site separation, auth, campaigns, legacy history, consent and revocation PASS');
})().catch(e=>{console.error(e);process.exit(1);});
