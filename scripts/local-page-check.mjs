// Read-only checks against the running development app. No browser rendering claim.
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const web = "http://127.0.0.1:5173", api = "http://127.0.0.1:4000/api";
const checks = [];
async function check(url, expected = 200, token, kind = "API") {
  const response = await fetch(url, {headers:token ? {Authorization:"Bearer " + token} : {}, signal:AbortSignal.timeout(15000)});
  const result = {kind, path:new URL(url).pathname, expected, status:response.status, pass:response.status === expected};
  if (kind === "SPA shell" && result.pass) result.pass = /id="root"/.test(await response.text());
  checks.push(result);
  assert.ok(result.pass, `${kind} ${result.path}: expected ${expected}, got ${response.status}`);
  return response;
}
try {
  await check(api + "/health");
  const paths = ["/", "/start", "/login", "/login/worker", "/login/assessor", "/login/admin", "/register", "/about", "/help", "/account",
    "/worker", ...["dashboard","profile","myskills","passport","reassessment","evidence","trade","years","describe","skills","match","quiz","result"].map(p=>"/worker/"+p),
    "/assessor", ...["candidates","assessments","reports","calibration"].map(p=>"/assessor/"+p),
    "/admin", ...["users","assessors","qualifications","assessments","batches","passports","calibration","quality","sync","analytics","audit-log","settings"].map(p=>"/admin/"+p),
    "/verify/unknown-credential", "/passports/unknown-assessment", "/missing"];
  for (const path of paths) await check(web+path, 200, undefined, "SPA shell");
  for (const path of ["/dakshsetu-logo.png", "/digilocker-logo.png", "/src/App.tsx", "/src/pages/Auth.tsx", "/src/pages/Admin.tsx", "/src/pages/Assessor.tsx", "/src/pages/Worker.tsx", "/src/pages/WorkerPortal.tsx", "/src/pages/Quality.tsx", "/src/pages/Passport.tsx"]) await check(web+path, 200, undefined, "Asset/module");
  const tokens = {};
  for (const role of ["worker","assessor","admin"]) {
    const response = await fetch(api+"/auth/login", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:role+"@dakshsetu.demo",password:"demo123",role}),signal:AbortSignal.timeout(15000)});
    assert.equal(response.status,200, `${role} demo login (no account changes performed)`);
    const data = await response.json(); assert.equal(data.user.role,role); tokens[role]=data.token;
    checks.push({kind:"Role login",path:role,expected:200,status:response.status,pass:true});
  }
  const rolePaths = {
    worker:["/auth/me","/workers/me","/workers/portal"],
    assessor:["/auth/me","/assessor/dashboard","/assessor/candidates","/calibration/cases"],
    admin:["/auth/me","/manage/analytics","/manage/users","/manage/assessors","/manage/qualifications","/manage/assessments","/manage/batches","/manage/passports","/manage/calibration","/manage/sync","/manage/settings","/admin/audit-log","/admin/quality","/manage/reports.csv"],
  };
  for (const [role, paths] of Object.entries(rolePaths)) for (const path of paths) await check(api+path,200,tokens[role],role+" page data");
  const candidates = await (await check(api+"/assessor/candidates",200,tokens.assessor,"Candidate discovery")).json();
  for (let i=0;i<candidates.length;i++) {
    const id=candidates[i].user.id;
    // Deliberately omit candidate names and record IDs from the saved report.
    const response = await fetch(api+"/assessor/candidates/"+encodeURIComponent(id),{headers:{Authorization:"Bearer "+tokens.assessor},signal:AbortSignal.timeout(15000)});
    assert.equal(response.status,200,"Assigned candidate detail");
    checks.push({kind:"Candidate detail",path:"assigned candidate "+(i+1),expected:200,status:200,pass:true});
  }
  for (const path of ["/workers/me","/assessor/dashboard","/manage/users"]) await check(api+path,401,undefined,"Signed-out protection");
  await check(api+"/manage/users",403,tokens.worker,"Worker role isolation");
  await check(api+"/manage/users",403,tokens.assessor,"Assessor role isolation");
  await check(api+"/assessor/dashboard",403,tokens.worker,"Worker role isolation");
  await check(api+"/credentials/unknown-credential/verify",404,undefined,"Unknown credential");
} catch(error) {
  checks.push({kind:"Failure",pass:false,message:error instanceof Error ? error.message : "Check failed"});
  process.exitCode=1;
} finally {
  await writeFile("server/data/local-page-check.json",JSON.stringify({checkedAt:new Date().toISOString(),note:"HTTP shell/module and read-only API checks; not browser rendering or visual QA",checks},null,2));
  console.log(JSON.stringify({passed:checks.filter(c=>c.pass).length,failed:checks.filter(c=>!c.pass).length,report:"server/data/local-page-check.json"}));
}
