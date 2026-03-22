#!/usr/bin/env bun
#!/usr/bin/env bun
"use strict";var D=Object.create;var b=Object.defineProperty;var k=Object.getOwnPropertyDescriptor;var M=Object.getOwnPropertyNames;var A=Object.getPrototypeOf,F=Object.prototype.hasOwnProperty;var z=(o,n,e,s)=>{if(n&&typeof n=="object"||typeof n=="function")for(let i of M(n))!F.call(o,i)&&i!==e&&b(o,i,{get:()=>n[i],enumerable:!(s=k(n,i))||s.enumerable});return o};var U=(o,n,e)=>(e=o!=null?D(A(o)):{},z(n||!o||!o.__esModule?b(e,"default",{value:o,enumerable:!0}):e,o));var S=require("readline"),q=require("bun:sqlite"),_=require("path"),y=require("os"),c=require("fs"),m=process.env.VIBELEARN_DATA_DIR?process.env.VIBELEARN_DATA_DIR.replace("~",(0,y.homedir)()):(0,_.join)((0,y.homedir)(),".vibelearn"),f=(0,_.join)(m,"vibelearn.db"),E=(0,_.join)(m,"config.json");function T(){try{if((0,c.existsSync)(E))return JSON.parse((0,c.readFileSync)(E,"utf-8"))}catch{}return{}}function P(o){(0,c.existsSync)(m)||(0,c.mkdirSync)(m,{recursive:!0}),(0,c.writeFileSync)(E,JSON.stringify(o,null,2),"utf-8")}function C(){return(0,c.existsSync)(f)?new q.Database(f,{readonly:!0}):(console.log("No VibeLearn database found. Start a coding session first!"),null)}async function B(){let o=C();if(!o)return;let n=o.query("SELECT COUNT(*) as count FROM vibelearn_session_summaries").get()?.count??0,e=o.query("SELECT COUNT(*) as count FROM vl_concepts").get()?.count??0,s=o.query("SELECT COUNT(*) as count FROM vl_questions").get()?.count??0,i=o.query(`
    SELECT COUNT(*) as count FROM vl_questions
    WHERE id NOT IN (SELECT DISTINCT question_id FROM vl_quiz_attempts)
  `).get()?.count??0,g=o.query(`
    SELECT category, COUNT(*) as count
    FROM vl_concepts
    GROUP BY category
    ORDER BY count DESC
    LIMIT 10
  `).all(),l=o.query(`
    SELECT COUNT(*) as count FROM vl_developer_profile WHERE mastery_score > 0.85
  `).get()?.count??0;console.log(`
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501`),console.log("  VibeLearn Status"),console.log("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501"),console.log(`  Sessions analyzed : ${n}`),console.log(`  Concepts captured : ${e}`),console.log(`  Quiz questions    : ${s} (${i} pending)`),console.log(`  Mastered concepts : ${l}`),g.length>0&&(console.log(`
  Top categories:`),g.forEach(a=>{console.log(`    ${a.category.padEnd(20)} ${a.count}`)})),console.log(`\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
`),o.close()}async function j(){let o=C();if(!o)return;let n=o.query(`
    SELECT concept_name, category, mastery_score, encounter_count as times_seen
    FROM vl_developer_profile
    WHERE mastery_score < 0.5
    ORDER BY mastery_score ASC, times_seen DESC
    LIMIT 20
  `).all();if(n.length===0){console.log(`
No knowledge gaps found. Keep coding and learning!
`),o.close();return}console.log(`
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501`),console.log("  Knowledge Gaps (mastery < 50%)"),console.log("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501"),n.forEach(e=>{let s="\u2588".repeat(Math.round(e.mastery_score*10))+"\u2591".repeat(10-Math.round(e.mastery_score*10)),i=Math.round(e.mastery_score*100);console.log(`  ${e.concept_name.padEnd(30)} [${s}] ${String(i).padStart(3)}%  (${e.category})`)}),console.log(`\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
`),o.close()}async function x(o){let n=C();if(!n)return;let e=`
    SELECT q.id, q.session_id, q.question_type, q.difficulty,
           q.question, q.options_json, q.correct, q.explanation, q.snippet,
           c.concept_name
    FROM vl_questions q
    LEFT JOIN vl_concepts c ON q.concept_id = c.id
    WHERE q.id NOT IN (SELECT DISTINCT question_id FROM vl_quiz_attempts)
  `;if(o){let r=n.query(`
      SELECT session_id FROM vibelearn_session_summaries
      ORDER BY generated_at DESC LIMIT 1
    `).get();if(!r){console.log(`
No sessions found. Run a coding session first!
`),n.close();return}e+=` AND q.session_id = '${r.session_id}'`}e+=" ORDER BY q.created_at DESC LIMIT 20";let s=n.query(e).all();if(n.close(),s.length===0){console.log(`
No pending questions! Great job staying on top of your learning.
`);return}let i=new q.Database(f),g=(0,S.createInterface)({input:process.stdin,output:process.stdout}),l=r=>new Promise(t=>g.question(r,t)),a=0,p=0;console.log(`
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501`),console.log(`  VibeLearn Quiz \u2014 ${s.length} questions`),console.log(`\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
`);for(let r=0;r<s.length;r++){let t=s[r],O=`Q${r+1}/${s.length}`,I=t.concept_name?` [${t.concept_name}]`:"";console.log(`
${O} (${t.difficulty})${I}`),t.snippet&&t.snippet.trim()&&(console.log(`
  Code:
`),t.snippet.split(`
`).forEach(d=>console.log(`    ${d}`)),console.log("")),console.log(`  ${t.question}
`);let u="",$=Date.now();if(t.question_type==="multiple_choice"&&t.options_json)try{JSON.parse(t.options_json).forEach((N,h)=>{let w=String.fromCharCode(65+h);console.log(`  ${w}) ${N}`)}),console.log(""),u=(await l("  Your answer (A/B/C/D): ")).trim().toUpperCase()}catch{u=(await l("  Your answer: ")).trim()}else t.question_type==="fill_in_blank"?u=(await l("  Fill in: ")).trim():(console.log("  (Type your explanation, then press Enter)"),u=(await l("  Your answer: ")).trim());let L=Date.now()-$,v=u.toLowerCase()===t.correct.toLowerCase();v?(console.log(`
  \u2713 Correct!
`),a++):console.log(`
  \u2717 Incorrect. Correct answer: ${t.correct}
`),console.log(`  Explanation: ${t.explanation}
`),console.log("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"),p++;try{let{randomUUID:d}=await import("crypto");i.run(`
        INSERT INTO vl_quiz_attempts (id, question_id, answer_given, is_correct, time_taken_ms, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `,[d(),t.id,u,v?1:0,L,Math.floor(Date.now()/1e3)])}catch{}}g.close(),i.close();let R=p>0?Math.round(a/p*100):0;console.log(`
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501`),console.log(`  Quiz complete: ${a}/${p} correct (${R}%)`),console.log(`\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
`)}async function Q(o,n){if(n){let s=T();if(s.api_key){let i=s.api_key.slice(0,6)+"..."+s.api_key.slice(-4);console.log(`
  Logged in: API key ${i}
`)}else console.log(`
  Not logged in. Run: vl login <api-key>
`);return}o||(console.error(`
  Usage: vl login <api-key>
`),process.exit(1));let e=T();e.api_key=o,P(e),console.log(`
  API key saved to ~/.vibelearn/config.json
`)}async function Y(){let o=process.argv.slice(2);switch(o[0]){case"quiz":await x(o.includes("--session"));break;case"status":await B();break;case"gaps":await j();break;case"login":{let e=o.includes("--status"),s=e?null:o[1]??null;await Q(s,e);break}default:console.log(`
VibeLearn CLI \u2014 learn from your coding sessions

Usage:
  vl quiz              Interactive quiz (all pending questions)
  vl quiz --session    Quiz only the last session's questions
  vl status            Sessions analyzed, concepts by category
  vl gaps              Concepts you haven't mastered yet
  vl login <api-key>   Connect to vibelearn.dev
  vl login --status    Check login status
`)}}Y().catch(o=>{console.error("Error:",o.message),process.exit(1)});
