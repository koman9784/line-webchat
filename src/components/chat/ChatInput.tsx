"use client";

import { useState } from "react";

interface ChatInputProps {
  onSend: (message: string) => void;
}

export default function ChatInput({ onSend }: ChatInputProps) {
  const [message, setMessage] = useState("");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const trimmedMessage = message.trim();

    if (!trimmedMessage) return;

    onSend(trimmedMessage);
    setMessage("");
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 border-t p-4">
      <input
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="พิมพ์ข้อความ..."
        className="flex-1 rounded-xl border px-4 py-3 outline-none focus:border-blue-500"
      />

      <button
        type="submit"
        disabled={!message.trim()}
        className="rounded-xl bg-blue-600 px-6 text-white hover:bg-blue-700 disabled:opacity-50"
      >
        ส่ง
      </button>
    </form>
  );
}
