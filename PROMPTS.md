This project, **PlanPal**, was built with AI-assisted help using GitHub Copilot and ChatGPT. Prompts were primarily used to understand Cloudflare's AI tooling, implement native Agents, resolve bugs, and structure conversational memory.

## Sample Prompts Used

### Memory & LLM Integration
- "How do I use Cloudflare Durable Objects to maintain conversational memory for an LLM chatbot?"
- "My chatbot keeps repeating questions. How can I use Durable Objects to store message history and include it in every LLM call?"
- "How does Cloudflare Agents' built-in state management work? How do I use `this.state` to persist conversation?"

### Workflows & Orchestration
- "What is the difference between Workflows and Durable Objects for scheduling?"
- "How can I use Cloudflare Workflows for durable reminder scheduling instead of DO alarms?"
- "Where can I find documentation for Workflows and how to integrate them?"

### Debugging & Backend Logic
- "Why am I getting 'Method not allowed' or CORS errors when sending POST requests from my React frontend to a Cloudflare Worker?"
- "How to forward user input from a Worker to a Durable Object and send back the LLM response?"
- "Property 'env' does not exist on type 'Chat' — how do I access environment bindings in an Agent class?"

### Deployment & Project Structure
- "How do I deploy a React frontend to Cloudflare Pages and a Worker + DO backend separately and connect them?"
- "How can I configure `wrangler.toml` to deploy my Worker and Durable Object with the correct bindings?"
- "How do I add a Chat Agent binding to wrangler.toml for the Agents SDK?"

### UI/UX & Frontend
- "How can I render AI-generated plans with proper markdown instead of fragile regex?"
- "My textarea keeps expanding vertically in a flex container. How do I fix it?"
- "How do I implement voice input using the Web Speech API in React?"

## Notes
- **Native Cloudflare Features**: Project now uses Agents SDK for conversation memory, DOs for reminders, and documents Workflows for future enhancement.
- Most AI assistance was used for **debugging**, **understanding Agents SDK**, **backend memory structure**, and **Cloudflare-specific patterns**.
- Code was **iteratively refined** and **manually tested** after generation.
- This documentation does **not** list every prompt — only representative ones that significantly contributed to core functionality and the native Cloudflare stack.
