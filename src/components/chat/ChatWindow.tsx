"use client";

import { useState } from "react";
import type { ChatMessage } from "@/types/chat";
import MessageList from "./MessageList";
import ChatInput from "./ChatInput";

const initialMessages: ChatMessage[] = [
  {
    id: "1",
    content: "สวัสดีครับ มีอะไรให้ช่วยเหลือไหมครับ?",
    sender: "admin",
    channel: "line",
    createdAt: new Date().toISOString(),
  },
  {
    id: "2",
    content: "ต้องการสอบถามข้อมูลครับ",
    sender: "customer",
    channel: "webchat",
    createdAt: new Date().toISOString(),
  },
];

export default function ChatWindow() {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);

  function handleSend(message: string) {
    const newMessage: ChatMessage = {
      id: crypto.randomUUID(),
      content: message,
      sender: "customer",
      channel: "webchat",
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, newMessage]);
  }

  return (
    <div className="flex h-150 w-full max-w-2xl flex-col overflow-hidden rounded-2xl border bg-white shadow-lg">
      <div className="border-b bg-blue-600 p-4 text-white">
        <h2 className="font-semibold">LINE OA Webchat</h2>

        <p className="text-sm text-blue-100">Online Chat</p>
      </div>

      <MessageList messages={messages} />

      <ChatInput onSend={handleSend} />
    </div>
  );
}
