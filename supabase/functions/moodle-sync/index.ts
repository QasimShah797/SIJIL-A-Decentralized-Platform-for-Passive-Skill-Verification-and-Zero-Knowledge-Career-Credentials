const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MOODLE_URL = Deno.env.get("MOODLE_URL");
const MOODLE_TOKEN = Deno.env.get("MOODLE_TOKEN");

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function addParam(params: URLSearchParams, key: string, value: unknown) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      Object.entries(item as Record<string, unknown>).forEach(([childKey, childValue]) => {
        params.append(`${key}[${index}][${childKey}]`, String(childValue));
      });
    });
  } else {
    params.append(key, String(value));
  }
}

async function callMoodle(
  wsfunction: string,
  paramsObj: Record<string, unknown> = {},
) {
  if (!MOODLE_URL || !MOODLE_TOKEN) {
    throw new Error("Missing MOODLE_URL or MOODLE_TOKEN");
  }

  const params = new URLSearchParams();

  params.append("wstoken", MOODLE_TOKEN);
  params.append("wsfunction", wsfunction);
  params.append("moodlewsrestformat", "json");

  for (const [key, value] of Object.entries(paramsObj)) {
    addParam(params, key, value);
  }

  const res = await fetch(`${MOODLE_URL}/webservice/rest/server.php`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  const data = await res.json();

  if (!res.ok || data?.exception) {
    console.error("Moodle API error:", data);
    throw new Error(data?.message || "Moodle API request failed");
  }

  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const action = body.action;

    if (action === "test") {
      const siteInfo = await callMoodle("core_webservice_get_site_info");

      return json({
        success: true,
        siteInfo,
      });
    }

    if (action === "get_courses") {
      const courses = await callMoodle("core_course_get_courses");

      return json({
        success: true,
        courses,
      });
    }

    if (action === "find_user_by_email") {
      const email = body.email;

      if (!email) {
        return json({ error: "email is required" }, 400);
      }

      const user = await callMoodle("core_user_get_users", {
        criteria: [
          {
            key: "email",
            value: email,
          },
        ],
      });

      return json({
        success: true,
        user,
      });
    }

    if (action === "get_user_courses") {
      const moodleUserId = body.moodleUserId;

      if (!moodleUserId) {
        return json({ error: "moodleUserId is required" }, 400);
      }

      const courses = await callMoodle("core_enrol_get_users_courses", {
        userid: moodleUserId,
      });

      return json({
        success: true,
        courses,
      });
    }

    if (action === "get_completion") {
      const moodleUserId = body.moodleUserId;
      const courseId = body.courseId;

      if (!moodleUserId || !courseId) {
        return json({ error: "moodleUserId and courseId are required" }, 400);
      }

      const completion = await callMoodle(
        "core_completion_get_course_completion_status",
        {
          userid: moodleUserId,
          courseid: courseId,
        },
      );

      return json({
        success: true,
        completion,
      });
    }

    if (action === "get_grades") {
      const moodleUserId = body.moodleUserId;
      const courseId = body.courseId;

      if (!moodleUserId || !courseId) {
        return json({ error: "moodleUserId and courseId are required" }, 400);
      }

      const grades = await callMoodle("gradereport_user_get_grade_items", {
        userid: moodleUserId,
        courseid: courseId,
      });

      return json({
        success: true,
        grades,
      });
    }

    return json({ error: "Invalid action" }, 400);
  } catch (error) {
    console.error("moodle-sync error:", error);

    return json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});
