
interface LineTextMessageRequest {
    to: string;
    text: string;
}

interface LineApiError {
    message?: string;
    details?: Array<{
        message: string;
        property?: string;
    }>;
}

export async function sendLineTextMessage({
    to,
    text,
}: LineTextMessageRequest): Promise<void> {
    const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

    if (!accessToken) {
        throw new Error("LINE_CHANNEL_ACCESS_TOKEN is missing");
    }

    const response = await fetch(
        "https://api.line.me/v2/bot/message/push",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
                to,
                messages: [
                    {
                        type: "text",
                        text,
                    },
                ],
            }),
            cache: "no-store",
        }
    );

    if (!response.ok) {
        const errorData =
            (await response.json().catch(() => ({}))) as LineApiError;
        console.error("LINE API Error:", errorData);

        throw new Error(
            errorData.message || `LINE API Error: ${response.status}`
        );
    }
}
