/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_GITHUB_CLIENT_ID: string;
  readonly VITE_GITHUB_REDIRECT_URI: string;
  readonly VITE_API_BASE_URL?: string;
  /** Frontend Moodle site filter/display only — never a token. */
  readonly VITE_MOODLE_SITE_URL?: string;
  /**
   * Loopback URL for local moodle-sync bridge (Local Moodle → Hosted Supabase).
   * Never a Moodle token or service-role key.
   */
  readonly VITE_MOODLE_SYNC_BRIDGE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
