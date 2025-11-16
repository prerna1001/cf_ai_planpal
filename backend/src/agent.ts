/**
 * Cloudflare Agents-based chat with native session management.
 * 
 * Features:
 * - Agent state for conversation history (Cloudflare-managed persistence)
 * - Custom methods for reminder management
 * - Integrates with PlanPalDO for persistent reminder storage
 * 
 * How it works:
 * - Each Agent instance = one user session (addressed by sessionId)
 * - this.state persists messages automatically (survives restarts)
 * - Custom methods (createReminder, etc.) provide callable actions
 */
import { Agent } from "agents";
import type { Env } from "./types";

interface ChatState {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  user?: string;
}

export class Chat extends Agent<Env, ChatState> {
  // Initial state for new Agent instances
  initialState: ChatState = {
    messages: [],
  };

  async onRequest(request: Request) {
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
        const body = await request.json() as { 
          input?: string; 
          user?: string; // user identifier for reminder operations
        };
        const input = (body.input || "").trim();
        const user = body.user || "default-user";

        // Store user in state for later use by custom methods
        if (!this.state.user) {
          this.setState({ ...this.state, user });
        }

        // Build messages array: system + history (from state) + new input
        const systemPrompt = `You are PlanPal, a friendly and versatile planning assistant chatbot.

Your role is to help users plan ANYTHING:
- Trips and vacations (destinations, itineraries, budgets)
- Weddings (venues, timelines, budgets, guest lists)
- Events (conferences, parties, corporate events)
- Concerts and entertainment
- Shopping lists and errands
- Projects and tasks
- Any other planning needs

How to help:
- Ask relevant clarifying questions (2-4 key details)
- Provide personalized, actionable suggestions and plans
- Be conversational, concise, and helpful
- Use clear markdown with headings, bullet points, and numbered lists
- Don't repeat questions you've already asked
- Adapt your format to the type of plan (Day X for trips, Timeline for events, Checklist for tasks)

Note: There's a separate Reminders feature in the app sidebar for setting time-based reminders. You focus on planning conversations and suggestions.`;

        const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
          { role: "system", content: systemPrompt },
          ...this.state.messages, // Conversation history from Agent state
        ];
        
        if (input) {
          messages.push({ role: "user", content: input });
        }

        // Access env via (this as any).env as a workaround for SDK type limitations
        const env = (this as any).env as Env;

        // Call Workers AI
        const response = await env.AI.run("@cf/meta/llama-3-8b-instruct", {
          messages,
          max_tokens: 500,
        });

        const assistantMessage = response.response || "No response received";

        // Update Agent state with new messages (persists automatically)
        // Only store user and assistant messages in state (not system)
        const newUserMsg: { role: "user" | "assistant"; content: string } = { role: "user", content: input };
        const newAssistantMsg: { role: "user" | "assistant"; content: string } = { role: "assistant", content: assistantMessage };
        
        this.setState({
          ...this.state,
          messages: [
            ...this.state.messages,
            newUserMsg,
            newAssistantMsg,
          ].slice(-20), // Keep last 20 messages to manage state size
        });

        return new Response(JSON.stringify({ response: assistantMessage }), {
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

  // Custom methods for reminder management
  // These can be called programmatically or extended for AI function calling
  
  async createReminder(user: string, text: string, at: string): Promise<any> {
    const env = (this as any).env as Env;
    const id = env.PLANPAL_DO.idFromName(user);
    const stub = env.PLANPAL_DO.get(id);
    const response = await stub.fetch("http://localhost/reminders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, at }),
    });
    return await response.json();
  }

  async listReminders(user: string): Promise<any> {
    const env = (this as any).env as Env;
    const id = env.PLANPAL_DO.idFromName(user);
    const stub = env.PLANPAL_DO.get(id);
    const response = await stub.fetch("http://localhost/reminders", {
      method: "GET",
    });
    return await response.json();
  }

  async deleteReminder(user: string, reminderId: string): Promise<any> {
    const env = (this as any).env as Env;
    const id = env.PLANPAL_DO.idFromName(user);
    const stub = env.PLANPAL_DO.get(id);
    const response = await stub.fetch(`http://localhost/reminders/${reminderId}`, {
      method: "DELETE",
    });
    return await response.json();
  }
}
