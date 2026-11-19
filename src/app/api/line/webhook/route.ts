
import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";

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
          .select("id")
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

      console.log("Message saved:", {
        userId,
        eventId,
      });
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
