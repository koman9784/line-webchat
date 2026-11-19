import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendLineTextMessage } from "@/services/line.service";

export async function POST(request: NextRequest) {
  try {
    // 1. ตรวจสอบว่าเจ้าหน้าที่ Login แล้วหรือยัง
    const supabase = await createSupabaseServer();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // 2. รับข้อมูลจาก Browser
    const body = await request.json();

    const conversationId = body.conversationId;
    const message = body.message?.trim();

    if (
      typeof conversationId !== "string" ||
      typeof message !== "string" ||
      !message ||
      message.length > 5000
    ) {
      return NextResponse.json(
        { error: "Invalid request" },
        { status: 400 }
      );
    }

    // 3. ค้นหาห้องสนทนา
    const { data: conversation, error: conversationError } =
      await supabaseAdmin
        .from("conversations")
        .select("id, line_user_id")
        .eq("id", conversationId)
        .single();

    if (conversationError || !conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    // 4. ส่งข้อความไปยัง LINE
    await sendLineTextMessage({
      to: conversation.line_user_id,
      text: message,
    });

    // 5. บันทึกข้อความตอบกลับลง Database
    const { data: savedMessage, error: saveError } =
      await supabaseAdmin
        .from("messages")
        .insert({
          conversation_id: conversation.id,
          content: message,
          sender: "admin",
          channel: "line",
        })
        .select()
        .single();

    if (saveError) {
      console.error("Message save error:", saveError);

      return NextResponse.json(
        {
          error: "Message was sent to LINE but could not be saved",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: savedMessage,
    });
  } catch (error) {
    console.error("Admin Reply Error:", error);

    return NextResponse.json(
      { error: "Unable to send message" },
      { status: 500 }
    );
  }
}
