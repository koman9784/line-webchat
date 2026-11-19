
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // วนอ่าน Event ที่ LINE ส่งเข้ามา
    for (const event of body.events ?? []) {
      // ดึง LINE User ID
      const userId = event.source?.userId;

      // ตรวจสอบว่าเป็นข้อความหรือไม่
      if (event.type === "message" && event.message?.type === "text") {
        const message = event.message.text;

        console.log("LINE User ID:", userId);
        console.log("Message:", message);
      }
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
