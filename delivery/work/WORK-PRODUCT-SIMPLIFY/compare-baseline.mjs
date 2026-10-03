// Deterministic comparison only: no model calls, no publication, no target project writes.
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const baseline=resolve(process.argv[2]);
const current=resolve(dirname(fileURLToPath(import.meta.url)),'../../..','bin/buildbeat.js');
const workflow=readFileSync(resolve(dirname(baseline),'../delivery/work/WORK-REVIEW-CONVERGENCE/workflow.yaml'),'utf8');
function scenario(cli,mode){
 const root=mkdtempSync(join(tmpdir(),'bb-parity-'));
 try{
  const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();
  git('init','-q','-b','main');git('config','user.name','Fixture');git('config','user.email','fixture@example.com');
  const dir=join(root,'delivery/work/WORK-P');mkdirSync(dir,{recursive:true});
  writeFileSync(join(root,'.gitignore'),'.buildbeat/\n');
  writeFileSync(join(dir,'intent.md'),'# Intent\nDeliver feature.\n');writeFileSync(join(dir,'plan.md'),'# Plan\nImplement, verify, review.\n');writeFileSync(join(dir,'workflow.yaml'),workflow);
  writeFileSync(join(root,'worker.sh'),`#!/usr/bin/env bash
set -eu
case "$1" in
 build) echo feature > feature.txt; git add feature.txt; git commit -qm feature ;;
 verify) ${mode==='repair'?'test -f fixed.txt':'test -f feature.txt'} ;;
 fix) echo fixed > fixed.txt; git add fixed.txt; git commit -qm fixed ;;
 review) printf '%s\\n' '{"status":"succeeded","findings":[]}' > "$BUILDBEAT_OUTPUT" ;;
esac
`);
  const config=join(dir,'run-config.yaml');writeFileSync(config,['repo: ../../..','work: WORK-P','run: RUN-P','workflow: workflow.yaml','riskPreset: standard','entry: build',...(['resume','stale'].includes(mode)?['stopAt:','  - review']:[]),'workers:',...['builder','verifier','reviewer','fixer'].flatMap((name,i)=>[`  ${name}:`,'    command: bash','    args:','      - worker.sh',`      - ${['build','verify','review','fix'][i]}`])].join('\n')+'\n');
  git('add','.');git('commit','-qm','baseline');const base=git('rev-parse','HEAD');
  const call=(...args)=>{const result=spawnSync(process.execPath,[cli,...args],{cwd:root,encoding:'utf8',timeout:30000});assert.equal(result.status,0,result.stderr+result.stdout);};
  call('accept','--repo','.', '--work','WORK-P','--artifact','intent,plan','--by','fixture-owner');
  const start=Date.now();call('start','--config',config,'--attempt','new');
  if(['resume','stale'].includes(mode)){
   call('approve','--repo','.', '--run','RUN-P-01','--transition','enter-review','--config',config,'--by','fixture-owner');
   if(mode==='stale'){
    const tree=join(root,'.buildbeat/worktrees/RUN-P-01');writeFileSync(join(tree,'feature.txt'),'moved candidate\n');
    execFileSync('git',['-C',tree,'add','feature.txt']);execFileSync('git',['-C',tree,'commit','-qm','move candidate']);
   }
   call('resume','--config',config,'--run','RUN-P-01');
  }
  const events=readFileSync(join(root,'.buildbeat/runtime/runs/RUN-P-01/events.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line));
  const attempts={};for(const e of events.filter(e=>e.type==='STEP_STARTED'))attempts[e.data.step]=(attempts[e.data.step]??0)+1;
  const requested=events.filter(e=>e.type==='HUMAN_REQUESTED');
  // Commits differ per repository; trees and step names are comparable, so
  // candidates and evidence subjects are projected onto their trees.
  const tree=sha=>git('rev-parse',`${sha}^{tree}`);
  const evidence=events.filter(e=>e.type==='EVIDENCE_RECORDED').map(e=>({kind:e.data.kind,status:e.data.status,grade:e.data.grade,step:(e.data.evidenceRef.match(/([a-z-]+)-\d+\.(?:log|json)$/)??[])[1]??null,subjectTree:tree(e.data.subject)}));
  const decisions=events.filter(e=>e.type==='DECISION_RECORDED').map(e=>({transition:e.data.transition,decision:e.data.decision}));
  const terminal=events.find(e=>e.type==='RUN_TERMINAL')?.data.status??null;
  return {outcome:{attempts,humanRequests:requested.length,lastTransition:requested.at(-1).data.transition,waitingKind:requested.at(-1).data.kind??null,staleApprovals:events.filter(e=>e.type==='APPROVAL_STALE').length,changedPaths:git('diff','--name-only',base,'run/RUN-P-01').split('\n'),candidateTree:tree('run/RUN-P-01'),evidence,decisions,terminal},elapsedMs:Date.now()-start};
 }finally{rmSync(root,{recursive:true,force:true});}
}
const results=[];
for(const name of ['clean','repair','resume','stale']){
 const before=scenario(baseline,name),after=scenario(current,name);
 assert.deepEqual(after.outcome,before.outcome,`${name} delivery behavior changed`);
 results.push({scenario:name,outcome:after.outcome,baselineMs:before.elapsedMs,candidateMs:after.elapsedMs});
}
console.log(JSON.stringify({scope:'scripted workers; equal outcomes, invocation counts, candidate trees, evidence and decisions; not an AI performance benchmark',results},null,2));
