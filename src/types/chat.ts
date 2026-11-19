
export type MessageSender = "customer" | "admin";

export type MessageChannel = "webchat" | "line";

export interface ChatMessage {
  id: string;
  content: string;
  sender: MessageSender;
  channel: MessageChannel;
  createdAt: string;
}

export interface SendMessageRequest {
  message: string;
  conversationId: string;
}

export interface SendMessageResponse {
  success: boolean;
  message?: ChatMessage;
  error?: string;
}
