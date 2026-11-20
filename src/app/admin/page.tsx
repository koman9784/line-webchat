"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase-browser";
import ConversationAvatar from "@/components/admin/ConversationAvatar";

type Conversation = {
  id: string;
  line_user_id: string;
  display_name: string | null;
  picture_url: string | null;
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

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = conversations.find((conversation) => conversation.id === selectedId) ?? null;

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
    const applyConversations = (loadedConversations: Conversation[] | null) => {
      if (active && loadedConversations !== null) {
        setConversations(loadedConversations);
        setLoading(false);
      }
    };
    loadConversations().then(applyConversations);

    const channel = supabase.channel("admin-conversations").on(
      "postgres_changes",
      { event: "*", schema: "public", table: "conversations" },
      () => {
        if (active) loadConversations().then(applyConversations);
      },
    ).subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [loadConversations, supabase]);

  // เมื่อเลือกห้อง ให้โหลดข้อความและสมัคร Realtime
  useEffect(() => {
    if (!selectedId) {
      return;
    }

    let active = true;

    loadMessages(selectedId).then((loadedMessages) => {
      if (active && loadedMessages !== null) {
        setMessages(loadedMessages);
      }
    });

    const channel = supabase
      .channel(`messages-${selectedId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${selectedId}`,
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
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [selectedId, supabase, loadMessages]);

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
    return (
      <main className="flex min-h-dvh items-center justify-center bg-emerald-50 text-emerald-800">
        <p role="status" className="rounded-2xl border border-emerald-100 bg-white px-8 py-6 shadow-sm">
          กำลังโหลดห้องสนทนา...
        </p>
      </main>
    );
  }

  return (
    <main className="flex h-dvh flex-col bg-gradient-to-br from-emerald-50 via-slate-50 to-sky-50 text-slate-800">
      <header className="flex shrink-0 items-center justify-between gap-4 bg-gradient-to-r from-emerald-700 via-emerald-600 to-teal-600 px-4 py-5 text-white shadow-lg shadow-emerald-900/10 sm:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-7">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2V11.5a9.5 9.5 0 0 1 19 0Z" />
              <path strokeLinecap="round" d="M7 10h10M7 14h6" />
            </svg>
          </span>
          <div className="min-w-0">
            <h1 className="text-lg font-bold tracking-tight sm:text-2xl">Line OA Web Chat</h1>
            <p className="mt-1 text-xs text-emerald-100 sm:text-sm">จัดการทุกบทสนทนาในที่เดียว</p>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="shrink-0 rounded-xl border border-white/30 bg-white/10 px-4 py-2 text-sm font-medium transition hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
        >
          Logout
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 p-3 sm:p-5 md:flex-row md:gap-5 lg:p-6">
        {/* Conversation List */}
        <aside className="flex max-h-48 shrink-0 flex-col overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-sm md:max-h-none md:w-72 lg:w-80">
          <div className="flex items-center justify-between border-b border-emerald-100 bg-emerald-50/70 px-5 py-4">
            <h2 className="font-semibold text-emerald-900">ห้องสนทนา</h2>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
              {conversations.length}
            </span>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {conversations.length === 0 && (
              <p className="px-2 py-6 text-center text-sm text-slate-500">ยังไม่มีห้องสนทนา</p>
            )}
            {conversations.map((conversation) => (
            <button
              key={conversation.id}
              onClick={() => {
                if (selected?.id === conversation.id) return;
                setMessages([]);
                setSelectedId(conversation.id);
              }}
              aria-pressed={selected?.id === conversation.id}
              className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${
                selected?.id === conversation.id
                  ? "border-emerald-300 bg-emerald-50 shadow-sm"
                  : "border-transparent hover:border-slate-200 hover:bg-slate-50"
              }`}
            >
              <ConversationAvatar
                name={conversation.display_name ?? conversation.line_user_id}
                pictureUrl={conversation.picture_url}
                active={selectedId === conversation.id}
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {conversation.display_name ?? conversation.line_user_id}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {new Date(conversation.updated_at).toLocaleString()}
                </p>
              </div>
            </button>
            ))}
          </div>
        </aside>

        {/* Chat Window */}
        <section aria-label="หน้าต่างแชต" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {selected ? (
            <>
              <div className="flex shrink-0 items-center gap-3 border-b border-slate-100 bg-white px-5 py-4">
                <ConversationAvatar
                  name={selected.display_name ?? selected.line_user_id}
                  pictureUrl={selected.picture_url}
                  active
                />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-emerald-700">กำลังสนทนากับ</p>
                  <h2 className="mt-1 break-all font-semibold">{selected.display_name ?? selected.line_user_id}</h2>
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-gradient-to-b from-slate-50 to-emerald-50/40 p-4 sm:p-6">
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
                      className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm sm:max-w-[75%] ${
                        message.sender === "admin"
                          ? "rounded-tr-sm bg-emerald-600 text-white"
                          : "rounded-tl-sm border border-slate-200 bg-white text-slate-800"
                      }`}
                    >
                      <p className="whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]">{message.content}</p>

                      <p className={`mt-2 text-xs ${
                        message.sender === "admin" ? "text-emerald-50" : "text-slate-500"
                      }`}>
                        {message.sender} ·{" "}
                        {new Date(message.created_at).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <form
                className="flex shrink-0 gap-3 border-t border-slate-100 bg-white p-4 sm:p-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  aria-label="ข้อความตอบกลับ"
                  placeholder="พิมพ์ข้อความ..."
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm placeholder:text-slate-500 focus:border-emerald-500 focus:bg-white focus:outline-2 focus:outline-emerald-200"
                />

                <button
                  type="submit"
                  disabled={sending || !input.trim()}
                  className="shrink-0 rounded-xl bg-emerald-700 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {sending ? "กำลังส่ง..." : "ส่ง"}
                </button>
              </form>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center bg-gradient-to-br from-white via-emerald-50/50 to-sky-50 p-6 text-center">
              <span aria-hidden="true" className="mb-6 flex size-24 items-center justify-center rounded-3xl bg-emerald-100 text-emerald-600 ring-8 ring-emerald-50">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-12">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H6l-3 3V11.5a8.5 8.5 0 0 1 17 0Z" />
                  <path strokeLinecap="round" d="M8 10h7M8 14h4" />
                </svg>
              </span>
              <h2 className="text-lg font-semibold text-slate-800 sm:text-xl">พร้อมดูแลทุกบทสนทนา</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                เลือกห้องสนทนาเพื่อเริ่มแชต
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
