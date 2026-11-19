import type { ChatMessage } from "@/types/chat";

interface MessageListProps {
  messages: ChatMessage[];
}

export default function MessageList({ messages }: MessageListProps) {
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.map((message) => {
        const isCustomer = message.sender === "customer";

        return (
          <div
            key={message.id}
            className={`flex ${isCustomer ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                isCustomer
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-800"
              }`}
            >
              <p className="wrap-break-word">{message.content}</p>

              <div className="mt-2 flex justify-between gap-4 text-xs opacity-70">
                <span>{message.channel === "line" ? "LINE" : "Webchat"}</span>

                <span>
                  {new Date(message.createdAt).toLocaleTimeString("th-TH", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
