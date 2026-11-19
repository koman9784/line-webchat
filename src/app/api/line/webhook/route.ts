
import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";

export async function POST(request: NextRequest) {
  try {
    const channelSecret = process.env.LINE_CHANNEL_SECRET;
    const signature = request.headers.get("x-line-signature");

    if (!channelSecret || !signature) {
      return NextResponse.json(
        { success: false, error: "Missing signature configuration" },
        { status: 401 }
      );
    }

    // อ่าน Raw Body ก่อนแปลงเป็น JSON
    const rawBody = await request.text();

    // สร้าง Signature เพื่อตรวจสอบ
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
        { success: false, error: "Invalid signature" },
        { status: 401 }
      );
    }

    const body = JSON.parse(rawBody);

    for (const event of body.events ?? []) {
      const userId = event.source?.userId;

      if (
        event.type === "message" &&
        event.message?.type === "text"
      ) {
        console.log("LINE User ID:", userId);
        console.log("Message:", event.message.text);
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
