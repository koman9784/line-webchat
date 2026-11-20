"use client";

import Image from "next/image";
import { useState } from "react";

const AVATAR_SIZE = 40;
const INITIALS_LENGTH = 2;

type ConversationAvatarProps = {
  name: string;
  pictureUrl: string | null;
  active?: boolean;
};

export default function ConversationAvatar({
  name,
  pictureUrl,
  active = false,
}: ConversationAvatarProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  return (
    <span aria-hidden="true" className={`flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl text-sm font-bold ${
      active ? "bg-emerald-600 text-white" : "bg-sky-100 text-sky-700"
    }`}>
      {pictureUrl && pictureUrl !== failedUrl ? (
        <Image
          src={pictureUrl}
          alt=""
          width={AVATAR_SIZE}
          height={AVATAR_SIZE}
          unoptimized
          referrerPolicy="no-referrer"
          className="size-full object-cover"
          onError={() => {
            console.error("Conversation avatar could not be loaded");
            setFailedUrl(pictureUrl);
          }}
        />
      ) : name.slice(0, INITIALS_LENGTH).toUpperCase()}
    </span>
  );
}
