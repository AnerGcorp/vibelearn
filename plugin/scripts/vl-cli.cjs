#!/usr/bin/env bun
#!/usr/bin/env bun
"use strict";var B=Object.create;var x=Object.defineProperty;var G=Object.getOwnPropertyDescriptor;var J=Object.getOwnPropertyNames;var K=Object.getPrototypeOf,X=Object.prototype.hasOwnProperty;var Z=(e,n,t,s)=>{if(n&&typeof n=="object"||typeof n=="function")for(let r of J(n))!X.call(e,r)&&r!==t&&x(e,r,{get:()=>n[r],enumerable:!(s=G(n,r))||s.enumerable});return e};var ee=(e,n,t)=>(t=e!=null?B(K(e)):{},Z(n||!e||!e.__esModule?x(t,"default",{value:e,enumerable:!0}):t,e));var j=require("readline"),N=require("bun:sqlite"),q=require("path"),T=require("os"),m=require("fs");function I(e,n){let t=e+n;return t===0?0:e/t}function O(e){return e>=.85?"senior":e>=.5?"mid":"junior"}function M(e,n){let t=Math.floor(Date.now()/1e3),s=e.query("SELECT * FROM vl_developer_profile WHERE concept_name = ?").get(n.conceptName);if(!s){let p=n.isCorrect?1:0,a=n.isCorrect?0:1,v=I(p,a),f=n.isCorrect?1:0,S=O(v);return e.run(`INSERT INTO vl_developer_profile
        (concept_name, category, first_seen_at, last_seen_at, encounter_count,
         correct_answers, incorrect_answers, current_level, streak_count, mastery_score)
       VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,[n.conceptName,n.category,t,t,p,a,S,f,v]),{concept_name:n.conceptName,category:n.category,first_seen_at:t,last_seen_at:t,encounter_count:1,correct_answers:p,incorrect_answers:a,current_level:S,streak_count:f,mastery_score:v}}let r=s.correct_answers+(n.isCorrect?1:0),i=s.incorrect_answers+(n.isCorrect?0:1),c=I(r,i),l=n.isCorrect?s.streak_count+1:0,u=O(c);return e.run(`UPDATE vl_developer_profile SET
       last_seen_at       = ?,
       encounter_count    = encounter_count + 1,
       correct_answers    = ?,
       incorrect_answers  = ?,
       current_level      = ?,
       streak_count       = ?,
       mastery_score      = ?
     WHERE concept_name = ?`,[t,r,i,u,l,c,n.conceptName]),{...s,last_seen_at:t,encounter_count:s.encounter_count+1,correct_answers:r,incorrect_answers:i,current_level:u,streak_count:l,mastery_score:c}}function k(e,n){let t=new Date().toISOString().slice(0,10);e.query("SELECT questions_answered, correct_answers FROM vl_daily_streaks WHERE date = ?").get(t)?e.run(`UPDATE vl_daily_streaks SET
         questions_answered = questions_answered + 1,
         correct_answers    = correct_answers + ?
       WHERE date = ?`,[n?1:0,t]):e.run(`INSERT INTO vl_daily_streaks (date, questions_answered, correct_answers, streak_continues)
       VALUES (?, 1, ?, 1)`,[t,n?1:0])}function $(e){let{isCorrect:n,currentEaseFactor:t,currentIntervalDays:s,currentRepetitions:r,nowEpoch:i}=e;if(!n){let p=Math.max(1.3,t-.2);return{nextReviewAt:i+86400,easeFactor:p,intervalDays:1,repetitions:0}}let c=t+.1,l=r+1,u;return l===1?u=1:l===2?u=6:u=Math.round(s*t),{nextReviewAt:i+u*86400,easeFactor:c,intervalDays:u,repetitions:l}}function F(e,n,t){e.run(`UPDATE vl_questions
     SET next_review_at = ?,
         ease_factor    = ?,
         interval_days  = ?,
         repetitions    = ?
     WHERE id = ?`,[t.nextReviewAt,t.easeFactor,t.intervalDays,t.repetitions,n])}function U(e,n,t,s=20){let r=t?"AND q.session_id = ?":"",i=t?[n,t,s]:[n,s];return e.query(`
    SELECT q.id, q.session_id, q.question_type, q.difficulty,
           q.question, q.options_json, q.correct, q.explanation, q.snippet,
           q.ease_factor, q.interval_days, q.repetitions, q.follow_up_mid,
           c.concept_name
    FROM vl_questions q
    LEFT JOIN vl_concepts c ON q.concept_id = c.id
    WHERE (q.next_review_at IS NULL OR q.next_review_at <= ?)
    ${r}
    ORDER BY q.next_review_at ASC NULLS FIRST, q.created_at DESC
    LIMIT ?
  `).all(...i)}var R=["junior","mid","senior"],ne=3;function te(e){let n=R.indexOf(e);return n===-1||n>=R.length-1?"senior":R[n+1]}function oe(e){let n=R.indexOf(e);return n<=0?"junior":R[n-1]}function P(e,n){let t=e.query("SELECT current_level FROM vl_developer_profile WHERE concept_name = ?").get(n.conceptName),s=!t,r=t?.current_level??"junior",i=M(e,n),c=i.current_level,l=!1,u=!1;if(!s)if(n.isCorrect&&i.streak_count>=ne){let a=te(r);a!==r?(c=a,l=!0,e.run("UPDATE vl_developer_profile SET current_level = ?, streak_count = 0 WHERE concept_name = ?",[c,n.conceptName]),i.streak_count=0):(c=r,e.run("UPDATE vl_developer_profile SET current_level = ? WHERE concept_name = ?",[c,n.conceptName]))}else if(n.isCorrect)c=r,e.run("UPDATE vl_developer_profile SET current_level = ? WHERE concept_name = ?",[c,n.conceptName]);else{let a=oe(r);a!==r?(c=a,u=!0,e.run("UPDATE vl_developer_profile SET current_level = ? WHERE concept_name = ?",[c,n.conceptName])):(c=r,e.run("UPDATE vl_developer_profile SET current_level = ? WHERE concept_name = ?",[c,n.conceptName]))}return{profile:{...i,current_level:c},levelChanged:!s&&c!==r,previousLevel:r,promoted:l,demoted:u}}function Q(e,n,t,s){if(!e.follow_up_mid||!e.follow_up_mid.trim()||e.difficulty!=="junior"||!n||t!=="junior")return!1;let r=`followup_${e.id}`;return!s.has(r)}function z(e){return{id:`followup_${e.id}`,concept_name:e.concept_name,question_type:"open_ended",difficulty:"mid",snippet:e.snippet??null,question:e.follow_up_mid??"",options_json:null,correct:null,explanation:"(Follow-up \u2014 no single correct answer. Reflect on your understanding.)",follow_up_mid:null,is_follow_up:!0}}var b=process.env.VIBELEARN_DATA_DIR?process.env.VIBELEARN_DATA_DIR.replace("~",(0,T.homedir)()):(0,q.join)((0,T.homedir)(),".vibelearn"),L=(0,q.join)(b,"vibelearn.db"),A=(0,q.join)(b,"config.json");function H(){try{if((0,m.existsSync)(A))return JSON.parse((0,m.readFileSync)(A,"utf-8"))}catch{}return{}}function re(e){(0,m.existsSync)(b)||(0,m.mkdirSync)(b,{recursive:!0}),(0,m.writeFileSync)(A,JSON.stringify(e,null,2),"utf-8")}function h(){return(0,m.existsSync)(L)?new N.Database(L,{readonly:!0}):(console.log("No VibeLearn database found. Start a coding session first!"),null)}async function se(){let e=h();if(!e)return;let n=e.query("SELECT COUNT(*) as count FROM vibelearn_session_summaries").get()?.count??0,t=e.query("SELECT COUNT(*) as count FROM vl_concepts").get()?.count??0,s=e.query("SELECT COUNT(*) as count FROM vl_questions").get()?.count??0,r=e.query(`
    SELECT COUNT(*) as count FROM vl_questions
    WHERE id NOT IN (SELECT DISTINCT question_id FROM vl_quiz_attempts)
  `).get()?.count??0,i=e.query(`
    SELECT category, COUNT(*) as count
    FROM vl_concepts
    GROUP BY category
    ORDER BY count DESC
    LIMIT 10
  `).all(),c=e.query(`
    SELECT COUNT(*) as count FROM vl_developer_profile WHERE mastery_score > 0.85
  `).get()?.count??0;console.log(`
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501`),console.log("  VibeLearn Status"),console.log("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501"),console.log(`  Sessions analyzed : ${n}`),console.log(`  Concepts captured : ${t}`),console.log(`  Quiz questions    : ${s} (${r} pending)`),console.log(`  Mastered concepts : ${c}`),i.length>0&&(console.log(`
  Top categories:`),i.forEach(l=>{console.log(`    ${l.category.padEnd(20)} ${l.count}`)})),console.log(`\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
`),e.close()}async function ie(){let e=h();if(!e)return;let n=e.query(`
    SELECT concept_name, category, mastery_score, encounter_count as times_seen
    FROM vl_developer_profile
    WHERE mastery_score < 0.5
    ORDER BY mastery_score ASC, times_seen DESC
    LIMIT 20
  `).all();if(n.length===0){console.log(`
No knowledge gaps found. Keep coding and learning!
`),e.close();return}console.log(`
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501`),console.log("  Knowledge Gaps (mastery < 50%)"),console.log("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501"),n.forEach(t=>{let s="\u2588".repeat(Math.round(t.mastery_score*10))+"\u2591".repeat(10-Math.round(t.mastery_score*10)),r=Math.round(t.mastery_score*100);console.log(`  ${t.concept_name.padEnd(30)} [${s}] ${String(r).padStart(3)}%  (${t.category})`)}),console.log(`\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
`),e.close()}async function ce(e){let n=h();if(!n)return;let t=Math.floor(Date.now()/1e3),s;if(e){let o=n.query(`
      SELECT session_id FROM vibelearn_session_summaries
      ORDER BY generated_at DESC LIMIT 1
    `).get();if(!o){console.log(`
No sessions found. Run a coding session first!
`),n.close();return}s=o.session_id}let r=U(n,t,s,20);if(n.close(),r.length===0){console.log(`
No pending questions! Great job staying on top of your learning.
`);return}let i=new N.Database(L),c=(0,j.createInterface)({input:process.stdin,output:process.stdout}),l=o=>new Promise(C=>c.question(o,C)),u=0,p=0,a=[...r],v=new Set(a.map(o=>o.id));console.log(`
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501`),console.log(`  VibeLearn Quiz \u2014 ${a.length} questions`),console.log(`\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
`);let f=0;for(;f<a.length;){let o=a[f],C=`Q${f+1}/${a.length}`,W=o.concept_name?` [${o.concept_name}]`:"";console.log(`
${C} (${o.difficulty})${W}`),o.snippet&&o.snippet.trim()&&(console.log(`
  Code:
`),o.snippet.split(`
`).forEach(y=>console.log(`    ${y}`)),console.log("")),console.log(`  ${o.question}
`);let g="",Y=Date.now();if(o.question_type==="multiple_choice"&&o.options_json)try{JSON.parse(o.options_json).forEach((E,_)=>{let w=String.fromCharCode(65+_);console.log(`  ${w}) ${E}`)}),console.log(""),g=(await l("  Your answer (A/B/C/D): ")).trim().toUpperCase()}catch{g=(await l("  Your answer: ")).trim()}else if(o.question_type==="fill_in_blank")g=(await l("  Fill in: ")).trim();else if(o.question_type==="ordering"&&o.options_json)try{JSON.parse(o.options_json).forEach((E,_)=>console.log(`  ${_+1}. ${E}`)),console.log(""),g=(await l("  Enter correct order (e.g. 2,4,1,3): ")).trim()}catch{g=(await l("  Your answer: ")).trim()}else o.question_type==="true_false"?g=(await l("  True or False? ")).trim().toLowerCase():(o.question_type==="open_ended"&&console.log("  (Open-ended \u2014 describe your reasoning, then press Enter)"),g=(await l("  Your answer: ")).trim());let V=Date.now()-Y,D=o.question_type==="open_ended",d=!1;!D&&o.correct!==null&&(d=g.toLowerCase()===o.correct.toLowerCase()),D?console.log(`
  \u270E Open-ended noted.
`):d?(console.log(`
  \u2713 Correct!
`),u++):console.log(`
  \u2717 Incorrect. Correct answer: ${o.correct??"(see explanation)"}
`),console.log(`  Explanation: ${o.explanation}
`),console.log("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"),p++;try{let{randomUUID:y}=await import("crypto");if(i.run(`
        INSERT INTO vl_quiz_attempts (id, question_id, answer_given, is_correct, time_taken_ms, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `,[y(),o.id,g,d?1:0,V,Math.floor(Date.now()/1e3)]),!o.is_follow_up){let E=$({isCorrect:d,currentEaseFactor:o.ease_factor??2.5,currentIntervalDays:o.interval_days??0,currentRepetitions:o.repetitions??0,nowEpoch:Math.floor(Date.now()/1e3)});F(i,o.id,E)}if(o.concept_name&&!D){let E=i.query("SELECT category FROM vl_concepts WHERE concept_name = ? LIMIT 1").get(o.concept_name),_=P(i,{conceptName:o.concept_name,category:E?.category??"general",isCorrect:d});if(_.promoted?console.log(`  \u{1F389} Level up! ${o.concept_name}: ${_.previousLevel} \u2192 ${_.profile.current_level}
`):_.demoted&&console.log(`  \u{1F4C9} Level dropped: ${o.concept_name}: ${_.previousLevel} \u2192 ${_.profile.current_level}
`),Q(o,d,_.profile.current_level,v)){let w=z(o);a.splice(f+1,0,w),v.add(w.id),console.log(`  \u2795 Follow-up added: ${w.question.slice(0,60)}...
`)}}k(i,d)}catch{}f++}c.close(),i.close();let S=p>0?Math.round(u/p*100):0;console.log(`
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501`),console.log(`  Quiz complete: ${u}/${p} correct (${S}%)`),console.log(`\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
`)}async function le(e,n){if(n){let s=H();if(s.api_key){let r=s.api_key.slice(0,6)+"..."+s.api_key.slice(-4);console.log(`
  Logged in: API key ${r}
`)}else console.log(`
  Not logged in. Run: vl login <api-key>
`);return}e||(console.error(`
  Usage: vl login <api-key>
`),process.exit(1));let t=H();t.api_key=e,re(t),console.log(`
  API key saved to ~/.vibelearn/config.json
`)}async function ae(){let e=process.argv.slice(2);switch(e[0]){case"quiz":await ce(e.includes("--session"));break;case"status":await se();break;case"gaps":await ie();break;case"login":{let t=e.includes("--status"),s=t?null:e[1]??null;await le(s,t);break}default:console.log(`
VibeLearn CLI \u2014 learn from your coding sessions

Usage:
  vl quiz              Interactive quiz (all pending questions)
  vl quiz --session    Quiz only the last session's questions
  vl status            Sessions analyzed, concepts by category
  vl gaps              Concepts you haven't mastered yet
  vl login <api-key>   Connect to vibelearn.dev
  vl login --status    Check login status
`)}}ae().catch(e=>{console.error("Error:",e.message),process.exit(1)});
