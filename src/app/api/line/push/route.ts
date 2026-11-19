
import { NextRequest, NextResponse } from "next/server";
import { sendLineTextMessage } from "@/services/line.service";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log("Request body:", body);

    const { message } = body;
    console.log("Received message:", message);

    if (
      typeof message !== "string" ||
      !message.trim()
    ) {
      return NextResponse.json(
        { success: false, error: "Message is required" },
        { status: 400 }
      );
    }

    if (message.length > 5000) {
      return NextResponse.json(
        { success: false, error: "Message is too long" },
        { status: 400 }
      );
    }

    const userId = process.env.LINE_TEST_USER_ID;

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "LINE_TEST_USER_ID is missing" },
        { status: 500 }
      );
    }

    await sendLineTextMessage({
      to: userId,
      text: message.trim(),
    });

    return NextResponse.json({
      success: true,
      message: "Message sent successfully",
    });

  } catch (error) {
    console.error("LINE Push Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error
          ? error.message
          : "Internal server error",
      },
      { status: 500 }
    );
  }
}
