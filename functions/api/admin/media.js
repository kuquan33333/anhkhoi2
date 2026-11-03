import { requireAdmin } from "../../_auth.js";
import { json } from "../../_utils.js";

const ALLOWED = new Set(["image/jpeg","image/png","image/webp","image/gif","image/avif"]);
const EXT = {"image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/gif":"gif","image/avif":"avif"};
const MAX_BYTES = 8 * 1024 * 1024;

function safeName(name) {
  return String(name || "image").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0,80) || "image";
}

export async function onRequestGet({ request, env }) {
  const auth = await requireAdmin(request, env);
  if (!auth.ok) return auth.response;
  const listed = await env.MEDIA.list({ prefix:"admin/", limit:100 });
  const items = (listed.objects || []).sort((a,b)=>new Date(b.uploaded)-new Date(a.uploaded)).map(obj=>({
    key:obj.key,size:obj.size,uploaded:obj.uploaded,url:"/api/media?key="+encodeURIComponent(obj.key)
  }));
  return json({ ok:true,items,truncated:!!listed.truncated });
}

export async function onRequestPost({ request, env }) {
  const auth = await requireAdmin(request, env, { csrf:true });
  if (!auth.ok) return auth.response;
  let form; try { form = await request.formData(); } catch { return json({ok:false,error:"invalid_form"},400); }
  const file = form.get("file");
  if (!(file instanceof File)) return json({ok:false,error:"file_required"},400);
  if (!ALLOWED.has(file.type)) return json({ok:false,error:"unsupported_type"},415);
  if (!file.size || file.size > MAX_BYTES) return json({ok:false,error:"file_too_large",maxBytes:MAX_BYTES},413);
  const ext = EXT[file.type] || "bin";
  const now = new Date();
  const folder = now.getUTCFullYear()+"/"+String(now.getUTCMonth()+1).padStart(2,"0");
  const base = safeName(file.name.replace(/\.[^.]+$/,""));
  const key = "admin/"+folder+"/"+base+"-"+crypto.randomUUID().slice(0,8)+"."+ext;
  await env.MEDIA.put(key,file,{
    httpMetadata:{contentType:file.type,cacheControl:"public, max-age=31536000, immutable"},
    customMetadata:{originalName:file.name.slice(0,120),uploadedBy:auth.auth.username}
  });
  return json({ok:true,key,url:"/api/media?key="+encodeURIComponent(key),size:file.size,type:file.type});
}

export async function onRequestDelete({ request, env }) {
  const auth = await requireAdmin(request, env, { csrf:true });
  if (!auth.ok) return auth.response;
  const key = new URL(request.url).searchParams.get("key") || "";
  if (!/^admin\/[A-Za-z0-9/_\-.]+$/.test(key)) return json({ok:false,error:"invalid_key"},400);
  await env.MEDIA.delete(key);
  return json({ok:true});
}
