
import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLineUserProfile } from "@/services/line.service";

const PROFILE_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

type ProfileConversation = {
  id: string;
  line_user_id: string;
  profile_checked_at: string | null;
};

async function refreshConversationProfile(conversation: ProfileConversation) {
  const now = new Date();
  const cutoffTime = now.getTime() - PROFILE_REFRESH_INTERVAL_MS;
  const cutoff = new Date(cutoffTime).toISOString();
  if (conversation.profile_checked_at && Date.parse(conversation.profile_checked_at) > cutoffTime) return;

  // Atomically throttle profile requests across concurrent webhook deliveries.
  const claim = supabaseAdmin.from("conversations")
    .update({ profile_checked_at: now.toISOString() }).eq("id", conversation.id);
  const { data: claimed, error: claimError } = await (
    conversation.profile_checked_at === null
      ? claim.is("profile_checked_at", null)
      : claim.lte("profile_checked_at", cutoff)
  ).select("id").maybeSingle();
  if (claimError) {
    console.error("Unable to schedule LINE profile refresh", { code: claimError.code });
    return;
  }
  if (!claimed) return;

  try {
    const profile = await getLineUserProfile(conversation.line_user_id);
    const { error } = await supabaseAdmin.from("conversations").update({
      display_name: profile.displayName,
      picture_url: profile.pictureUrl ?? null,
    }).eq("id", conversation.id);
    if (error) console.error("Unable to save LINE profile", { code: error.code });
  } catch (error) {
    // Profile enrichment is optional; the message has already been saved.
    console.error("LINE profile refresh failed; existing profile retained", {
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const channelSecret = process.env.LINE_CHANNEL_SECRET;
    const signature = request.headers.get("x-line-signature");

    if (!channelSecret || !signature) {
      return NextResponse.json(
        { error: "Missing signature configuration" },
        { status: 401 }
      );
    }

    // 1. อ่าน Raw Body
    const rawBody = await request.text();

    // 2. ตรวจสอบ LINE Signature
    const expectedSignature = createHmac("sha256", channelSecret)
      .update(rawBody)
      .digest("base64");

    const received = Buffer.from(signature, "base64");
    const expected = Buffer.from(expectedSignature, "base64");

    if (
      received.length !== expected.length ||
      !timingSafeEqual(received, expected)
    ) {
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }

    // 3. แปลง JSON
    const body = JSON.parse(rawBody);

    // 4. วนอ่าน Event
    for (const event of body.events ?? []) {
      // สนใจเฉพาะข้อความตัวอักษรจากผู้ใช้
      if (
        event.type !== "message" ||
        event.message?.type !== "text"
      ) {
        continue;
      }

      const userId = event.source?.userId;
      const message = event.message.text;
      const eventId = event.webhookEventId;

      if (!userId || typeof message !== "string") {
        continue;
      }

      // 5. สร้างห้องสนทนา หรือใช้ห้องเดิม
      const { data: conversation, error: conversationError } =
        await supabaseAdmin
          .from("conversations")
          .upsert(
            {
              line_user_id: userId,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "line_user_id" }
          )
          .select("id, line_user_id, profile_checked_at")
          .single();

      if (conversationError) {
        throw conversationError;
      }

      // 6. บันทึกข้อความ
      const { error: messageError } = await supabaseAdmin
        .from("messages")
        .upsert(
          {
            conversation_id: conversation.id,
            content: message,
            sender: "customer",
            channel: "line",
            external_event_id: eventId ?? null,
          },
          {
            onConflict: "external_event_id",
            ignoreDuplicates: true,
          }
        );

      if (messageError) {
        throw messageError;
      }

      await refreshConversationProfile(conversation);

      console.log("Message saved");
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Webhook Error:", error);

    return NextResponse.json(
      { success: false, error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
