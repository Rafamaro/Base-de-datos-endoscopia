import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync, sign } from "node:crypto";
import { POST } from "../app/api/ingest/route.js";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "test-kid", alg: "RS256", use: "sig" };
const ORG = "635756ea-787a-4a11-b9a9-4c303e5a1649";
const SEDE = "192f45c7-c838-45d9-ac88-9a62c6e545a4";
const keys = ["ENDODB_ACCESS_TEAM_DOMAIN", "ENDODB_ACCESS_AUD", "ENDODB_ORGANIZATION_ID", "DIRECTUS_URL", "ENDODB_INGEST_AUTH_TOKEN", "ENDODB_WEBHOOK_SHARED_SECRET", "ENDODB_V5_WEBHOOK_URL", "ENDODB_PUBLIC_URL"];
const before = Object.fromEntries(keys.map(key => [key, process.env[key]]));
const originalFetch = globalThis.fetch;
function setup() {
  Object.assign(process.env, {
    ENDODB_ACCESS_TEAM_DOMAIN:"https://team.cloudflareaccess.com",
    ENDODB_ACCESS_AUD:"test-endodb",
    ENDODB_ORGANIZATION_ID:ORG,
    DIRECTUS_URL:"https://directus.drperez86.com",
    ENDODB_INGEST_AUTH_TOKEN:"TEST_MEMBERSHIP_READ_ONLY",
    ENDODB_WEBHOOK_SHARED_SECRET:"THIS_IS_A_TEST_SHARED_SECRET_LONG",
    ENDODB_V5_WEBHOOK_URL:"https://n8n.drperez86.com/webhook/endodb/process-exam-directus-v5-nuevo",
    ENDODB_PUBLIC_URL:"https://endodb.drperez86.com",
  });
}
function token(email = "r@example.com") {
 const now=Math.floor(Date.now()/1000);
 const head=Buffer.from(JSON.stringify({alg:"RS256",kid:"test-kid"})).toString("base64url");
 const body=Buffer.from(JSON.stringify({iss:"https://team.cloudflareaccess.com",aud:["test-endodb"],sub:"id",type:"app",email,iat:now,nbf:now,exp:now+120})).toString("base64url");
 const v=head+"."+body;return v+"."+sign("RSA-SHA256",Buffer.from(v),privateKey).toString("base64url");
}
function request({ jwt=token(), site=SEDE, file=true }={}) {
 const f=new FormData(); f.set("sede_id",site);if(file)f.set("file",new Blob(["Informe clínico sin identificadores"],{type:"text/plain"}),"informe.txt");
 return new Request("https://endodb.drperez86.com/api/ingest",{method:"POST",headers:{Origin:"https://endodb.drperez86.com",...(jwt?{"cf-access-jwt-assertion":jwt}:{})},body:f});
}
function fakeBackend({allow=true,siteValid=true}={}) {
 let webhookCalls=0,queries=[];
 globalThis.fetch=async (url,options={})=>{
  const u=new URL(url), p=u.pathname;
  if(p.endsWith("/cdn-cgi/access/certs")) return Response.json({keys:[jwk]});
  if(p==="/items/bd_sedes"){queries.push(JSON.parse(u.searchParams.get("filter")));return Response.json({data:siteValid?[{id:SEDE,organizacion:ORG,activo:true}]:[]})}
  if(p==="/items/bd_membresias"){queries.push(JSON.parse(u.searchParams.get("filter")));return Response.json({data:allow?[{id:"member"}]:[]})}
  if(p.startsWith("/webhook/")){webhookCalls++;assert.equal(options.headers["x-endodb-secret"],"THIS_IS_A_TEST_SHARED_SECRET_LONG");assert.equal(options.body.get("sede_id"),SEDE);return Response.json({ok:true,ingesta_id:20,estudios_creados:[{id:7}]});}
  throw Error("Unexpected destination "+p);
 };
 return {calls:()=>webhookCalls,queries};
}
test.after(()=>{globalThis.fetch=originalFetch;for(const k of keys)if(before[k]===undefined)delete process.env[k];else process.env[k]=before[k]});
test("v5 only forwards to n8n after real JWT and membership", {concurrency:false},async()=>{
 setup();const fake=fakeBackend();const r=await POST(request());assert.equal(r.status,200);const d=await r.json();assert.equal(d.ingesta_id,20);assert.equal(fake.calls(),1);assert.equal(fake.queries.length,2);
});
test("rejects missing/forged Access JWT, no downstream writes",{concurrency:false},async()=>{
 setup();const fake=fakeBackend();assert.equal((await POST(request({jwt:null}))).status,403);
 assert.equal((await POST(request({jwt:token().slice(0,-2)+"xx"}))).status,403);
 assert.equal(fake.calls(),0);
});
test("rejects revoked site membership and invalid site",{concurrency:false},async()=>{
 setup();const a=fakeBackend({allow:false});assert.equal((await POST(request())).status,403);assert.equal(a.calls(),0);
 const b=fakeBackend({siteValid:false});assert.equal((await POST(request())).status,403);assert.equal(b.calls(),0);
});
test("misconfigured webhook host fails closed",{concurrency:false},async()=>{
 setup();process.env.ENDODB_V5_WEBHOOK_URL="https://other.example.com/webhook/endodb/process-exam-directus-v5-nuevo";
 const f=fakeBackend();assert.equal((await POST(request())).status,503);assert.equal(f.calls(),0);
});
