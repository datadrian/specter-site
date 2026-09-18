'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
delete process.env.NETLIFY;delete process.env.SITE_ID;process.env.ADMIN_API_TOKEN='analytics-test-token';
const store=require('../netlify/functions/_lib/analytics-store'),imaging=require('../netlify/functions/track-event'),sdr=require('../netlify/functions/track-sdr-event'),summary=require('../netlify/functions/admin-analytics-summary');
const day=new Date().toISOString().slice(0,10),read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
async function event(handler,data={},headers={}){const r=await handler({httpMethod:'POST',headers,body:JSON.stringify({type:'pageview',path:'/',...data})});return {status:r.statusCode,...JSON.parse(r.body)};}
async function stats(site,auth=true,query={}){const r=await summary.handler({httpMethod:'GET',headers:auth?{authorization:'Bearer analytics-test-token'}:{},queryStringParameters:{site,range:'today',...query}});return {status:r.statusCode,...JSON.parse(r.body)};}
function browserTracker(rel,preference,privacy=false){
 const values=new Map(preference?[['specter_analytics_consent_v1',preference]]:[]),requests=[],writes=[],cookies=[],listeners={};
 values.set('specter_vid','old-visitor');const elements={};
 const button={addEventListener:(name,fn)=>listeners['opt-out']=fn};elements['privacy-decline-analytics']=button;elements['privacy-consent-status']={};
 const document={readyState:'complete',body:{appendChild(e){elements[e.id]=e;}},getElementById:id=>elements[id]||null,addEventListener(){},createElement(){return {style:{}};}};
 Object.defineProperty(document,'cookie',{get(){throw Error('must not read cookies');},set(v){cookies.push(v);}});
 const context={document,window:{},navigator:{globalPrivacyControl:privacy},localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>{writes.push(k);values.set(k,v);},removeItem:k=>values.delete(k)},location:{pathname:'/',search:'?email=private@example.com&utm_content=private'},fetch:(url,opts)=>{requests.push({url,opts,payload:JSON.parse(opts.body)});return Promise.resolve({});}};
 vm.runInNewContext(read(rel),context);return {requests,values,writes,cookies,listeners,context,elements};
}
(async()=>{
 await store.recordEvent({type:'pageview',path:'/legacy',ts:day+'T01:00:00Z',sessionId:'legacy'});
 const malicious={site:'imaging',path:'/?email=private@example.com',visitorId:'secret',sessionId:'secret',timestamp:'2000-01-01',referrer:'https://example.com/private',utmCampaign:'private',durationMs:9};
 await event(imaging.handler,{site:'sdr'});await event(sdr.handler,malicious,{'user-agent':'private','x-nf-geo':'private'});await event(sdr.handler,{type:'download',path:'/download'});
 const records=await store.listEventsInRange(day,day);const anonymous=records.filter(e=>e.anonymous);
 assert.equal(anonymous.length,3);for(const e of anonymous){assert.deepStrictEqual(Object.keys(e).sort(),['anonymous','path','site','ts','type']);assert(e.ts.endsWith('T00:00:00.000Z'));assert(!JSON.stringify(e).includes('private'));}
 const a=await stats('imaging'),b=await stats('sdr');assert.equal(a.totals.pageviews,2);assert.equal(a.totals.downloads,0);assert.equal(b.totals.pageviews,1);assert.equal(b.totals.downloads,1);assert.equal(b.collectionMode,'anonymous-counts');assert.equal(b.totals.uniqueVisitors,undefined);
 assert.equal((await stats('bad')).status,400);assert.equal((await stats('sdr',false)).status,401);assert.equal((await stats('sdr',true,{range:'custom',start:'2026-02-30'})).status,400);
 for(const data of [{type:'session_heartbeat'},{path:'/admin'},{path:'/private-person-123'}, {path:'https://example.com/'}])assert((await event(sdr.handler,data)).skipped);
 assert((await event(sdr.handler,{}, {'sec-gpc':'1'})).skipped);assert((await event(sdr.handler,{}, {dnt:'1'})).skipped);
 for(const rel of ['public/analytics-track.js','sdr-site/analytics-track.js']){
  assert.equal(browserTracker(rel,'denied').requests.length,0);assert.equal(browserTracker(rel,null,true).requests.length,0);
  const b=browserTracker(rel,null);assert.equal(b.requests.length,1);assert.deepStrictEqual(b.requests[0].payload,{type:'pageview',path:'/'});assert.equal(b.requests[0].opts.credentials,'omit');assert.equal(b.requests[0].opts.referrerPolicy,'no-referrer');assert.equal(b.writes.length,0);assert(b.cookies.every(x=>x.includes('max-age=0')));assert(!b.values.has('specter_vid'));assert(b.elements['anonymous-analytics-notice']);
  b.context.window.specterTrackDownload('private');assert.equal(b.requests.length,2);b.listeners['opt-out']();b.context.window.specterTrackDownload();assert.equal(b.requests.length,2);assert.deepStrictEqual(b.writes,['specter_analytics_opt_out_v1']);assert(!read(rel).includes('analytics-consent'));
 }
 const html=read('public/admin/index.html'),ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);assert.equal(new Set(ids).size,ids.length);assert(html.includes('data-panel="sdr-analytics"'));assert(!read('public/admin/admin.js').includes('>UNIQUE VISITORS<'));
 console.log('PASS anonymous payload minimization, known-path validation, no identifiers/UTMs/headers, midnight date, opt-out/GPC/DNT, legacy cleanup, site isolation and admin auth');
})().catch(e=>{console.error(e);process.exit(1);});
