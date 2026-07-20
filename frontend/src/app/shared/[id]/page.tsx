"use client";

import React, { useEffect, useState } from "react";
import { Sparkles, Loader2, AlertCircle } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface SharedSession {
  id: string;
  title: string;
  messages: Message[];
  created_at: string;
}

export default function SharedSessionPage({ params }: { params: { id: string } }) {
  const [session, setSession] = useState<SharedSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  useEffect(() => {
    async function fetchSession() {
      try {
        const res = await fetch(`${apiBaseUrl}/api/shared/${params.id}`);
        if (!res.ok) {
          if (res.status === 404) {
            setError("This shared session was not found or may have been deleted.");
          } else {
            setError("Failed to load this session. Please try again.");
          }
          return;
        }
        const data = await res.json();
        setSession(data);
      } catch {
        setError("Could not connect to Prism. Please check your connection.");
      } finally {
        setLoading(false);
      }
    }
    fetchSession();
  }, [params.id, apiBaseUrl]);

  return (
    <div className="min-h-screen bg-[#080B11] text-white font-sans">
      {/* Header */}
      <header className="h-16 border-b border-[#1E293B] bg-[#0E131F] px-8 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-1.5 bg-emerald-600 rounded-lg">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <span className="font-bold text-emerald-400 tracking-widest text-sm">PRISM</span>
          <span className="text-zinc-600 mx-2">|</span>
          <span className="text-sm text-zinc-400">Shared Session</span>
        </div>
        <a
          href="/"
          className="text-xs text-emerald-500 hover:text-emerald-400 border border-emerald-800 hover:border-emerald-600 px-3 py-1.5 rounded-lg transition"
        >
          Open Prism →
        </a>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto py-10 px-4">
        {loading && (
          <div className="flex flex-col items-center justify-center h-64 space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
            <span className="text-sm text-zinc-400">Loading session...</span>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center h-64 space-y-3 text-center">
            <AlertCircle className="h-10 w-10 text-red-500" />
            <p className="text-red-400 text-sm max-w-sm">{error}</p>
            <a href="/" className="text-xs text-emerald-500 hover:text-emerald-400 underline mt-2">
              Go to Prism
            </a>
          </div>
        )}

        {session && (
          <>
            {/* Title */}
            <div className="mb-8">
              <h1 className="text-xl font-semibold text-slate-200 truncate">{session.title}</h1>
              <p className="text-xs text-zinc-500 mt-1">
                Shared on {new Date(session.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
              </p>
            </div>

            {/* Messages */}
            <div className="space-y-6">
              {session.messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "assistant" && (
                    <div className="mr-3 shrink-0 mt-1">
                      <div className="h-7 w-7 rounded-full bg-emerald-800/60 border border-emerald-700/40 flex items-center justify-center">
                        <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                      </div>
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                      msg.role === "user"
                        ? "bg-emerald-700 text-white rounded-br-sm"
                        : "bg-[#111622] border border-[#1E293B] text-slate-200 rounded-bl-sm"
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer CTA */}
            <div className="mt-12 text-center border-t border-[#1E293B] pt-8">
              <p className="text-sm text-zinc-500 mb-3">Want to ask questions about your own documents?</p>
              <a
                href="/"
                className="inline-flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition"
              >
                <Sparkles className="h-4 w-4" />
                <span>Try Prism Free</span>
              </a>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
