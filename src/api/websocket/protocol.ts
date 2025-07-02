import { z } from 'zod';

// Client -> Server message types
export const ClientMessageTypes = {
  SUBSCRIBE: 'subscribe',
  UNSUBSCRIBE: 'unsubscribe',
  RESUME: 'resume',
  PING: 'ping'
} as const;

// Server -> Client message types
export const ServerMessageTypes = {
  CONNECTED: 'connected',
  SUBSCRIBED: 'subscribed',
  UNSUBSCRIBED: 'unsubscribed',
  ERROR: 'error',
  PONG: 'pong',
  RESUME_SUCCESS: 'resume_success',
  RESUME_ERROR: 'resume_error',
  EXECUTION_STATUS: 'execution_status',
  // Workflow events
  WORKFLOW_STARTED: 'workflow_started',
  NODE_STARTED: 'node_started',
  NODE_COMPLETED: 'node_completed',
  NODE_FAILED: 'node_failed',
  WORKFLOW_PAUSED: 'workflow_paused',
  WORKFLOW_RESUMED: 'workflow_resumed',
  WORKFLOW_COMPLETED: 'workflow_completed',
  WORKFLOW_FAILED: 'workflow_failed',
  HUMAN_INTERACTION_REQUIRED: 'human_interaction_required',
  STATE_UPDATED: 'state_updated',
  WORKFLOW_EVENT: 'workflow_event'
} as const;

// Message type union
export type MessageType = 
  | typeof ClientMessageTypes[keyof typeof ClientMessageTypes]
  | typeof ServerMessageTypes[keyof typeof ServerMessageTypes];

// Base message structure
export interface WebSocketMessage {
  type: MessageType;
  data: any;
  timestamp?: number;
}

// Client message schemas
const SubscribeMessageSchema = z.object({
  type: z.literal(ClientMessageTypes.SUBSCRIBE),
  data: z.object({
    executionId: z.string()
  })
});

const UnsubscribeMessageSchema = z.object({
  type: z.literal(ClientMessageTypes.UNSUBSCRIBE),
  data: z.object({
    executionId: z.string()
  })
});

const ResumeMessageSchema = z.object({
  type: z.literal(ClientMessageTypes.RESUME),
  data: z.object({
    executionId: z.string(),
    nodeId: z.string(),
    data: z.any()
  })
});

const PingMessageSchema = z.object({
  type: z.literal(ClientMessageTypes.PING),
  data: z.object({})
});

// Union of all client messages
const ClientMessageSchema = z.union([
  SubscribeMessageSchema,
  UnsubscribeMessageSchema,
  ResumeMessageSchema,
  PingMessageSchema
]);

// Parse and validate incoming messages
export function parseMessage(rawMessage: string): WebSocketMessage {
  try {
    const parsed = JSON.parse(rawMessage);
    const validated = ClientMessageSchema.parse(parsed);
    return validated;
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid message format: ${error.errors.map(e => e.message).join(', ')}`);
    }
    throw new Error('Invalid JSON message');
  }
}

// Create typed messages
export function createMessage(type: MessageType, data: any): WebSocketMessage {
  return {
    type,
    data,
    timestamp: Date.now()
  };
}

// Type guards
export function isClientMessage(message: WebSocketMessage): boolean {
  return Object.values(ClientMessageTypes).includes(message.type as any);
}

export function isServerMessage(message: WebSocketMessage): boolean {
  return Object.values(ServerMessageTypes).includes(message.type as any);
}

// Specific message type interfaces for better type safety
export interface SubscribeMessage {
  type: typeof ClientMessageTypes.SUBSCRIBE;
  data: {
    executionId: string;
  };
}

export interface ResumeMessage {
  type: typeof ClientMessageTypes.RESUME;
  data: {
    executionId: string;
    nodeId: string;
    data: any;
  };
}

export interface HumanInteractionRequiredMessage {
  type: typeof ServerMessageTypes.HUMAN_INTERACTION_REQUIRED;
  data: {
    executionId: string;
    nodeId: string;
    nodeInfo: {
      name: string;
      formSchema?: any;
      uiHints?: any;
      contextData?: any;
    };
  };
  timestamp: number;
}

export interface WorkflowEventMessage {
  type: typeof ServerMessageTypes.WORKFLOW_EVENT;
  data: {
    executionId: string;
    [key: string]: any;
  };
  timestamp: number;
}