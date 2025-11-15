import { PlanPalDO } from "./PlanPalDO";
export { PlanPalDO };
import type { Env, ExecutionContext } from "./types";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PATCH, DELETE",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      // Route: GET /ai/check?model=...  -- quick availability check for Workers AI models
      if (request.method === "GET" && url.pathname === "/ai/check") {
        const model = url.searchParams.get("model") || "@cf/meta/llama-3.3-8b-instruct";
        try {
          // Tiny probe to see if model is usable
          const result = await env.AI.run(model, {
            prompt: "ping",
            max_tokens: 1,
          });
          return new Response(
            JSON.stringify({ ok: true, model, responseSample: result?.response ?? null }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } catch (err) {
          return new Response(
            JSON.stringify({ ok: false, model, error: (err as Error).message }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
      // Route: GET /memory/:user - Debug endpoint to view stored memory
      if (request.method === "GET" && url.pathname.startsWith("/memory/")) {
        const user = url.pathname.split("/memory/")[1];
        if (!user) {
          return new Response(JSON.stringify({ error: "Missing user parameter" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const id = env.PLANPAL_DO.idFromName(user);
        const stub = env.PLANPAL_DO.get(id);
        
        return await stub.fetch("http://localhost/memory", {
          method: "GET",
        });
      }

      // Route: GET /reminders?user=... - list upcoming reminders for a user
      if (request.method === "GET" && url.pathname === "/reminders") {
        const user = url.searchParams.get("user");
        if (!user) {
          return new Response(JSON.stringify({ error: "Missing user parameter" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const id = env.PLANPAL_DO.idFromName(user);
        const stub = env.PLANPAL_DO.get(id);
        const doRes = await stub.fetch("http://localhost/reminders", { method: "GET" });
        const body = await doRes.text();
        return new Response(body, { status: doRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Route: GET /reminders/due?user=...&ack=true - poll due notifications
      if (request.method === "GET" && url.pathname === "/reminders/due") {
        const user = url.searchParams.get("user");
        const ack = url.searchParams.get("ack");
        if (!user) {
          return new Response(JSON.stringify({ error: "Missing user parameter" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const id = env.PLANPAL_DO.idFromName(user);
        const stub = env.PLANPAL_DO.get(id);
        const path = ack == null ? "http://localhost/reminders/due" : `http://localhost/reminders/due?ack=${encodeURIComponent(ack)}`;
        const doRes = await stub.fetch(path, { method: "GET" });
        const body = await doRes.text();
        return new Response(body, { status: doRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Route: POST /reminders - create a reminder for a user
      if (url.pathname === "/reminders" && request.method === "POST") {
        const { user, text, at } = await request.json();
        if (!user || !text || !at) {
          return new Response(JSON.stringify({ error: "Missing user, text, or at" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const id = env.PLANPAL_DO.idFromName(user);
        const stub = env.PLANPAL_DO.get(id);
        const doRes = await stub.fetch("http://localhost/reminders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, at }),
        });
        const body = await doRes.text();
        return new Response(body, { status: doRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Route: POST /chat
      if (url.pathname === "/chat" && request.method === "POST") {
        // Parse request
        const { user, input } = await request.json();
        if (!user || !input) {
          return new Response(JSON.stringify({ error: "Missing user or input" }), { 
            status: 400, 
            headers: { ...corsHeaders, "Content-Type": "application/json" } 
          });
        }

        // Get DO stub for this user
        const id = env.PLANPAL_DO.idFromName(user);
        const stub = env.PLANPAL_DO.get(id);

        // Forward request to Durable Object at /chat with absolute URL
        const doRes = await stub.fetch("http://localhost/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input }),
        });

        // Return response back to frontend
        const body = await doRes.text();
        return new Response(body, {
          status: doRes.status,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        });
      }

      // Route: PATCH /reminders/:id?user=... - update reminder
      if (request.method === "PATCH" && url.pathname.startsWith("/reminders/")) {
        const user = url.searchParams.get("user");
        if (!user) {
          return new Response(JSON.stringify({ error: "Missing user parameter" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const id = env.PLANPAL_DO.idFromName(user);
        const stub = env.PLANPAL_DO.get(id);
        const body = await request.text();
        const doRes = await stub.fetch(`http://localhost${url.pathname}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body,
        });
        const resBody = await doRes.text();
        return new Response(resBody, { status: doRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Route: DELETE /reminders/:id?user=... - delete reminder
      if (request.method === "DELETE" && url.pathname.startsWith("/reminders/")) {
        const user = url.searchParams.get("user");
        if (!user) {
          return new Response(JSON.stringify({ error: "Missing user parameter" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const id = env.PLANPAL_DO.idFromName(user);
        const stub = env.PLANPAL_DO.get(id);
        const doRes = await stub.fetch(`http://localhost${url.pathname}`, { method: "DELETE" });
        const resBody = await doRes.text();
        return new Response(resBody, { status: doRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

  return new Response("Not found", { status: 404, headers: corsHeaders });
    } catch (error) {
      console.error("Worker error:", error);
      return new Response(JSON.stringify({ error: "Internal server error", details: (error as Error).message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  },
};
