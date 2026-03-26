#!/usr/bin/env bun
"use strict";var B=Object.create;var O=Object.defineProperty;var G=Object.getOwnPropertyDescriptor;var K=Object.getOwnPropertyNames;var J=Object.getPrototypeOf,X=Object.prototype.hasOwnProperty;var Z=(e,n,t,r)=>{if(n&&typeof n=="object"||typeof n=="function")for(let s of K(n))!X.call(e,s)&&s!==t&&O(e,s,{get:()=>n[s],enumerable:!(r=G(n,s))||r.enumerable});return e};var ee=(e,n,t)=>(t=e!=null?B(J(e)):{},Z(n||!e||!e.__esModule?O(t,"default",{value:e,enumerable:!0}):t,e));var H=require("readline"),I=require("bun:sqlite"),T=require("path"),h=require("os"),d=require("fs");function N(e,n){let t=e+n;return t===0?0:e/t}function k(e){return e>=.85?"senior":e>=.5?"mid":"junior"}function x(e,n){let t=Math.floor(Date.now()/1e3),r=e.query("SELECT * FROM vl_developer_profile WHERE concept_name = ?").get(n.conceptName);if(!r){let u=n.isCorrect?1:0,p=n.isCorrect?0:1,E=N(u,p),f=n.isCorrect?1:0,R=k(E);return e.run(`INSERT INTO vl_developer_profile
        (concept_name, category, first_seen_at, last_seen_at, encounter_count,
         correct_answers, incorrect_answers, current_level, streak_count, mastery_score)
       VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,[n.conceptName,n.category,t,t,u,p,R,f,E]),{concept_name:n.conceptName,category:n.category,first_seen_at:t,last_seen_at:t,encounter_count:1,correct_answers:u,incorrect_answers:p,current_level:R,streak_count:f,mastery_score:E}}let s=r.correct_answers+(n.isCorrect?1:0),c=r.incorrect_answers+(n.isCorrect?0:1),l=N(s,c),i=n.isCorrect?r.streak_count+1:0,a=k(l);return e.run(`UPDATE vl_developer_profile SET
       last_seen_at       = ?,
       encounter_count    = encounter_count + 1,
       correct_answers    = ?,
       incorrect_answers  = ?,
       current_level      = ?,
       streak_count       = ?,
       mastery_score      = ?
     WHERE concept_name = ?`,[t,s,c,a,i,l,n.conceptName]),{...r,last_seen_at:t,encounter_count:r.encounter_count+1,correct_answers:s,incorrect_answers:c,current_level:a,streak_count:i,mastery_score:l}}function $(e,n){let t=new Date().toISOString().slice(0,10);e.query("SELECT questions_answered, correct_answers FROM vl_daily_streaks WHERE date = ?").get(t)?e.run(`UPDATE vl_daily_streaks SET
         questions_answered = questions_answered + 1,
         correct_answers    = correct_answers + ?
       WHERE date = ?`,[n?1:0,t]):e.run(`INSERT INTO vl_daily_streaks (date, questions_answered, correct_answers, streak_continues)
       VALUES (?, 1, ?, 1)`,[t,n?1:0])}function M(e){let{isCorrect:n,currentEaseFactor:t,currentIntervalDays:r,currentRepetitions:s,nowEpoch:c}=e;if(!n){let u=Math.max(1.3,t-.2);return{nextReviewAt:c+86400,easeFactor:u,intervalDays:1,repetitions:0}}let l=t+.1,i=s+1,a;return i===1?a=1:i===2?a=6:a=Math.round(r*t),{nextReviewAt:c+a*86400,easeFactor:l,intervalDays:a,repetitions:i}}function P(e,n,t){e.run(`UPDATE vl_questions
     SET next_review_at = ?,
         ease_factor    = ?,
         interval_days  = ?,
         repetitions    = ?
     WHERE id = ?`,[t.nextReviewAt,t.easeFactor,t.intervalDays,t.repetitions,n])}function F(e,n,t,r=20){let s=t?"AND q.session_id = ?":"",c=t?[n,t,r]:[n,r];return e.query(`
    SELECT q.id, q.session_id, q.question_type, q.difficulty,
           q.question, q.options_json, q.correct, q.explanation, q.snippet,
           q.ease_factor, q.interval_days, q.repetitions, q.follow_up_mid,
           c.concept_name
    FROM vl_questions q
    LEFT JOIN vl_concepts c ON q.concept_id = c.id
    WHERE (q.next_review_at IS NULL OR q.next_review_at <= ?)
    ${s}
    ORDER BY q.next_review_at ASC NULLS FIRST, q.created_at DESC
    LIMIT ?
  `).all(...c)}var S=["junior","mid","senior"],ne=3;function te(e){let n=S.indexOf(e);return n===-1||n>=S.length-1?"senior":S[n+1]}function oe(e){let n=S.indexOf(e);return n<=0?"junior":S[n-1]}function U(e,n){let t=e.query("SELECT current_level FROM vl_developer_profile WHERE concept_name = ?").get(n.conceptName),r=!t,s=t?.current_level??"junior",c=x(e,n),l=c.current_level,i=!1,a=!1;if(!r)if(n.isCorrect&&c.streak_count>=ne){let p=te(s);p!==s?(l=p,i=!0,e.run("UPDATE vl_developer_profile SET current_level = ?, streak_count = 0 WHERE concept_name = ?",[l,n.conceptName]),c.streak_count=0):(l=s,e.run("UPDATE vl_developer_profile SET current_level = ? WHERE concept_name = ?",[l,n.conceptName]))}else if(n.isCorrect)l=s,e.run("UPDATE vl_developer_profile SET current_level = ? WHERE concept_name = ?",[l,n.conceptName]);else{let p=oe(s);p!==s?(l=p,a=!0,e.run("UPDATE vl_developer_profile SET current_level = ? WHERE concept_name = ?",[l,n.conceptName])):(l=s,e.run("UPDATE vl_developer_profile SET current_level = ? WHERE concept_name = ?",[l,n.conceptName]))}return{profile:{...c,current_level:l},levelChanged:!r&&l!==s,previousLevel:s,promoted:i,demoted:a}}function Q(e,n,t,r){if(!e.follow_up_mid||!e.follow_up_mid.trim()||e.difficulty!=="junior"||!n||t!=="junior")return!1;let s=`followup_${e.id}`;return!r.has(s)}function z(e){return{id:`followup_${e.id}`,concept_name:e.concept_name,question_type:"open_ended",difficulty:"mid",snippet:e.snippet??null,question:e.follow_up_mid??"",options_json:null,correct:null,explanation:"(Follow-up \u2014 no single correct answer. Reflect on your understanding.)",follow_up_mid:null,is_follow_up:!0}}var se="0.1.6",b=process.env.VIBELEARN_DATA_DIR?process.env.VIBELEARN_DATA_DIR.replace("~",(0,h.homedir)()):(0,T.join)((0,h.homedir)(),".vibelearn"),A=(0,T.join)(b,"vibelearn.db"),L=(0,T.join)(b,"config.json");function j(){try{if((0,d.existsSync)(L))return JSON.parse((0,d.readFileSync)(L,"utf-8"))}catch{}return{}}function re(e){(0,d.existsSync)(b)||(0,d.mkdirSync)(b,{recursive:!0}),(0,d.writeFileSync)(L,JSON.stringify(e,null,2),"utf-8")}function q(){return(0,d.existsSync)(A)?new I.Database(A,{readonly:!0}):(console.log("No VibeLearn database found. Start a coding session first!"),null)}async function ie(){let e=q();if(!e)return;let n=e.query("SELECT COUNT(*) as count FROM vibelearn_session_summaries").get()?.count??0,t=e.query("SELECT COUNT(*) as count FROM vl_concepts").get()?.count??0,r=e.query("SELECT COUNT(*) as count FROM vl_questions").get()?.count??0,s=e.query(`
    SELECT COUNT(*) as count FROM vl_questions
    WHERE id NOT IN (SELECT DISTINCT question_id FROM vl_quiz_attempts)
  `).get()?.count??0,c=e.query(`
    SELECT category, COUNT(*) as count
    FROM vl_concepts
    GROUP BY category
    ORDER BY count DESC
    LIMIT 10
  `).all(),l=e.query(`
    SELECT COUNT(*) as count FROM vl_developer_profile WHERE mastery_score > 0.85
  `).get()?.count??0;console.log(`
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501`),console.log("  VibeLearn Status"),console.log("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501"),console.log(`  Sessions analyzed : ${n}`),console.log(`  Concepts captured : ${t}`),console.log(`  Quiz questions    : ${r} (${s} pending)`),console.log(`  Mastered concepts : ${l}`),c.length>0&&(console.log(`
  Top categories:`),c.forEach(i=>{console.log(`    ${i.category.padEnd(20)} ${i.count}`)})),console.log(`\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
`),e.close()}async function ce(){let e=q();if(!e)return;let n=e.query(`
    SELECT concept_name, category, mastery_score, encounter_count as times_seen
    FROM vl_developer_profile
    WHERE mastery_score < 0.5
    ORDER BY mastery_score ASC, times_seen DESC
    LIMIT 20
  `).all();if(n.length===0){console.log(`
No knowledge gaps found. Keep coding and learning!
`),e.close();return}console.log(`
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501`),console.log("  Knowledge Gaps (mastery < 50%)"),console.log("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501"),n.forEach(t=>{let r="\u2588".repeat(Math.round(t.mastery_score*10))+"\u2591".repeat(10-Math.round(t.mastery_score*10)),s=Math.round(t.mastery_score*100);console.log(`  ${t.concept_name.padEnd(30)} [${r}] ${String(s).padStart(3)}%  (${t.category})`)}),console.log(`\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
`),e.close()}async function ae(e){let n=q();if(!n)return;let t=Math.floor(Date.now()/1e3),r;if(e){let o=n.query(`
      SELECT session_id FROM vibelearn_session_summaries
      ORDER BY generated_at DESC LIMIT 1
    `).get();if(!o){console.log(`
No sessions found. Run a coding session first!
`),n.close();return}r=o.session_id}let s=F(n,t,r,20);if(n.close(),s.length===0){console.log(`
No pending questions! Great job staying on top of your learning.
`);return}let c=new I.Database(A),l=(0,H.createInterface)({input:process.stdin,output:process.stdout}),i=o=>new Promise(C=>l.question(o,C)),a=0,u=0,p=[...s],E=new Set(p.map(o=>o.id));console.log(`
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501`),console.log(`  VibeLearn Quiz \u2014 ${p.length} questions`),console.log(`\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
`);let f=0;for(;f<p.length;){let o=p[f],C=`Q${f+1}/${p.length}`,W=o.concept_name?` [${o.concept_name}]`:"";console.log(`
${C} (${o.difficulty})${W}`),o.snippet&&o.snippet.trim()&&(console.log(`
  Code:
`),o.snippet.split(`
`).forEach(v=>console.log(`    ${v}`)),console.log("")),console.log(`  ${o.question}
`);let g="",V=Date.now();if(o.question_type==="multiple_choice"&&o.options_json)try{JSON.parse(o.options_json).forEach((y,_)=>{let w=String.fromCharCode(65+_);console.log(`  ${w}) ${y}`)}),console.log(""),g=(await i("  Your answer (A/B/C/D): ")).trim().toUpperCase()}catch{g=(await i("  Your answer: ")).trim()}else if(o.question_type==="fill_in_blank")g=(await i("  Fill in: ")).trim();else if(o.question_type==="ordering"&&o.options_json)try{JSON.parse(o.options_json).forEach((y,_)=>console.log(`  ${_+1}. ${y}`)),console.log(""),g=(await i("  Enter correct order (e.g. 2,4,1,3): ")).trim()}catch{g=(await i("  Your answer: ")).trim()}else o.question_type==="true_false"?g=(await i("  True or False? ")).trim().toLowerCase():(o.question_type==="open_ended"&&console.log("  (Open-ended \u2014 describe your reasoning, then press Enter)"),g=(await i("  Your answer: ")).trim());let Y=Date.now()-V,D=o.question_type==="open_ended",m=!1;!D&&o.correct!==null&&(m=g.toLowerCase()===o.correct.toLowerCase()),D?console.log(`
  \u270E Open-ended noted.
`):m?(console.log(`
  \u2713 Correct!
`),a++):console.log(`
  \u2717 Incorrect. Correct answer: ${o.correct??"(see explanation)"}
`),console.log(`  Explanation: ${o.explanation}
`),console.log("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"),u++;try{let{randomUUID:v}=await import("crypto");if(c.run(`
        INSERT INTO vl_quiz_attempts (id, question_id, answer_given, is_correct, time_taken_ms, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `,[v(),o.id,g,m?1:0,Y,Math.floor(Date.now()/1e3)]),!o.is_follow_up){let y=M({isCorrect:m,currentEaseFactor:o.ease_factor??2.5,currentIntervalDays:o.interval_days??0,currentRepetitions:o.repetitions??0,nowEpoch:Math.floor(Date.now()/1e3)});P(c,o.id,y)}if(o.concept_name&&!D){let y=c.query("SELECT category FROM vl_concepts WHERE concept_name = ? LIMIT 1").get(o.concept_name),_=U(c,{conceptName:o.concept_name,category:y?.category??"general",isCorrect:m});if(_.promoted?console.log(`  \u{1F389} Level up! ${o.concept_name}: ${_.previousLevel} \u2192 ${_.profile.current_level}
`):_.demoted&&console.log(`  \u{1F4C9} Level dropped: ${o.concept_name}: ${_.previousLevel} \u2192 ${_.profile.current_level}
`),Q(o,m,_.profile.current_level,E)){let w=z(o);p.splice(f+1,0,w),E.add(w.id),console.log(`  \u2795 Follow-up added: ${w.question.slice(0,60)}...
`)}}$(c,m)}catch{}f++}l.close(),c.close();let R=u>0?Math.round(a/u*100):0;console.log(`
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501`),console.log(`  Quiz complete: ${a}/${u} correct (${R}%)`),console.log(`\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
`)}async function le(e){let t="http://localhost:37778";async function r(i,a){try{let u=await fetch(`${t}${i}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(a),signal:AbortSignal.timeout(12e4)}),p=await u.json().catch(()=>({}));return{ok:u.ok,status:u.status,data:p}}catch(u){return{ok:!1,status:0,data:{error:u.message}}}}let s=e;if(!s){let i=q();if(!i)return;let a=i.query("SELECT content_session_id, project, started_at FROM sdk_sessions ORDER BY started_at_epoch DESC LIMIT 1").get();if(i.close(),!a){console.log(`
No sessions found in database.
`);return}s=a.content_session_id,console.log(`
  Using latest session: ${a.project} (${a.started_at.slice(0,16)})`),console.log(`  Session ID: ${s}`)}let c=s;console.log(`
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501`),console.log("  VibeLearn Sync \u2014 running analysis pipeline"),console.log("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501");let l=[{label:"stack detection",path:"/api/vibelearn/analyze/stack",body:{contentSessionId:c}},{label:"static analysis",path:"/api/vibelearn/analyze/static",body:{contentSessionId:c}},{label:"concept extraction",path:"/api/vibelearn/analyze/concepts",body:{contentSessionId:c}},{label:"quiz generation",path:"/api/vibelearn/analyze/quiz",body:{contentSessionId:c}},{label:"cloud sync",path:"/api/vibelearn/sync",body:{contentSessionId:c}}];for(let i of l){process.stdout.write(`  ${i.label.padEnd(22)} ... `);let a=await r(i.path,i.body);if(a.ok){let u=a.data;u.status==="skipped"?console.log(`skipped (${u.reason??"unknown reason"})`):console.log("ok")}else if(a.status===0){console.log("failed \u2014 worker not running? Start a session to restart it.");break}else console.log(`failed (HTTP ${a.status})`)}console.log(`\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
`)}async function ue(e,n){if(n){let r=j();if(r.api_key){let s=r.api_key.slice(0,6)+"..."+r.api_key.slice(-4);console.log(`
  Logged in: API key ${s}
`)}else console.log(`
  Not logged in. Run: vl login <api-key>
`);return}e||(console.error(`
  Usage: vl login <api-key>
`),process.exit(1));let t=j();t.api_key=e,re(t),console.log(`
  API key saved to ~/.vibelearn/config.json
`)}async function pe(){let e=process.argv.slice(2);switch(e[0]){case"-v":case"--version":console.log(`vl ${se}`);break;case"quiz":await ae(e.includes("--session"));break;case"status":await ie();break;case"gaps":await ce();break;case"login":{let t=e.includes("--status"),r=t?null:e[1]??null;await ue(r,t);break}case"sync":await le(e[1]??null);break;default:console.log(`
VibeLearn CLI \u2014 learn from your coding sessions

Usage:
  vl quiz              Interactive quiz (all pending questions)
  vl quiz --session    Quiz only the last session's questions
  vl status            Sessions analyzed, concepts by category
  vl gaps              Concepts you haven't mastered yet
  vl sync              Re-run analysis + cloud sync on latest session
  vl sync <session-id> Re-run analysis + cloud sync on a specific session
  vl login <api-key>   Connect to vibelearn.dev
  vl login --status    Check login status
  vl --version         Show version
`)}}pe().catch(e=>{console.error("Error:",e.message),process.exit(1)});
