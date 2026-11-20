import Ajv from "ajv";

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

const LINE_PROFILE_API_URL = "https://api.line.me/v2/bot/profile";
const LINE_PROFILE_TIMEOUT_MS = 5000;
const LINE_USER_ID_PATTERN = "^U[0-9a-f]{32}$";

export interface LineUserProfile {
    userId: string;
    displayName: string;
    pictureUrl?: string;
}

// Validate the external profile without exposing its contents in error logs.
const validateLineUserProfile = new Ajv().compile({
    type: "object",
    required: ["userId", "displayName"],
    properties: {
        userId: { type: "string", pattern: LINE_USER_ID_PATTERN },
        displayName: { type: "string", minLength: 1, pattern: "\\S" },
        pictureUrl: { type: "string", format: "uri", pattern: "^https://" },
    },
});

function isLineUserProfile(profile: unknown): profile is LineUserProfile {
    return validateLineUserProfile(profile) === true;
}

export async function getLineUserProfile(userId: string): Promise<LineUserProfile> {
    if (!new RegExp(LINE_USER_ID_PATTERN).test(userId)) {
        throw new Error("Invalid LINE user ID");
    }

    const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!accessToken) {
        throw new Error("LINE_CHANNEL_ACCESS_TOKEN is missing");
    }

    // Keep the channel token server-side and bound the webhook's external request.
    const response = await fetch(`${LINE_PROFILE_API_URL}/${encodeURIComponent(userId)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
        signal: AbortSignal.timeout(LINE_PROFILE_TIMEOUT_MS),
    });

    if (!response.ok) {
        throw new Error(`LINE profile request failed (${response.status})`);
    }

    const profile: unknown = await response.json();
    if (!isLineUserProfile(profile) || profile.userId !== userId) {
        throw new Error("Invalid LINE profile response");
    }

    return profile;
}
