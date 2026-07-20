"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { 
  UploadCloud, 
  FileText, 
  CheckCircle, 
  AlertCircle, 
  Loader2, 
  Send, 
  MessageSquare, 
  Database, 
  Sparkles, 
  Trash2,
  FileSpreadsheet,
  Image as ImageIcon,
  Sun,
  Moon,
  Eye,
  LogOut,
  Pencil,
  RefreshCcw,
  Download,
  Share2,
  Check,
  X,
  PlusCircle,
  Copy
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface DocumentItem {
  id: number;
  name: string;
  status: string;
  uploaded_at: string;
  chunk_count: number;
}

interface Citation {
  document_id: number | null;
  document_name: string;
  page_number: number;
  section_heading: string | null;
  bbox: number[] | null;
  chunk_type: "text" | "table" | "figure";
}

interface Message {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  warning?: string | null;
  hasCitations?: boolean;
}

interface SessionItem {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export default function PrismDashboard() {
  const { user, loading: authLoading, token, signOut } = useAuth();
  const router = useRouter();

  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<number[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [queryInput, setQueryInput] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isQuerying, setIsQuerying] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [viewingDoc, setViewingDoc] = useState<{ id: number; name: string; page?: number } | null>(null);
  const [imgError, setImgError] = useState(false);
  // Phase 9: rename state
  const [renamingDocId, setRenamingDocId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [reprocessingDocId, setReprocessingDocId] = useState<number | null>(null);
  // Phase 10: share state
  const [shareToast, setShareToast] = useState<string | null>(null);
  // Phase 13: multi-session state
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessionLimitError, setSessionLimitError] = useState<string | null>(null);
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [sessionRenameValue, setSessionRenameValue] = useState("");
  const [isSessionLoading, setIsSessionLoading] = useState(false);
  const [deletingDocId, setDeletingDocId] = useState<number | null>(null);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeSessionIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  // ── Phase 13: Session management ─────────────────────────────────

  const fetchSessions = useCallback(async (tok: string) => {
    try {
      const res = await fetch(`${apiBaseUrl}/api/sessions`, {
        headers: { "Authorization": `Bearer ${tok}` }
      });
      if (res.ok) {
        const data: SessionItem[] = await res.json();
        setSessions(data);
        return data;
      }
    } catch (err) {
      console.error("Failed to fetch sessions:", err);
    }
    return [];
  }, [apiBaseUrl]);

  const saveSession = useCallback(async (sessionId: string, msgs: Message[], docIds: number[], tok: string) => {
    try {
      const res = await fetch(`${apiBaseUrl}/api/sessions/${sessionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${tok}` },
        body: JSON.stringify({
          messages: msgs.map(m => ({ role: m.role, content: m.content, citations: m.citations, warning: m.warning, hasCitations: m.hasCitations })),
          doc_ids: docIds
        })
      });
      if (res.ok) {
        const updated = await res.json();
        setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, title: updated.title, updated_at: updated.updated_at } : s));
      }
    } catch (err) {
      console.error("Failed to save session:", err);
    }
  }, [apiBaseUrl]);

  // On login: fetch sessions, auto-select most recent (or create first)
  useEffect(() => {
    if (!token || !user) return;
    (async () => {
      const existing = await fetchSessions(token);
      if (existing.length > 0) {
        const latest = existing[0];
        setActiveSessionId(latest.id);
        // Load full session data
        try {
          const res = await fetch(`${apiBaseUrl}/api/sessions/${latest.id}`, {
            headers: { "Authorization": `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json();
            setMessages(data.messages || []);
            setSelectedDocIds(data.doc_ids || []);
          }
        } catch {}
      } else {
        // First-ever login: create a session
        try {
          const res = await fetch(`${apiBaseUrl}/api/sessions`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${token}` }
          });
          if (res.ok) {
            const newSession = await res.json();
            setSessions([newSession]);
            setActiveSessionId(newSession.id);
            setMessages([]);
            setSelectedDocIds([]);
          }
        } catch {}
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user]);

  // Debounced auto-save whenever messages or doc selection changes
  useEffect(() => {
    if (!activeSessionId || !token) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveSession(activeSessionId, messages, selectedDocIds, token);
    }, 600);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, selectedDocIds]);

  // Handle Theme Preference
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") as "dark" | "light" | null;
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.classList.toggle("dark", savedTheme === "dark");
    } else {
      document.documentElement.classList.add("dark");
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    localStorage.setItem("theme", nextTheme);
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
  };

  // Fetch documents list (session-scoped)
  const fetchDocuments = async () => {
    if (!token) return;
    const currentSessionId = activeSessionIdRef.current;
    try {
      const url = currentSessionId
        ? `${apiBaseUrl}/api/documents?session_id=${currentSessionId}`
        : `${apiBaseUrl}/api/documents`;
      const res = await fetch(url, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDocuments(data);
      }
    } catch (err) {
      console.error("Failed to fetch documents:", err);
    }
  };

  // Poll for document status if any is processing
  useEffect(() => {
    if (!token || !activeSessionId) return;
    fetchDocuments();
    const interval = setInterval(() => {
      const hasProcessing = documents.some(doc => doc.status.startsWith("processing"));
      if (hasProcessing || documents.length === 0) {
        fetchDocuments();
      }
    }, 4000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documents.map(d => d.status).join(","), token, activeSessionId]);

  // Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isQuerying]);

  // Handle PDF upload
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !token) return;

    const file = files[0];
    if (file.type !== "application/pdf" && !file.name.endsWith(".pdf")) {
      setUploadError("Only PDF files are supported.");
      return;
    }

    setUploadError(null);
    setIsUploading(true);

    const formData = new FormData();
    formData.append("file", file);
    if (activeSessionId) formData.append("session_id", activeSessionId);

    try {
      const res = await fetch(`${apiBaseUrl}/api/documents/upload`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`
        },
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Upload failed");
      }

      await fetchDocuments();
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err: any) {
      setUploadError(err.message || "Failed to upload document");
    } finally {
      setIsUploading(false);
    }
  };

  // Delete document
  const handleDeleteDoc = async (id: number) => {
    if (!token) return;
    try {
      const res = await fetch(`${apiBaseUrl}/api/documents/${id}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      if (res.ok) {
        setDocuments(documents.filter(doc => doc.id !== id));
        setSelectedDocIds(selectedDocIds.filter(docId => docId !== id));
      }
    } catch (err) {
      console.error("Failed to delete document:", err);
    }
  };

  // Phase 9: Rename document
  const handleRenameDoc = async (id: number) => {
    if (!token || !renameValue.trim()) return;
    try {
      const res = await fetch(`${apiBaseUrl}/api/documents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ name: renameValue.trim() })
      });
      if (res.ok) {
        const updated = await res.json();
        setDocuments(docs => docs.map(d => d.id === id ? { ...d, name: updated.name } : d));
      }
    } catch (err) {
      console.error("Failed to rename document:", err);
    } finally {
      setRenamingDocId(null);
      setRenameValue("");
    }
  };

  // Phase 9: Reprocess document
  const handleReprocessDoc = async (id: number) => {
    if (!token) return;
    setReprocessingDocId(id);
    try {
      const res = await fetch(`${apiBaseUrl}/api/documents/${id}/reprocess`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        setDocuments(docs => docs.map(d => d.id === id ? { ...d, status: "processing", chunk_count: 0 } : d));
      }
    } catch (err) {
      console.error("Failed to reprocess document:", err);
    } finally {
      setReprocessingDocId(null);
    }
  };

  // Phase 10: Download chat as Markdown
  const handleDownloadMarkdown = () => {
    if (messages.length === 0) return;
    const lines = messages.map(m => {
      const role = m.role === "user" ? "**You**" : "**Prism**";
      const cites = m.citations && m.citations.length > 0
        ? `\n\n> Sources: ${m.citations.map(c => `${c.document_name} (p.${c.page_number})`).join(", ")}`
        : "";
      return `${role}\n\n${m.content}${cites}`;
    });
    const markdown = `# Prism Chat Export\n\n${lines.join("\n\n---\n\n")}`;
    const sessionTitle = sessions.find(s => s.id === activeSessionId)?.title || "chat";
    const slug = sessionTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "chat";
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `prism-${slug}-${new Date().toISOString().slice(0, 10)}.md`;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Phase 10: Share session
  const handleShare = async () => {
    if (!token || messages.length === 0) return;
    try {
      const sessionTitle = sessions.find(s => s.id === activeSessionId)?.title || "Prism Chat";
      const title = sessionTitle === "New Chat"
        ? (messages[0]?.content?.slice(0, 60) ?? "Prism Chat")
        : sessionTitle;
      const res = await fetch(`${apiBaseUrl}/api/shared`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ title, messages: messages.map(m => ({ role: m.role, content: m.content })) })
      });
      if (res.ok) {
        const data = await res.json();
        const url = `${window.location.origin}/shared/${data.id}`;
        await navigator.clipboard.writeText(url);
        setShareToast(url);
        setTimeout(() => setShareToast(null), 3000);
      }
    } catch (err) {
      console.error("Failed to share session:", err);
    }
  };

  // Toggle document selection for querying
  const toggleDocSelection = (id: number) => {
    if (selectedDocIds.includes(id)) {
      setSelectedDocIds(selectedDocIds.filter(docId => docId !== id));
    } else {
      setSelectedDocIds([...selectedDocIds, id]);
    }
  };

  // Phase 13: Create a new session
  const handleNewSession = async () => {
    if (!token) return;
    setSessionLimitError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/sessions`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.status === 400) {
        const err = await res.json();
        setSessionLimitError(err.detail);
        setTimeout(() => setSessionLimitError(null), 4000);
        return;
      }
      if (res.ok) {
        const newSession = await res.json();
        setSessions(prev => [newSession, ...prev]);
        setActiveSessionId(newSession.id);
        setMessages([]);
        setSelectedDocIds([]);
        setQueryInput("");
      }
    } catch (err) {
      console.error("Failed to create session:", err);
    }
  };

  // Phase 13: Switch to an existing session
  const handleSwitchSession = async (sessionId: string) => {
    if (!token || sessionId === activeSessionId) return;
    setIsSessionLoading(true);
    // Save current session immediately before switching
    if (activeSessionId) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      await saveSession(activeSessionId, messages, selectedDocIds, token);
    }
    try {
      const res = await fetch(`${apiBaseUrl}/api/sessions/${sessionId}`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setActiveSessionId(sessionId);
        setDeletingDocId(null);
        setDeletingSessionId(null);
        setMessages(data.messages || []);
        setSelectedDocIds(data.doc_ids || []);
        setQueryInput("");
        setDocuments([]);  // clear old session's docs immediately
        // Load this session's documents
        try {
          const docUrl = `${apiBaseUrl}/api/documents?session_id=${sessionId}`;
          const docRes = await fetch(docUrl, { headers: { "Authorization": `Bearer ${token}` } });
          if (docRes.ok) setDocuments(await docRes.json());
        } catch {}
      }
    } catch (err) {
      console.error("Failed to switch session:", err);
    } finally {
      setIsSessionLoading(false);
    }
  };

  // Phase 13: Delete a session
  const handleDeleteSession = async (sessionId: string) => {
    if (!token) return;
    try {
      await fetch(`${apiBaseUrl}/api/sessions/${sessionId}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` }
      });
      const remaining = sessions.filter(s => s.id !== sessionId);
      setSessions(remaining);
      if (activeSessionId === sessionId) {
        if (remaining.length > 0) {
          await handleSwitchSession(remaining[0].id);
        } else {
          // Deleted last session → create a fresh one
          const res = await fetch(`${apiBaseUrl}/api/sessions`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${token}` }
          });
          if (res.ok) {
            const newSession = await res.json();
            setSessions([newSession]);
            setActiveSessionId(newSession.id);
            setMessages([]);
            setSelectedDocIds([]);
          }
        }
      }
    } catch (err) {
      console.error("Failed to delete session:", err);
    }
  };

  // Phase 13: Rename a session
  const handleRenameSession = async (sessionId: string) => {
    if (!token || !sessionRenameValue.trim()) {
      setRenamingSessionId(null);
      setSessionRenameValue("");
      return;
    }
    try {
      const res = await fetch(`${apiBaseUrl}/api/sessions/${sessionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({
          title: sessionRenameValue.trim(),
          messages: messages.map(m => ({ role: m.role, content: m.content })),
          doc_ids: selectedDocIds
        })
      });
      if (res.ok) {
        const updated = await res.json();
        setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, title: updated.title } : s));
      }
    } catch (err) {
      console.error("Failed to rename session:", err);
    } finally {
      setRenamingSessionId(null);
      setSessionRenameValue("");
    }
  };

  // Handle query submit
  const handleQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!queryInput.trim() || isQuerying || !token) return;

    const currentQuery = queryInput.trim();
    setQueryInput("");
    
    // Add user message
    setMessages(prev => [...prev, { role: "user", content: currentQuery }]);
    setIsQuerying(true);

    try {
      const res = await fetch(`${apiBaseUrl}/api/query`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          query: currentQuery,
          document_ids: selectedDocIds.length > 0 ? selectedDocIds : undefined,
          limit: 5,
          history: messages.map(msg => ({
            role: msg.role,
            content: msg.content
          })),
          session_id: activeSessionId || undefined
        })
      });

      if (!res.ok) {
        throw new Error("Failed to get response from server");
      }

      const data = await res.json();
      setMessages(prev => [...prev, {
        role: "assistant",
        content: data.answer,
        citations: data.citations || [],
        warning: data.warning,
        hasCitations: data.has_citations
      }]);
    } catch (err: any) {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Error: Could not retrieve an answer. Make sure the backend server is running and configured correctly.",
      }]);
    } finally {
      setIsQuerying(false);
    }
  };

  if (authLoading || !user) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-zinc-950 text-white">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500 mb-2" />
        <span className="text-sm text-zinc-400">Verifying session...</span>
      </div>
    );
  }


  return (
    <div className="flex h-screen bg-zinc-50 text-zinc-900 dark:bg-[#080B11] dark:text-zinc-100 overflow-hidden font-sans">
      {/* Left Sidebar - Documents Manager */}
      <aside className="w-80 border-r border-zinc-200 dark:border-[#1E293B] bg-zinc-100 dark:bg-[#0E131F] flex flex-col shrink-0">
        {/* Header */}
        <div className="p-6 border-b border-zinc-200 dark:border-[#1E293B] flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-2.5 hover:opacity-90 transition">
            <img src="/logo.png" alt="PRISM Logo" className="h-7 w-7 rounded-lg object-cover shadow-md" />
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-500 dark:from-emerald-400 dark:via-teal-400 dark:to-cyan-400">
              PRISM
            </h1>
          </Link>
          <div className="flex items-center space-x-2">
            <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-mono tracking-widest uppercase bg-emerald-100/50 dark:bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-200/50 dark:border-emerald-900/50">
              v1.1 (Scoped Docs)
            </span>
          </div>
        </div>

        {/* Session List Panel */}
        <div className="flex flex-col border-b border-zinc-200 dark:border-[#1E293B]" style={{maxHeight: '220px'}}>
          <div className="flex items-center justify-between px-4 pt-3 pb-1.5">
            <span className="text-[10px] text-zinc-500 dark:text-slate-400 uppercase font-mono tracking-wider flex items-center">
              <MessageSquare className="h-3 w-3 mr-1" />Sessions
            </span>
            <button
              onClick={handleNewSession}
              title="New Chat"
              className="flex items-center space-x-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-400 hover:text-emerald-600 dark:hover:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-950/50 px-2 py-1 rounded-lg border border-emerald-200 dark:border-emerald-900/40 transition"
            >
              <PlusCircle className="h-3 w-3" />
              <span>New</span>
            </button>
          </div>
          {sessionLimitError && (
            <div className="mx-3 mb-1.5 px-2 py-1 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded text-[10px] text-amber-700 dark:text-amber-400">
              {sessionLimitError}
            </div>
          )}
          <div className="overflow-y-auto flex-1 px-2 pb-2 space-y-0.5">
            {sessions.length === 0 ? (
              <p className="text-center text-zinc-400 text-xs py-3">No sessions yet</p>
            ) : (
              sessions.map(s => (
                <div
                  key={s.id}
                  onClick={renamingSessionId === s.id ? undefined : () => handleSwitchSession(s.id)}
                  className={`group flex items-center justify-between px-2.5 py-1.5 rounded-lg transition ${
                    s.id === activeSessionId
                      ? 'bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/50'
                      : 'hover:bg-zinc-200/60 dark:hover:bg-slate-800/60 text-zinc-600 dark:text-slate-400'
                  } ${renamingSessionId === s.id ? 'cursor-default' : 'cursor-pointer'}`}
                >
                  {renamingSessionId === s.id ? (
                    <div className="flex items-center space-x-1 flex-1" onClick={e => e.stopPropagation()}>
                      <input
                        autoFocus
                        value={sessionRenameValue}
                        onChange={e => setSessionRenameValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") handleRenameSession(s.id);
                          if (e.key === "Escape") { setRenamingSessionId(null); setSessionRenameValue(""); }
                        }}
                        className="flex-1 text-xs px-1.5 py-0.5 rounded border border-emerald-400 bg-white dark:bg-slate-900 text-zinc-800 dark:text-slate-200 outline-none min-w-0"
                      />
                      <button onClick={() => handleRenameSession(s.id)} className="text-emerald-500 hover:text-emerald-400 shrink-0"><Check className="h-3 w-3" /></button>
                      <button onClick={() => { setRenamingSessionId(null); setSessionRenameValue(""); }} className="text-zinc-400 hover:text-red-400 shrink-0"><X className="h-3 w-3" /></button>
                    </div>
                  ) : (
                    <span className="text-xs font-medium truncate max-w-[140px]">{s.title}</span>
                  )}
                  {renamingSessionId !== s.id && (
                    <div className="flex items-center opacity-0 group-hover:opacity-100 transition ml-1 shrink-0">
                      <button
                        onClick={e => { e.stopPropagation(); setRenamingSessionId(s.id); setSessionRenameValue(s.title); }}
                        title="Rename session"
                        className="text-zinc-400 hover:text-blue-500 dark:text-slate-500 dark:hover:text-blue-400 p-0.5 rounded transition"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      {deletingSessionId === s.id ? (
                        <div className="flex items-center space-x-0.5" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => handleDeleteSession(s.id)}
                            title="Confirm delete"
                            className="text-red-500 hover:text-red-600 bg-red-50 dark:bg-red-950/20 px-1 py-0.5 rounded text-[8px] font-bold border border-red-200 dark:border-red-900/30 transition leading-none shrink-0"
                          >
                            Del
                          </button>
                          <button
                            onClick={() => setDeletingSessionId(null)}
                            title="Cancel"
                            className="text-zinc-400 hover:text-zinc-550 p-0.5 transition shrink-0"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            setDeletingSessionId(s.id);
                            setTimeout(() => setDeletingSessionId(prev => prev === s.id ? null : prev), 4000);
                          }}
                          title="Delete session"
                          className="text-zinc-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400 p-0.5 rounded transition shrink-0"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Upload Block */}
        <div className="p-4 border-b border-zinc-200 dark:border-[#1E293B]">
          <div 
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition duration-300 flex flex-col items-center justify-center space-y-2 group
              ${isUploading 
                ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/20" 
                : "border-zinc-300 dark:border-slate-800 hover:border-emerald-500/50 dark:hover:border-emerald-500/50 hover:bg-zinc-50 dark:hover:bg-[#131A2A]"}`}
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleUpload} 
              accept=".pdf" 
              className="hidden" 
            />
            {isUploading ? (
              <>
                <Loader2 className="h-8 w-8 text-emerald-500 animate-spin" />
                <p className="text-sm font-medium text-zinc-700 dark:text-slate-300">Uploading PDF...</p>
                <p className="text-xs text-zinc-500">Parsing document structure</p>
              </>
            ) : (
              <>
                <div className="p-3 rounded-full bg-zinc-200 dark:bg-slate-900 group-hover:bg-emerald-50 dark:group-hover:bg-emerald-950/40 text-zinc-500 dark:text-slate-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition">
                  <UploadCloud className="h-6 w-6" />
                </div>
                <p className="text-sm font-medium text-zinc-700 dark:text-slate-300 group-hover:text-zinc-600 dark:group-hover:text-slate-200">Upload PDF</p>
                <p className="text-xs text-zinc-500">Drag & drop or browse</p>
              </>
            )}
          </div>
          {uploadError && (
            <div className="mt-3 p-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-lg flex items-center space-x-2 text-red-600 dark:text-red-400 text-xs">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{uploadError}</span>
            </div>
          )}
        </div>

        {/* Documents List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-slate-400 uppercase font-mono tracking-wider mb-2">
            <span className="flex items-center"><Database className="h-3 w-3 mr-1" /> Workspaces</span>
            <span>{documents.length} files</span>
          </div>

          {documents.length === 0 ? (
            <div className="text-center py-10 text-zinc-500 text-xs border border-zinc-200 dark:border-slate-900 rounded-lg">
              No documents uploaded yet
            </div>
          ) : (
            documents.map((doc) => {
              return (
                <div 
                  key={doc.id}
                  onClick={() => doc.status === 'completed' && toggleDocSelection(doc.id)}
                  className={`p-3.5 rounded-xl border transition flex flex-col space-y-2 ${
                    selectedDocIds.includes(doc.id)
                      ? 'border-emerald-500 dark:border-emerald-600 bg-emerald-50/40 dark:bg-emerald-950/10 ring-1 ring-emerald-500/30'
                      : 'border-zinc-200 dark:border-slate-800/80 bg-white dark:bg-[#111622] hover:border-zinc-300 dark:hover:border-slate-700/50'
                  } ${doc.status === 'completed' ? 'cursor-pointer' : ''}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-2.5 overflow-hidden flex-1 mr-1">
                      <FileText className="h-4.5 w-4.5 shrink-0 mt-0.5 text-zinc-400 dark:text-slate-400" />
                      {renamingDocId === doc.id ? (
                        <div className="flex items-center space-x-1 flex-1" onClick={e => e.stopPropagation()}>
                          <input
                            autoFocus
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") handleRenameDoc(doc.id); if (e.key === "Escape") { setRenamingDocId(null); setRenameValue(""); } }}
                            className="flex-1 text-sm px-1.5 py-0.5 rounded border border-emerald-400 bg-white dark:bg-slate-900 text-zinc-800 dark:text-slate-200 outline-none"
                          />
                          <button onClick={() => handleRenameDoc(doc.id)} className="text-emerald-500 hover:text-emerald-400"><Check className="h-3.5 w-3.5" /></button>
                          <button onClick={() => { setRenamingDocId(null); setRenameValue(""); }} className="text-zinc-400 hover:text-red-400"><X className="h-3.5 w-3.5" /></button>
                        </div>
                      ) : (
                        <span className="text-sm font-medium truncate text-zinc-800 dark:text-slate-200">{doc.name}</span>
                      )}
                    </div>
                    <div className="flex items-center space-x-1 shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); setRenamingDocId(doc.id); setRenameValue(doc.name); }}
                        title="Rename document"
                        className="text-zinc-400 hover:text-blue-500 dark:text-slate-500 dark:hover:text-blue-400 p-0.5 rounded transition hover:bg-zinc-200 dark:hover:bg-slate-900"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleReprocessDoc(doc.id); }}
                        title="Re-ingest document"
                        className="text-zinc-400 hover:text-amber-500 dark:text-slate-500 dark:hover:text-amber-400 p-0.5 rounded transition hover:bg-zinc-200 dark:hover:bg-slate-900"
                        disabled={reprocessingDocId === doc.id}
                      >
                        <RefreshCcw className={`h-3.5 w-3.5 ${reprocessingDocId === doc.id ? 'animate-spin text-amber-500' : ''}`} />
                      </button>
                      {deletingDocId === doc.id ? (
                        <div className="flex items-center space-x-1 shrink-0" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => handleDeleteDoc(doc.id)}
                            title="Confirm delete"
                            className="text-red-500 hover:text-red-600 bg-red-50 dark:bg-red-950/20 px-1.5 py-0.5 rounded text-[10px] font-bold border border-red-200 dark:border-red-900/30 transition"
                          >
                            Delete
                          </button>
                          <button
                            onClick={() => setDeletingDocId(null)}
                            title="Cancel"
                            className="text-zinc-400 hover:text-zinc-500 p-0.5 rounded transition"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingDocId(doc.id);
                            setTimeout(() => setDeletingDocId(prev => prev === doc.id ? null : prev), 4000);
                          }}
                          title="Delete document"
                          className="text-zinc-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400 p-0.5 rounded transition hover:bg-zinc-200 dark:hover:bg-slate-900"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1 border-t border-zinc-200 dark:border-slate-900">
                    <span className="text-zinc-500 dark:text-slate-500 font-mono">
                      {doc.chunk_count > 0 ? `${doc.chunk_count} chunks` : "pending"}
                    </span>
                    <div className="flex items-center space-x-2">
                      {doc.status === "completed" && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setViewingDoc({ id: doc.id, name: doc.name });
                          }}
                          title="View Document"
                          className="flex items-center space-x-1 text-emerald-600 dark:text-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 hover:bg-emerald-100 dark:hover:bg-emerald-950/40 px-1.5 py-0.5 rounded text-[10px] font-medium border border-emerald-200 dark:border-emerald-900/30 transition"
                        >
                          <Eye className="h-3 w-3" />
                          <span>View</span>
                        </button>
                      )}
                      {doc.status === "completed" && (
                        <span className="text-emerald-600 dark:text-emerald-500 flex items-center bg-emerald-50 dark:bg-emerald-950/20 px-1.5 py-0.5 rounded text-[10px] font-medium border border-emerald-200 dark:border-emerald-900/30">
                          <CheckCircle className="h-3 w-3 mr-1" /> Active
                        </span>
                      )}
                      {doc.status.startsWith("processing") && (
                        <span className="text-amber-600 dark:text-amber-500 flex items-center bg-amber-50 dark:bg-amber-950/20 px-1.5 py-0.5 rounded text-[10px] font-medium border border-amber-200 dark:border-amber-900/30" title={doc.status.includes(":") ? doc.status.split(":")[1] : "Ingestion in progress..."}>
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          <span className="max-w-[70px] truncate">
                            {doc.status.includes(":") ? doc.status.split(":")[1].replace("processing:","") : "Ingestion"}
                          </span>
                        </span>
                      )}
                      {doc.status === "failed" && (
                        <span className="text-red-600 dark:text-red-500 flex items-center bg-red-50 dark:bg-red-950/20 px-1.5 py-0.5 rounded text-[10px] font-medium border border-red-200 dark:border-red-900/30">
                          <AlertCircle className="h-3 w-3 mr-1" /> Failed
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* Main Panel - Chat Area */}
      <main className={`flex-1 flex flex-col bg-zinc-50 dark:bg-[#080B11] relative transition-opacity duration-200 ${isSessionLoading ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
        {/* Top Header */}
        <header className="h-16 border-b border-zinc-200 dark:border-[#1E293B] bg-white/80 dark:bg-[#0E131F]/80 backdrop-blur-md px-8 flex items-center justify-between shrink-0 sticky top-0 z-10">
          <div className="flex items-center space-x-3">
            <MessageSquare className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            <h2 className="font-semibold text-zinc-800 dark:text-slate-200 truncate max-w-xs">
              {sessions.find(s => s.id === activeSessionId)?.title || "New Chat"}
            </h2>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-xs text-zinc-500 dark:text-slate-400">
              {selectedDocIds.length > 0
                ? `Querying ${selectedDocIds.length} selected document${selectedDocIds.length > 1 ? 's' : ''} — click to deselect`
                : 'Querying all active documents — click a doc to filter'}
            </div>
          <div className="flex items-center space-x-3">
            {messages.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleDownloadMarkdown}
                  title="Download chat as Markdown"
                  className="flex items-center space-x-1.5 text-xs text-zinc-500 dark:text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-900/50 bg-white dark:bg-zinc-900 hover:bg-blue-50 dark:hover:bg-blue-950/20 transition"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Export</span>
                </button>
                <button
                  type="button"
                  onClick={handleShare}
                  title="Share a link to this chat"
                  className="flex items-center space-x-1.5 text-xs text-zinc-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-900/50 bg-white dark:bg-zinc-900 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 transition"
                >
                  <Share2 className="h-3.5 w-3.5" />
                  <span>Share</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMessages([]);
                  }}
                  title="Clear chat history"
                  className="flex items-center space-x-1.5 text-xs text-zinc-500 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-slate-800 hover:border-red-300 dark:hover:border-red-900/50 bg-white dark:bg-zinc-900 hover:bg-red-50 dark:hover:bg-red-950/20 transition"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Clear</span>
                </button>
              </>
            )}
            {user && (
              <div className="flex items-center space-x-2 border-r border-zinc-200 dark:border-slate-850 pr-3 mr-1">
                {user.photoURL && !imgError ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || "User"}
                    onError={() => setImgError(true)}
                    className="h-7 w-7 rounded-full object-cover border border-emerald-500/50"
                  />
                ) : (
                  <div className="h-7 w-7 rounded-full bg-emerald-700/80 text-white flex items-center justify-center text-xs font-bold font-mono">
                    {(user.displayName || user.email || "?").charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="hidden md:inline text-xs text-zinc-600 dark:text-slate-300 max-w-[120px] truncate font-medium">
                  {user.displayName || user.email}
                </span>
                <button
                  type="button"
                  onClick={signOut}
                  title="Sign out"
                  className="p-1.5 text-zinc-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            )}
            <button 
              type="button"
              onClick={toggleTheme}
              className="p-2 rounded-xl bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-900 dark:hover:bg-zinc-800/80 border border-zinc-300 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 transition"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun className="h-4 w-4 text-emerald-400" /> : <Moon className="h-4 w-4 text-emerald-600" />}
            </button>
          </div>
          </div>
        </header>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-8 space-y-6">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center max-w-xl mx-auto text-center space-y-6">
              <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40 relative">
                <Sparkles className="h-10 w-10 text-emerald-600 dark:text-emerald-400 mx-auto" />
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-teal-500 rounded-full animate-ping" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-semibold text-zinc-800 dark:text-slate-200">Ask your workspace questions</h3>
                <p className="text-zinc-600 dark:text-slate-400 text-sm leading-relaxed">
                  Upload PDF documents on the sidebar. Prism will parse their structure (text blocks, tables, figures) and answer your queries with page-level citations.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 w-full max-w-md pt-4">
                <button 
                  onClick={() => setQueryInput("Summary of the uploaded document")}
                  className="p-3 text-left rounded-xl border border-zinc-200 dark:border-slate-800 bg-white dark:bg-[#0E131F] hover:bg-zinc-50 dark:hover:bg-[#131A2A] text-xs text-zinc-700 dark:text-slate-300 transition"
                >
                  📄 Request a summary
                </button>
                <button 
                  onClick={() => setQueryInput("List any tabular data or key results")}
                  className="p-3 text-left rounded-xl border border-zinc-200 dark:border-slate-800 bg-white dark:bg-[#0E131F] hover:bg-zinc-50 dark:hover:bg-[#131A2A] text-xs text-zinc-700 dark:text-slate-300 transition"
                >
                  📊 Show tabular data
                </button>
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-6">
              {messages.map((msg, idx) => (
                <div 
                  key={idx} 
                  className={`flex flex-col space-y-2 ${msg.role === "user" ? "items-end" : "items-start"}`}
                >
                  {/* Message Bubble */}
                  <div className={`group relative p-4 rounded-2xl max-w-[85%] text-sm leading-relaxed border shadow-sm
                    ${msg.role === "user" 
                      ? "bg-emerald-600/90 border-emerald-500/50 text-white rounded-br-none" 
                      : "bg-white dark:bg-[#0E131F] border-zinc-200 dark:border-slate-800 rounded-bl-none text-zinc-800 dark:text-slate-200"}`}
                  >
                    <div className="whitespace-pre-wrap pr-6">{msg.content}</div>
                    
                    {msg.role === "assistant" && (
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(msg.content);
                          setShareToast("Copied response to clipboard!");
                          setTimeout(() => setShareToast(null), 2500);
                        }}
                        title="Copy message to clipboard"
                        className="absolute right-2 top-2 opacity-40 hover:opacity-100 p-1 rounded-md bg-zinc-100 hover:bg-zinc-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-zinc-200 dark:border-slate-850 text-zinc-500 dark:text-slate-400 transition"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Warning message if citation check failed */}
                  {msg.warning && (
                    <div className="text-amber-600 dark:text-amber-500 text-[10.5px] bg-amber-50 dark:bg-amber-950/20 px-2 py-1 rounded border border-amber-200 dark:border-amber-900/30 flex items-center space-x-1.5">
                      <AlertCircle className="h-3.5 w-3.5" />
                      <span>{msg.warning}</span>
                    </div>
                  )}

                  {/* Citations list */}
                  {msg.role === "assistant" && msg.citations && msg.citations.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1 px-1">
                      {msg.citations.map((cite, cIdx) => (
                        <div 
                          key={cIdx}
                          onClick={() => {
                            if (cite.document_id) {
                              setViewingDoc({
                                id: cite.document_id,
                                name: cite.document_name,
                                page: cite.page_number
                              });
                            }
                          }}
                          title={cite.section_heading || "General"}
                          className="flex items-center space-x-1 bg-white dark:bg-slate-900 hover:bg-zinc-100 dark:hover:bg-slate-800/80 border border-zinc-200 dark:border-slate-800 px-2.5 py-1 rounded-lg text-xs text-zinc-700 dark:text-slate-300 cursor-pointer font-medium transition"
                        >
                          {cite.chunk_type === "table" ? (
                            <FileSpreadsheet className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                          ) : cite.chunk_type === "figure" ? (
                            <ImageIcon className="h-3 w-3 text-rose-500 dark:text-pink-400" />
                          ) : (
                            <FileText className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                          )}
                          <span>
                            {cite.document_name.replace(".pdf", "")} (Pg. {cite.page_number})
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              
              {/* Querying Loader */}
              {isQuerying && (
                <div className="flex items-start space-x-3 max-w-[85%]">
                  <div className="p-4 rounded-2xl bg-white dark:bg-[#0E131F] border border-zinc-200 dark:border-slate-800 rounded-bl-none flex items-center space-x-3 text-zinc-500 dark:text-slate-400 text-sm">
                    <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
                    <span>Searching vectors + full-text, generating citation answer...</span>
                  </div>
                </div>
              )}
              
              <div ref={chatEndRef} />
            </div>
          )}
        </div>

        {/* Input Bar */}
        <footer className="p-6 border-t border-zinc-200 dark:border-[#1E293B] bg-white dark:bg-[#0E131F] shrink-0">
          <form onSubmit={handleQuery} className="max-w-3xl mx-auto flex items-center space-x-3">
            <input 
              type="text"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder="Ask a question about the uploaded document..."
              className="flex-1 bg-zinc-50 dark:bg-[#080B11] border border-zinc-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 dark:focus:border-emerald-500 transition text-zinc-900 dark:text-slate-200 placeholder-zinc-400 dark:placeholder-slate-500"
              disabled={isQuerying}
            />
            <button 
              type="submit"
              disabled={!queryInput.trim() || isQuerying}
              className={`p-3 rounded-xl bg-emerald-600 bg-gradient-to-tr from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-medium shadow-md transition duration-200 flex items-center justify-center
                ${(!queryInput.trim() || isQuerying) && "opacity-50 cursor-not-allowed"}`}
            >
              <Send className="h-4.5 w-4.5" />
            </button>
          </form>
        </footer>
      </main>

      {/* Right Sidebar - Document Viewer */}
      {viewingDoc && (
        <aside className="w-[500px] xl:w-[600px] border-l border-zinc-200 dark:border-[#1E293B] bg-white dark:bg-[#0E131F] flex flex-col shrink-0">
          <div className="p-4 border-b border-zinc-200 dark:border-[#1E293B] flex items-center justify-between bg-zinc-50 dark:bg-[#111622]">
            <div className="flex items-center space-x-2">
              <FileText className="h-5 w-5 text-emerald-500" />
              <span className="font-semibold truncate max-w-[280px] xl:max-w-[350px]">{viewingDoc.name}</span>
              {viewingDoc.page && (
                <span className="text-xs bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-400 px-2 py-0.5 rounded font-mono">
                  Page {viewingDoc.page}
                </span>
              )}
            </div>
            <button 
              onClick={() => setViewingDoc(null)}
              className="text-zinc-400 hover:text-zinc-600 dark:text-slate-500 dark:hover:text-slate-300 p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-slate-900 transition text-xs font-semibold"
            >
              Close
            </button>
          </div>
          <div className="flex-1 bg-zinc-100 dark:bg-zinc-950 relative">
            <iframe 
              src={`${apiBaseUrl}/api/documents/${viewingDoc.id}/file?token=${token}${viewingDoc.page ? `#page=${viewingDoc.page}` : ""}`} 
              className="w-full h-full border-none"
              title="Document Viewer"
            />
          </div>
        </aside>
      )}

      {/* Share Link Copied Toast */}
      {shareToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center space-x-2 bg-zinc-900 border border-emerald-700/50 text-emerald-300 text-xs font-medium px-4 py-2.5 rounded-xl shadow-xl animate-in slide-in-from-bottom-4 duration-300">
          <Check className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>{shareToast}</span>
        </div>
      )}
    </div>
  );
}
