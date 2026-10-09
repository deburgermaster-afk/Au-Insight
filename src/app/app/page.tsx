"use client";

import { useEffect, useState } from "react";
import type { UIMessage } from "ai";
import { Chat } from "@/components/chat/chat";
import { createClient } from "@/lib/supabase/client";

export default function AskPage() {
  const [chat, setChat] = useState<{ id: string; messages: UIMessage[] } | null>(null);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data } = await supabase.from("chats").select("id, messages").order("updated_at", { ascending: false }).limit(1).maybeSingle();
      if (data) return setChat({ id: data.id, messages: (data.messages as UIMessage[]) ?? [] });
      const { data: created } = await supabase.from("chats").insert({}).select("id").single();
      if (created) setChat({ id: created.id, messages: [] });
    })();
  }, []);

  if (!chat) return <div className="flex-1" />;
  return <Chat chatId={chat.id} initialMessages={chat.messages} />;
}
