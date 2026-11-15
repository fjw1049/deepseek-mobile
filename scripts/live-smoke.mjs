// Explicit, bounded real-provider verification; not part of npm test.
import {chromium,expect} from '@playwright/test';
import {writeFileSync,readFileSync,existsSync} from 'node:fs';
const out='artifacts/live-20261115';
const report={cases:[],errors:[],provider:'official DeepSeek',model:'deepseek-flash'};
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--remote-debugging-port=19223']});
const context=await browser.newContext({viewport:{width:430,height:880},deviceScaleFactor:1});
const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
const save=()=>writeFileSync(`${out}/ui-report.json`,JSON.stringify(report,null,2));
const passed=name=>{report.cases.push({name,status:'passed'});save();console.log('PASS '+name)};
const send=async text=>{await page.getByRole('textbox',{name:'消息',exact:true}).fill(text);await page.getByRole('button',{name:'发送消息',exact:true}).click()};
try{
 await page.goto('http://127.0.0.1:5178/');
 await page.getByLabel('访问令牌').fill('mobile-live-review');
 await page.getByRole('button',{name:'连接工作台'}).click();await expect(page.getByText('想做点什么？')).toBeVisible();passed('电脑预览可打开且连接真实 Runtime');
 await page.getByRole('button',{name:'打开会话',exact:true}).click();await page.locator('.drawer').getByRole('button',{name:'新建会话',exact:true}).click();await page.getByLabel('会话名称').fill('官方 DeepSeek 真实验证');
 const created=page.waitForResponse(r=>r.url().endsWith('/v1/threads')&&r.request().method()==='POST');
 await page.getByRole('button',{name:'创建会话'}).click();report.thread_id=(await (await created).json()).id;save();
 await send('这是手机 App 的真实连通测试。不要调用工具。请回复“真实连接成功”，然后给出一行 Python 代码 print("DeepSeek live")，用 Markdown 代码块展示。');
 await expect(page.locator('.assistant-message').last()).toContainText('DeepSeek live',{timeout:60000});await expect(page.getByRole('button',{name:'发送消息',exact:true})).toBeVisible({timeout:15000});
 await page.screenshot({path:`${out}/real-chat.png`});passed('官方模型真实回复、流式展示与代码块');
 await send('请现在调用 request_user_input 工具，询问“验证哪一项？”，两个选项为“只验证连接”和“检查文件”。等我回答后只用一句话确认我的选择，不要调用其他工具。');
 await expect(page.getByText('需要你的回答',{exact:true})).toBeVisible({timeout:60000});await page.getByRole('button',{name:'只验证连接',exact:true}).click();
 await page.getByRole('button',{name:'提交回答'}).scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/real-question.png`});await page.getByRole('button',{name:'提交回答'}).click();
 await expect(page.getByText('需要你的回答',{exact:true})).toHaveCount(0,{timeout:15000});await expect(page.getByRole('button',{name:'发送消息',exact:true})).toBeVisible({timeout:60000});passed('模型真实发起追问，App 回答后继续完成');
 const target='/tmp/deepseek-mobile-live-20261115/session/approval-target.txt';
 await send(`这是已授权的沙箱审批验证。请使用 write_file 工具仅创建这个测试文件：${target}，内容必须是 MOBILE_LIVE_OK。该文件在当前工作目录之外，应按现有权限流程请求本次授权；不要绕过审批，不要执行其他任务，成功后只回复“测试文件已创建”。`);
 let decided=false;
 for(let i=0;i<90;i++){
  if(existsSync(target))break;
  const cards=page.locator('.action-card');
  for(let j=0;j<await cards.count();j++){
   const card=cards.nth(j);const text=await card.innerText();
   if(!text.includes('approval-target.txt'))continue;
   const button=card.getByRole('button',{name:/^允许本次(提权)?$/});
   if(await button.count()){
    await button.scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/real-approval.png`});await button.click();decided=true;
   }
  }
  await page.waitForTimeout(500);
 }
 if(!existsSync(target))throw new Error('Actual write tool did not create the test file within the bounded wait');
 if(readFileSync(target,'utf8').trim()!=='MOBILE_LIVE_OK')throw new Error('Test file contents differ');
 await expect(page.getByRole('button',{name:'发送消息',exact:true})).toBeVisible({timeout:45000});passed(decided?'真实写文件工具经 App 授权后完成，已核验磁盘内容':'真实写文件工具完成，已核验磁盘内容（本次未触发 App 审批）');
 const prior=await page.locator('.assistant-message').count();
 await send('不要使用工具。这是停止流式生成的验证。请从“停止验证开始”开始，逐行列出 1 到 300 的数字，每行说明这个数字的中文读法，不要省略。');
 await expect.poll(()=>page.locator('.assistant-message').count(),{timeout:45000}).toBeGreaterThan(prior);
 await expect(page.locator('.assistant-message').last()).toContainText('停止验证',{timeout:45000});
 await page.getByRole('button',{name:'停止生成',exact:true}).click();await expect(page.getByRole('button',{name:'发送消息',exact:true})).toBeVisible({timeout:15000});passed('收到真实流式响应后停止生成');
 await page.getByRole('button',{name:'会话操作'}).click();await page.getByRole('button',{name:'重新同步'}).click();await expect(page.locator('.assistant-message').first()).toContainText('DeepSeek live');passed('真实会话重新同步、历史持久化');
 await page.screenshot({path:`${out}/real-final.png`});
}catch(e){report.failure=e.message;save();await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});console.log('LIVE_TEST_FAILURE '+e.message)}
console.log('PREVIEW_LEFT_OPEN http://127.0.0.1:5178/');save();
await new Promise(resolve=>browser.on('disconnected',resolve));
