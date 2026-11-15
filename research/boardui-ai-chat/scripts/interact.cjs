const {chromium}=require('/Users/fjw/.npm/_npx/c61c9351a0dbcfa7/node_modules/playwright');
const fs=require('fs');const path=require('path');const out=path.resolve(__dirname,'../evidence');
(async()=>{const b=await chromium.connectOverCDP('http://127.0.0.1:9337');const p=b.contexts()[0].pages()[0];const log=[];
async function snap(name){fs.writeFileSync(out+'/'+name+'.yaml',await p.locator('body').ariaSnapshot());await p.screenshot({path:out+'/'+name+'.png'});}
async function click(name){try{await p.getByRole('button',{name,exact:true}).last().click({timeout:2000});log.push({name,ok:true});}catch(e){log.push({name,ok:false,error:String(e).slice(0,180)});}}
await p.goto('https://www.boardui.com/zh-hans/templates/ai-chat',{waitUntil:'domcontentloaded',timeout:60000});await p.waitForTimeout(2000);
await click('关闭 Pro 模板提示');await snap('mobile-chat');
await click('打开导航');await snap('mobile-navigation');await click('关闭导航');
await click('开放代码');await snap('mobile-code');await click('浏览器');await snap('mobile-browser');await click('关闭代码');
for(const name of ['Fable 5','添加附件','语音输入','分享聊天','更多选项','主要','项目海','智能体']){await click(name);await snap('control-'+log.length);await p.keyboard.press('Escape');}
await p.getByRole('textbox',{name:'留言',exact:true}).fill('本地界面检查');await click('发送消息');await snap('after-send');
fs.writeFileSync(out+'/interaction-log.json',JSON.stringify(log,null,2));await b.close();})().catch(e=>{console.error(e);process.exit(1)});
