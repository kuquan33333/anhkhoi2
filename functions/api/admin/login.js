import { json } from "../../_utils.js";

export async function onRequestPost() {
  return json({
    ok:false,
    error:"legacy_login_disabled",
    use:"/api/admin/challenge + /api/admin/login-proof"
  },410);
}
