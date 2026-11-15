const {chromium}=require('/Users/fjw/.npm/_npx/c61c9351a0dbcfa7/node_modules/playwright');
const fs=require('fs'),path=require('path');const out=path.resolve(__dirname,'../evidence');
(async()=>{const b=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});const p=await b.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});p.setDefaultTimeout(3000);
const log=[];async function snap(n){fs.writeFileSync(out+'/'+n+'.yaml',await p.locator('body').ariaSnapshot());await p.screenshot({path:out+'/'+n+'.png'});}
async function act(n,fn){try{await fn();await p.waitForTimeout(350);await snap(n);log.push({name:n,ok:true})}catch(e){log.push({name:n,ok:false,error:String(e).slice(0,250)})}}
await p.goto('https://www.boardui.com/zh-hans/templates/ai-chat',{waitUntil:'networkidle',timeout:60000});await p.waitForTimeout(1500);await snap('explore-initial');
await act('settings',async()=>{await p.getByRole('button',{name:'打开导航',exact:true}).click();await p.getByRole('link',{name:'设置',exact:true}).click()});
fs.writeFileSync(out+'/settings-controls.json',JSON.stringify(await p.locator('[role="dialog"] button').allTextContents()));
await p.keyboard.press('Escape');
await act('image-scenario',async()=>{const close=p.getByRole('button',{name:'关闭',exact:true});if(await close.count())await close.last().click();await p.getByRole('link').filter({hasText:'图像生成'}).first().click();await p.waitForTimeout(1200)});
await act('gallery',async()=>{await p.getByRole('button',{name:/打开图库|开放图库|Open gallery/}).click()});
await p.goto('https://www.boardui.com/zh-hans/templates/ai-chat',{waitUntil:'domcontentloaded'});await p.waitForTimeout(1500);
await act('search',async()=>{await p.getByRole('button',{name:'打开导航',exact:true}).click();await p.getByRole('button',{name:'搜索',exact:true}).first().click()});
await act('theme-dark',async()=>{await p.keyboard.press('Escape');await p.getByRole('button',{name:'使用深色模式',exact:true}).first().click()});
fs.writeFileSync(out+'/exploration-log.json',JSON.stringify(log,null,2));await b.close();})().catch(e=>{console.error(e);process.exit(1)});
