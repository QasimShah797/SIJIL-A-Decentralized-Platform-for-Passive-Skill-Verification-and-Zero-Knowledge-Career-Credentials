import { env } from "../config/env";
import { getServiceSupabase } from "../config/supabase";
import { AppError } from "../utils/AppError";

function jwtRole(token: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"));
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

function requireServiceRoleKey() {
  const role = jwtRole(env.SUPABASE_SERVICE_ROLE_KEY);
  if (role !== "service_role") {
    throw new AppError(
      "SUPABASE_SERVICE_ROLE_KEY is missing or is the anon key. Paste the service_role secret from Supabase → Settings → API into .env.local, then restart the backend.",
      503,
    );
  }
}

type GitHubUser = {
  id: number;
  login: string;
  name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
};

export async function completeGitHubSignIn(input: {
  code: string;
  state: string;
  redirectUri: string;
  clientId?: string;
}): Promise<{ hashed_token: string; email: string; github_username: string }> {
  const clientId = env.GITHUB_OAUTH_CLIENT_ID?.trim();
  const clientSecret = env.GITHUB_OAUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new AppError(
      "Add GITHUB_OAUTH_CLIENT_SECRET to .env.local (GitHub OAuth app client secret), then restart the backend.",
      503,
    );
  }
  if (input.clientId && input.clientId !== clientId) {
    throw new AppError("GitHub client_id does not match the server configuration.", 400);
  }

  let stateKind = "";
  try {
    stateKind = Buffer.from(input.state, "base64").toString("utf8").split(".")[0] ?? "";
  } catch {
    throw new AppError("Invalid GitHub sign-in state.", 400);
  }
  if (stateKind !== "signin") {
    throw new AppError("Invalid GitHub sign-in state.", 400);
  }

  const tokenResp = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code: input.code,
      redirect_uri: input.redirectUri,
    }).toString(),
  });
  const tokenData = (await tokenResp.json()) as {
    access_token?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };
  if (!tokenData.access_token) {
    throw new AppError(
      tokenData.error_description || tokenData.error || "GitHub token exchange failed.",
      400,
    );
  }

  const ghHeaders = {
    Authorization: `Bearer ${tokenData.access_token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "SIJIL-app",
  };
  const userResp = await fetch("https://api.github.com/user", { headers: ghHeaders });
  const ghUser = (await userResp.json()) as GitHubUser;
  if (!userResp.ok || !ghUser.id || !ghUser.login) {
    throw new AppError("Could not load the GitHub user profile.", 400);
  }

  let email =
    typeof ghUser.email === "string" && ghUser.email.includes("@") ? ghUser.email : "";
  if (!email) {
    const emailsResp = await fetch("https://api.github.com/user/emails", { headers: ghHeaders });
    const emails = (await emailsResp.json()) as Array<{
      email?: string;
      primary?: boolean;
      verified?: boolean;
    }>;
    if (Array.isArray(emails)) {
      const primary =
        emails.find((row) => row.primary && row.verified && row.email) ??
        emails.find((row) => row.verified && row.email);
      email = primary?.email ?? "";
    }
  }
  if (!email) email = `${ghUser.id}+${ghUser.login}@users.noreply.github.com`;

  requireServiceRoleKey();
  const admin = getServiceSupabase();
  const { data: existingLink } = await admin
    .from("github_connections")
    .select("user_id")
    .eq("github_user_id", ghUser.id)
    .maybeSingle();

  let userId = existingLink?.user_id as string | undefined;
  if (!userId) {
    const created = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        full_name: ghUser.name || ghUser.login,
        name: ghUser.name || ghUser.login,
        user_name: ghUser.login,
        avatar_url: ghUser.avatar_url,
        picture: ghUser.avatar_url,
        provider_id: String(ghUser.id),
      },
    });
    userId = created.data.user?.id;
    if (!userId && created.error && !/already|registered|exists/i.test(created.error.message)) {
      throw new AppError(created.error.message, 400);
    }
  }

  const { data: userData } = userId
    ? await admin.auth.admin.getUserById(userId)
    : { data: { user: null } };
  const sessionEmail = userData.user?.email || email;

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: sessionEmail,
  });
  if (linkError || !linkData.properties?.hashed_token) {
    const msg = linkError?.message ?? "Could not create a sign-in session.";
    if (/not allowed/i.test(msg)) {
      throw new AppError(
        "SUPABASE_SERVICE_ROLE_KEY must be the service_role key (not anon). Paste it into .env.local and restart the backend.",
        503,
      );
    }
    throw new AppError(msg, 500);
  }
  userId = userId || linkData.user?.id;
  if (!userId) {
    throw new AppError("Could not create or find a SIJIL user for this GitHub account.", 400);
  }

  await admin.from("github_connections").upsert(
    {
      user_id: userId,
      github_user_id: ghUser.id,
      github_username: ghUser.login,
      github_avatar_url: ghUser.avatar_url,
      scopes: tokenData.scope || "",
      access_token: tokenData.access_token,
      token_type: "bearer",
      connected_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  await admin
    .from("learner_profiles")
    .update({ github_url: `https://github.com/${ghUser.login}` })
    .eq("user_id", userId);

  return {
    hashed_token: linkData.properties.hashed_token,
    email: sessionEmail,
    github_username: ghUser.login,
  };
}
