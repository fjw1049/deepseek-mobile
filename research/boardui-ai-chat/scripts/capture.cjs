const { chromium } = require('/Users/fjw/.npm/_npx/c61c9351a0dbcfa7/node_modules/playwright');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const out = path.resolve(__dirname, '../evidence');
(async () => {
  const browser = await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--remote-debugging-port=9337']});
  const page = await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const manifest=[], pending=[];
  page.on('response', r => {
    if (!r.url().startsWith('https://www.boardui.com/') || !['script','stylesheet'].includes(r.request().resourceType())) return;
    pending.push((async()=>{try {const b=await r.body();const name=crypto.createHash('sha256').update(r.url()).digest('hex').slice(0,12)+'-'+path.basename(new URL(r.url()).pathname);fs.mkdirSync(out+'/assets',{recursive:true});fs.writeFileSync(out+'/assets/'+name,b);manifest.push({url:r.url(),file:'assets/'+name,bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')});}catch(e){manifest.push({url:r.url(),error:String(e)})}})());
  });
  await page.goto('https://www.boardui.com/zh-hans/templates/ai-chat',{waitUntil:'networkidle',timeout:60000});
  await page.screenshot({path:out+'/mobile-initial.png'});
  fs.writeFileSync(out+'/mobile-dom.html',await page.content());
  fs.writeFileSync(out+'/mobile-accessibility.yaml',await page.locator('body').ariaSnapshot());
  fs.writeFileSync(out+'/controls.json',JSON.stringify(await page.locator('button,input,textarea,a').evaluateAll(es=>es.map(e=>({tag:e.tagName,text:e.innerText,label:e.getAttribute('aria-label'),title:e.getAttribute('title'),href:e.getAttribute('href'),visible:!!(e.offsetWidth||e.offsetHeight)}))),null,2));
  await Promise.all(pending); fs.writeFileSync(out+'/assets-manifest.json',JSON.stringify(manifest,null,2));
  console.log('Captured',manifest.length,'assets. CDP on 9337 for 180 seconds.');
  await new Promise(r=>setTimeout(r,180000));
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
