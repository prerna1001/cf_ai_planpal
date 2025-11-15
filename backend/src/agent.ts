// Optional/experimental Agent-based chat example.
// Not required for core PlanPal flow (Worker + DO), but kept as a reference.
import { Agent } from "agents";
import { Env } from "./types";

export class Chat extends Agent {
  ai!: any;

  async onFetch(request: Request) {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (request.method === "POST") {
      try {
        const body = await request.json() as { input: string };
        const input = body.input || "";

        const response = await this.ai.run("@cf/meta/llama-3-8b-instruct", {
          prompt: input,
          max_tokens: 100,
        });

        return new Response(JSON.stringify({ response: response.response }), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      } catch (error) {
        console.error("Error in Chat:", error);
        return new Response(
          JSON.stringify({ error: "Failed to process request", details: (error as Error).message }),
          {
            status: 500,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          }
        );
      }
    }

    return new Response("Method not allowed", { 
      status: 405,
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight for all routes
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (url.pathname === "/chat") {
      // Route to Chat Durable Object
      const id = env.Chat.idFromName("chat-session");
      const durableObject = env.Chat.get(id);
      return durableObject.fetch(request);
    }

    return new Response("Not found", { 
      status: 404,
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    });
  },
};
