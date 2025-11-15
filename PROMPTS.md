This project, **PlanPal**, was built with AI-assisted help using ChatGPT (GPT-4o). Prompts were primarily used to understand Cloudflare’s AI tooling, resolve bugs, and structure conversational memory.

## Sample Prompts Used

### Memory & LLM Integration
- "How do I use Cloudflare Durable Objects to maintain conversational memory for an LLM chatbot?"
- "My chatbot keeps repeating questions. How can I use Durable Objects to store message history and include it in every LLM call?"

### Debugging & Backend Logic
- "Why am I getting 'Method not allowed' or CORS errors when sending POST requests from my React frontend to a Cloudflare Worker?"
- "How to forward user input from a Worker to a Durable Object and send back the LLM response?"

### Deployment & Project Structure
- "How do I deploy a React frontend to Cloudflare Pages and a Worker + DO backend separately and connect them?"
- "How can I configure `wrangler.toml` to deploy my Worker and Durable Object with the correct bindings?"

## Notes
- Most AI assistance was used for **debugging**, **backend memory structure**
- Code was **iteratively refined** and **manually tested** after generation.
- This documentation does **not** list every prompt — only representative ones that significantly contributed to core functionality.
