/**
 * Cloudflare Worker entrypoint for PlanPal
 * - Provides a small HTTP router for chat and reminders
 * - Adds friendly CORS so Cloudflare Pages/localhost can call the API
 * - Routes chat to Cloudflare Agents (Chat DO) for session-based conversation
 * - Routes reminders to PlanPalDO for persistent storage and alarm management
 *
 * If you're debugging a route, search for its section below (e.g. /agents-chat, /reminders).
 */
import { PlanPalDO } from "./PlanPalDO";
import { Chat } from "./agent";
import { getAgentByName } from "agents";
export { PlanPalDO, Chat };
import type { Env, ExecutionContext } from "./types";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Shared CORS headers: keep Pages and local dev unblocked
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
      // Agents-based chat: POST /agents-chat — primary chat endpoint using Cloudflare Agents
      if (request.method === "POST" && url.pathname === "/agents-chat") {
        // Parse sessionId from request to route to the correct Agent instance
        const body = await request.clone().json() as { sessionId?: string };
        const sessionId = body.sessionId || "default-session";

        // Use getAgentByName from Agents SDK to route to the correct Agent instance
        const agent = await getAgentByName(env.CHAT_AGENT, sessionId);
        return await agent.fetch(request);
      }
  // Health probe: GET /ai/check?model=...  — tiny call to verify a Workers AI model is usable
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
  // Debug: GET /memory/:sessionId — fetch chat memory from the Chat Agent for that session
      if (request.method === "GET" && url.pathname.startsWith("/memory/")) {
        const sessionId = url.pathname.split("/memory/")[1];
        if (!sessionId) {
          return new Response(JSON.stringify({ error: "Missing sessionId parameter" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Route to the Chat Agent instance for this sessionId
        const agent = await getAgentByName(env.CHAT_AGENT, sessionId);
        return await agent.fetch(new Request("http://localhost/memory", { method: "GET" }));
      }

  // Reminders: list upcoming for a user
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

  // Reminders: poll due notifications; add ack=true to clear after reading
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

  // Reminders: create
      if (url.pathname === "/reminders" && request.method === "POST") {
        const { user, text, at } = await request.json() as { user?: string; text?: string; at?: string };
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

      // Note: legacy /chat route removed in favor of /agents-chat

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
