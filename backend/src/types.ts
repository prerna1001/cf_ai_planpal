export interface Env {
  AI: any;
  Chat: DurableObjectNamespace;
  PLANPAL_DO: DurableObjectNamespace;
  // Optional model override(s)
  MODEL?: string; // preferred model id, e.g. "@cf/meta/llama-3.1-8b-instruct"
  MODEL_FALLBACKS?: string; // comma-separated list of fallbacks
}

export interface Message{
  role: "user" | "assistant" | "system";
  content: string;
}

export interface DurableObjectState {
  storage: DurableObjectStorage;
}

export interface DurableObjectStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put<T = unknown>(key: string, value: T): Promise<void>;
  setAlarm(scheduledTime: number | Date): Promise<void>;
}

export interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}

export interface DurableObjectId {}
export interface DurableObjectStub {
  fetch(input: RequestInfo, init?: RequestInit): Promise<Response>;
}

export interface ExecutionContext {
  waitUntil(promise: Promise<any>): void;
  passThroughOnException(): void;
}
