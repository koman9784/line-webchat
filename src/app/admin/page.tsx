"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase-browser";

type Conversation = {
  id: string;
  line_user_id: string;
  updated_at: string;
};

type ChatMessage = {
  id: string;
  conversation_id: string;
  content: string;
  sender: "customer" | "admin";
  channel: "line" | "webchat";
  created_at: string;
};

export default function AdminPage() {
  const router = useRouter();
  const [supabase] = useState(() => createSupabaseBrowser());

  const [conversations, setConversations] = useState<Conversation[]>([]);

  const [selected, setSelected] = useState<Conversation | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  // ตรวจสอบ Login และโหลดรายการห้องสนทนา
  const loadConversations = useCallback(async (): Promise<Conversation[] | null> => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.replace("/admin/login");
      return null;
    }

    const { data, error } = await supabase
      .from("conversations")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) {
      console.error(error);
      return null;
    }

    return data ?? [];
  }, [router, supabase]);

  // โหลดข้อความของห้องที่เลือก
  const loadMessages = useCallback(
    async (conversationId: string): Promise<ChatMessage[] | null> => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (error) {
        console.error(error);
        return null;
      }

      return data ?? [];
    },
    [supabase],
  );

  useEffect(() => {
    let active = true;

    loadConversations().then((loadedConversations) => {
      if (active && loadedConversations !== null) {
        setConversations(loadedConversations);
        setLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, [loadConversations]);

  // เมื่อเลือกห้อง ให้โหลดข้อความและสมัคร Realtime
  useEffect(() => {
    if (!selected) {
      return;
    }

    let active = true;

    loadMessages(selected.id).then((loadedMessages) => {
      if (active && loadedMessages !== null) {
        setMessages(loadedMessages);
      }
    });

    const channel = supabase
      .channel(`messages-${selected.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${selected.id}`,
        },
        (payload) => {
          if (!active) return;

          const newMessage = payload.new as ChatMessage;

          setMessages((current) => {
            if (current.some((item) => item.id === newMessage.id)) {
              return current;
            }

            return [...current, newMessage];
          });

          loadConversations().then((loadedConversations) => {
            if (active && loadedConversations !== null) {
              setConversations(loadedConversations);
            }
          });
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [selected, supabase, loadMessages, loadConversations]);

  // ส่งข้อความตอบกลับ
  async function handleSend() {
    if (!selected || !input.trim() || sending) return;

    const message = input.trim();

    setSending(true);

    try {
      const response = await fetch("/api/admin/reply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          conversationId: selected.id,
          message,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Send failed");
      }

      // Realtime จะรับข้อความที่บันทึกเข้ามาเอง
      setInput("");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  // ออกจากระบบ
  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/admin/login");
    router.refresh();
  }

  if (loading) {
    return <main className="p-8">Loading...</main>;
  }

  return (
    <main className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b p-4">
        <h1 className="text-xl font-bold">LINE Admin Chat</h1>

        <button onClick={handleLogout}>Logout</button>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Conversation List */}
        <aside className="w-80 shrink-0 overflow-y-auto border-r">
          <h2 className="border-b p-4 font-semibold">
            Conversations ({conversations.length})
          </h2>

          {conversations.map((conversation) => (
            <button
              key={conversation.id}
              onClick={() => {
                if (selected?.id === conversation.id) return;
                setMessages([]);
                setSelected(conversation);
              }}
              className={`block w-full border-b p-4 text-left ${
                selected?.id === conversation.id
                  ? "bg-gray-100"
                  : "hover:bg-gray-50"
              }`}
            >
              <p className="font-medium">
                {conversation.line_user_id.slice(0, 12)}...
              </p>

              <p className="text-xs text-gray-500">
                {new Date(conversation.updated_at).toLocaleString()}
              </p>
            </button>
          ))}
        </aside>

        {/* Chat Window */}
        <section className="flex min-w-0 flex-1 flex-col">
          {selected ? (
            <>
              <div className="border-b p-4 font-semibold">
                {selected.line_user_id}
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${
                      message.sender === "admin"
                        ? "justify-end"
                        : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-[75%] rounded-xl p-3 ${
                        message.sender === "admin"
                          ? "bg-green-100"
                          : "bg-gray-100"
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{message.content}</p>

                      <p className="mt-1 text-xs text-gray-500">
                        {message.sender} ·{" "}
                        {new Date(message.created_at).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <form
                className="flex gap-2 border-t p-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="พิมพ์ข้อความ..."
                  className="min-w-0 flex-1 rounded-lg border p-3"
                />

                <button
                  type="submit"
                  disabled={sending || !input.trim()}
                  className="rounded-lg bg-green-600 px-5 text-white disabled:opacity-50"
                >
                  {sending ? "กำลังส่ง..." : "ส่ง"}
                </button>
              </form>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-gray-500">
              เลือกห้องสนทนาเพื่อเริ่มแชต
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
