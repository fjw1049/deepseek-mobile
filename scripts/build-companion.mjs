import {spawnSync} from 'node:child_process';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
for(const name of ['voice','git','terminal','models']){
 const run=spawnSync(process.execPath,[resolve(root,`scripts/build-${name}-helper.mjs`)],{stdio:'inherit',cwd:root,env:process.env});
 if(run.status!==0)process.exit(run.status||1);
}
