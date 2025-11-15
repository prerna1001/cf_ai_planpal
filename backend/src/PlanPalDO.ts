import type { Message, Env, DurableObjectState } from "./types";

/**
 * PlanPalDO — Durable Object
 *
 * Owns user-specific state:
 * - Chat memory (the rolling conversation sent to the LLM)
 * - Reminders list and due-notification queue
 *
 * Exposes a tiny JSON API consumed by the Worker:
 *   GET  /memory               → debug: view stored conversation
 *   GET  /reminders            → list upcoming reminders
 *   GET  /reminders/due        → read (and optionally ack) due notifications
 *   POST /reminders            → create reminder
 *   PATCH/DELETE /reminders/:id→ update/delete reminder
 *   POST /chat                 → append user msg, call AI, persist assistant reply
 */


export class PlanPalDO {
state: DurableObjectState;
env: Env;
memory: Message[] = [];
  
 // Reminders storage
 reminders: Array<{ id: string; at: number; text: string } > = [];
 notifications: Array<{ id: string; at: number; text: string } > = [];


constructor(state: DurableObjectState, env: Env) {
this.state = state;
this.env = env;
}


async fetch(request: Request): Promise<Response> {

    const corsHeaders = {
                            "Access-Control-Allow-Origin": "*",
                            "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PATCH, DELETE",
                            "Access-Control-Allow-Headers": "Content-Type",
                        };

    if (request.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: corsHeaders,
        });
    }

    const url = new URL(request.url);

    // DEBUG: GET /memory to view stored conversation
    if (request.method === "GET" && url.pathname === "/memory") {
        const stored = await this.state.storage.get<unknown>("memory");
        const memory = Array.isArray(stored) ? stored : [];
        return new Response(JSON.stringify({ memory, count: memory.length }, null, 2), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    // Reminders: list upcoming
    if (request.method === "GET" && url.pathname === "/reminders") {
        const stored = await this.state.storage.get<unknown>("reminders");
        const reminders = (Array.isArray(stored) ? stored : []) as typeof this.reminders;
        reminders.sort((a,b) => a.at - b.at);
        return new Response(JSON.stringify({ reminders }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    // Reminders: poll for due notifications and optionally ack (clear)
    if (request.method === "GET" && url.pathname === "/reminders/due") {
        const stored = await this.state.storage.get<unknown>("notifications");
        const notifications = (Array.isArray(stored) ? stored : []) as typeof this.notifications;
        const ack = url.searchParams.get("ack") !== "false"; // default true
        if (ack) {
            await this.state.storage.put("notifications", []);
        }
        return new Response(JSON.stringify({ due: notifications }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
    
    // Reminders: update existing (PATCH /reminders/:id)
    if (request.method === "PATCH" && url.pathname.startsWith("/reminders/")) {
        const id = url.pathname.replace("/reminders/", "");
        if (!id) {
            return new Response(JSON.stringify({ error: "Missing reminder id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const body = (await request.json()) as { text?: string; at?: string | number };
        const remStored = await this.state.storage.get<unknown>("reminders");
        const reminders = (Array.isArray(remStored) ? remStored : []) as typeof this.reminders;
        const idx = reminders.findIndex(r => r.id === id);
        if (idx === -1) {
            return new Response(JSON.stringify({ error: "Reminder not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        if (typeof body.text === "string") reminders[idx].text = body.text;
        if (body.at !== undefined) {
            const whenMs = typeof body.at === "number" ? body.at : Date.parse(body.at);
            if (Number.isNaN(whenMs)) {
                return new Response(JSON.stringify({ error: "Invalid date/time" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }
            reminders[idx].at = whenMs;
        }
        await this.state.storage.put("reminders", reminders);
        await this.scheduleNextAlarm(reminders);
        return new Response(JSON.stringify({ ok: true, reminder: reminders[idx] }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Reminders: delete existing (DELETE /reminders/:id)
    if (request.method === "DELETE" && url.pathname.startsWith("/reminders/")) {
        const id = url.pathname.replace("/reminders/", "");
        if (!id) {
            return new Response(JSON.stringify({ error: "Missing reminder id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const remStored = await this.state.storage.get<unknown>("reminders");
        const reminders = (Array.isArray(remStored) ? remStored : []) as typeof this.reminders;
        const next = reminders.filter(r => r.id !== id);
        if (next.length === reminders.length) {
            return new Response(JSON.stringify({ error: "Reminder not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        await this.state.storage.put("reminders", next);
        await this.scheduleNextAlarm(next);
        return new Response(JSON.stringify({ ok: true, deleted: id }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (request.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Route POSTs by path
    if (url.pathname === "/reminders") {
        const { text, at } = await request.json() as { text?: string; at?: string | number };
        if (!text || !at) {
            return new Response(JSON.stringify({ error: "Missing text or at" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const whenMs = typeof at === "number" ? at : Date.parse(at);
        if (Number.isNaN(whenMs)) {
            return new Response(JSON.stringify({ error: "Invalid date/time" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        if (whenMs < Date.now() - 1000) {
            return new Response(JSON.stringify({ error: "Time must be in the future" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        // Load, add, save, schedule next alarm
        const remStored = await this.state.storage.get<unknown>("reminders");
        const reminders = (Array.isArray(remStored) ? remStored : []) as typeof this.reminders;
        const id = `r-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
        reminders.push({ id, at: whenMs, text });
        await this.state.storage.put("reminders", reminders);
        await this.scheduleNextAlarm(reminders);
        return new Response(JSON.stringify({ ok: true, reminder: { id, at: whenMs, text } }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    const { input } = await request.json();

    // Load chat memory and append the new user message
    const stored = await this.state.storage.get<unknown>("memory");
    this.memory = Array.isArray(stored) ? stored : [];

    //Add new user input
    this.memory.push({ role: "user", content: input });

    // Build the system prompt + conversation for the LLM
    const messages: Message[] = [
      {
        role: "system",
        content:`You are PlanPal, a friendly, versatile planning assistant chatbot.
                    
Your role is to help users plan ANYTHING:
- Trips and vacations (destinations, itineraries, budgets)
- Weddings (venues, timelines, budgets, guest lists)
- Events (conferences, parties, corporate events)
- Concerts and entertainment (tickets, venues, schedules)
- Shopping lists and errands
- Projects and tasks
- Any other planning needs

How to help:
- Ask relevant questions to understand what they want to plan (2-4 key details)
- Provide personalized, actionable suggestions and plans
- Be conversational, concise, and helpful
- Don't repeat questions you've already asked
- Adapt your format to the type of plan (Day X for trips, Timeline for events, Checklist for tasks)

FORMATTING RULES:
- When asking numbered questions, format them naturally: "1. Question text here?" not "1." on one line and "HEADING" on another
- Use **bold** for emphasis on important terms, but keep questions flowing naturally
- Keep related text together on the same line
- Use double line breaks only between distinct sections or paragraphs

IMPORTANT LIMITATIONS:
- You are a CHATBOT ONLY - you CANNOT send emails, make bookings, purchase anything, or contact anyone
- You can ONLY provide suggestions, recommendations, and plans in this chat
- Never promise to send emails, confirmations, make reservations, or contact external services
- If the user is satisfied, simply thank them and offer to help with anything else

Keep responses focused and well-structured. Use bullet points, numbered lists, timelines, or checklists as appropriate.`,
      },
      ...this.memory,
    ];

    // Choose model with fallbacks
    // If MODEL env is not set or a model is unavailable, try sensible defaults
        const configured = (this.env.MODEL || "").trim();
        const fallbacksFromEnv = (this.env.MODEL_FALLBACKS || "").split(",").map(s => s.trim()).filter(Boolean);
        const candidateModels = [
            configured,
            "@cf/meta/llama-3.1-8b-instruct",
            "@cf/meta/llama-3-8b-instruct",
            ...fallbacksFromEnv,
        ].filter(Boolean);

        let response: any | undefined;
        let usedModel: string | undefined;
        let lastError: any;
        for (const model of candidateModels) {
            try {
                response = await this.env.AI.run(model, {
                    messages,
                    max_tokens: 500,
                });
                usedModel = model;
                break;
            } catch (err: any) {
                const msg = String(err?.message || err);
                // Prefer graceful fallback on known "missing model" errors; otherwise surface the error
                if (msg.includes("No such model") || msg.includes("5007")) {
                    lastError = err;
                    continue;
                }
                throw err;
            }
        }

        if (!response) {
            throw lastError || new Error("No available model succeeded");
        }

    const reply = response.response;

    // Persist assistant reply and updated memory
    this.memory.push({ role: "assistant", content: reply });

    // Save memory
    await this.state.storage.put("memory", this.memory);

        return new Response(JSON.stringify({ response: reply }), {
    status: 200,
    headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
    },
    });
}

    // Alarm handler: move due reminders to notifications and schedule next
    async alarm(): Promise<void> {
        const remStored = await this.state.storage.get<unknown>("reminders");
        const notificationsStored = await this.state.storage.get<unknown>("notifications");
        const reminders = (Array.isArray(remStored) ? remStored : []) as typeof this.reminders;
        const notifications = (Array.isArray(notificationsStored) ? notificationsStored : []) as typeof this.notifications;

        const now = Date.now();
        const due: typeof this.reminders = [];
        const future: typeof this.reminders = [];
        for (const r of reminders) {
            if (r.at <= now) due.push(r); else future.push(r);
        }

        if (due.length > 0) {
            notifications.push(...due);
            await this.state.storage.put("notifications", notifications);
        }

        await this.state.storage.put("reminders", future);
        await this.scheduleNextAlarm(future);
    }

    // Helper: set the next alarm to the soonest reminder, if any
    private async scheduleNextAlarm(reminders?: Array<{ id: string; at: number; text: string }>): Promise<void> {
        const stored = reminders ?? (await this.state.storage.get<unknown>("reminders"));
        const list = (Array.isArray(stored) ? stored : []) as Array<{ id: string; at: number; text: string }>;
        if (list.length === 0) return;
        const nextAt = list.reduce((min: number, r: { at: number }) => Math.min(min, r.at), Number.POSITIVE_INFINITY);
        if (Number.isFinite(nextAt)) {
            await this.state.storage.setAlarm(nextAt);
        }
    }
}