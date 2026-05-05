// All Firebase-era auth controllers (sendOtp, verifyOtp,
// resolveCredentialConflict) are gone — Supabase Auth handles signup +
// login + password reset directly from the SPA via @supabase/supabase-js,
// and the API only verifies the resulting JWT in middleware. Nothing to
// re-export here yet; keeping the file so existing route imports surface
// a clear error instead of a missing-module path.
export {}