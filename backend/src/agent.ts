import { Agent } from "agents";


export class Chat extends Agent {
  // 👇 Fix: Tell TypeScript your class will receive this binding
  ai!: any;

  async onFetch(request: Request) {
    const url = new URL(request.url);
    const input = url.searchParams.get("prompt") || "";

    const response = await this.ai.run("@cf/meta/llama-3-8b-instruct", {
      prompt: input,
      max_tokens: 100,
    });

    return new Response(response.response, {
      headers: { "content-type": "text/plain" },
    });
  }
}

export default {
  fetch: () => new Response("Worker is running"),
};
