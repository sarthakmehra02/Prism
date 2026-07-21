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
  Copy,
  MoreHorizontal,
  Search,
  PanelLeftClose,
  PanelLeft,
  Folder,
  SquarePen,
  ChevronDown,
  ShoppingBag
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
  // ChatGPT style UI states
  const [deleteModal, setDeleteModal] = useState<{ type: "session" | "doc"; id: string | number; name: string } | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [showAllProjects, setShowAllProjects] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showExportMenu, setShowExportMenu] = useState(false);
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

  // Download chat as Markdown
  const handleDownloadMarkdown = () => {
    if (messages.length === 0) return;
    const lines = messages.map(m => {
      const role = m.role === "user" ? "**You**" : "**Prism AI**";
      const cites = m.citations && m.citations.length > 0
        ? `\n\n> **Sources:** ${m.citations.map(c => `${c.document_name} (p.${c.page_number})`).join(", ")}`
        : "";
      return `### ${role}\n\n${m.content}${cites}`;
    });
    const sessionTitle = sessions.find(s => s.id === activeSessionId)?.title || "chat";
    const markdown = `# Prism Chat: ${sessionTitle}\n*Exported on ${new Date().toLocaleDateString()}*\n\n---\n\n${lines.join("\n\n---\n\n")}`;
    const slug = sessionTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "chat";
    
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `prism-${slug}-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 300);
  };

  // Export chat as PDF
  const handleDownloadPDF = () => {
    if (messages.length === 0) return;
    const sessionTitle = sessions.find(s => s.id === activeSessionId)?.title || "Prism Chat";
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${sessionTitle} - Prism Export</title>
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; padding: 30px; max-width: 800px; margin: auto; color: #111; line-height: 1.6; }
          h1 { color: #059669; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; }
          .message { margin-bottom: 24px; padding: 16px; border-radius: 12px; background: #f9fafb; border: 1px solid #e5e7eb; }
          .user { background: #ecfdf5; border-color: #a7f3d0; }
          .role { font-weight: bold; margin-bottom: 6px; color: #047857; font-size: 14px; }
          .user .role { color: #065f46; }
          .sources { margin-top: 10px; font-size: 12px; color: #4b5563; background: #fff; padding: 8px; border-radius: 6px; border: 1px solid #e5e7eb; }
        </style>
      </head>
      <body>
        <h1>${sessionTitle}</h1>
        <p style="color: #6b7280; font-size: 12px;">Exported from PRISM on ${new Date().toLocaleString()}</p>
        <hr style="margin-bottom: 20px; border: none; border-top: 1px solid #e5e7eb;"/>
        ${messages.map(m => `
          <div class="message ${m.role === "user" ? "user" : ""}">
            <div class="role">${m.role === "user" ? "You" : "PRISM AI"}</div>
            <div>${m.content.replace(/\n/g, "<br/>")}</div>
            ${m.citations && m.citations.length > 0 ? `<div class="sources"><strong>Sources:</strong> ${m.citations.map(c => `${c.document_name} (p.${c.page_number})`).join(", ")}</div>` : ""}
          </div>
        `).join("")}
        <script>
          window.onload = function() { window.print(); window.close(); };
        </script>
      </body>
      </html>
    `;
    printWindow.document.write(htmlContent);
    printWindow.document.close();
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
      {/* Left Sidebar - ChatGPT Style Layout */}
      <aside className={`${isSidebarOpen ? "w-80 border-r" : "w-0 overflow-hidden border-none"} border-zinc-200 dark:border-zinc-800/80 bg-zinc-100 dark:bg-[#17181C] flex flex-col shrink-0 transition-all duration-300 ease-in-out`}>
        {/* Top Header */}
        <div className="px-4 py-3.5 flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800/60 shrink-0">
          <Link href="/" className="flex items-center space-x-2.5 hover:opacity-90 transition">
            <img src="/logo.png" alt="PRISM Logo" className="h-6 w-6 rounded-lg object-cover shadow-sm" />
            <span className="text-base font-bold tracking-tight text-zinc-900 dark:text-white">
              PRISM
            </span>
          </Link>
          <div className="flex items-center space-x-1 text-zinc-500 dark:text-zinc-400">
            <button className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-lg transition" title="Search chats">
              <Search className="h-4 w-4" />
            </button>
            <button onClick={() => setIsSidebarOpen(false)} className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-lg transition" title="Collapse sidebar">
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* New Chat Button */}
        <div className="px-3 pt-3 pb-2">
          <button
            onClick={handleNewSession}
            className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-zinc-200/80 dark:bg-[#212328] hover:bg-zinc-300/80 dark:hover:bg-[#2B2D33] text-zinc-900 dark:text-zinc-100 transition font-medium text-xs border border-zinc-300/60 dark:border-zinc-800/80 shadow-xs group"
          >
            <div className="flex items-center space-x-2.5">
              <SquarePen className="h-4 w-4 text-zinc-700 dark:text-zinc-300 group-hover:text-emerald-500 transition" />
              <span className="text-xs font-semibold">New chat</span>
            </div>
            <PlusCircle className="h-4 w-4 text-zinc-400 group-hover:text-emerald-500 transition" />
          </button>
        </div>

        {sessionLimitError && (
          <div className="mx-3 my-1 px-2.5 py-1.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-lg text-[10px] text-amber-700 dark:text-amber-400">
            {sessionLimitError}
          </div>
        )}

        {/* Scrollable Container for Chats & Documents */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-5">
          {/* Chats Section */}
          <div className="space-y-1">
            <div className="flex items-center justify-between px-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1">
              <div className="flex items-center space-x-1">
                <span>Chats</span>
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </div>
            </div>

            <div className="space-y-0.5">
              {sessions.length === 0 ? (
                <div className="px-3 py-2 text-xs text-zinc-400 dark:text-zinc-500 italic">No chats yet</div>
              ) : (
                sessions.map(s => (
                  <div
                    key={s.id}
                    onClick={() => renamingSessionId === s.id ? undefined : handleSwitchSession(s.id)}
                    className={`group relative flex items-center justify-between px-3 py-2 rounded-xl transition ${
                      s.id === activeSessionId
                        ? "bg-zinc-200/80 dark:bg-[#212328] text-zinc-900 dark:text-white font-medium shadow-2xs"
                        : "hover:bg-zinc-200/60 dark:hover:bg-[#1E1F24] text-zinc-700 dark:text-zinc-300"
                    } cursor-pointer`}
                  >
                    {renamingSessionId === s.id ? (
                      <div className="flex items-center space-x-1 flex-1" onClick={e => e.stopPropagation()}>
                        <input
                          autoFocus
                          value={sessionRenameValue}
                          onChange={e => setSessionRenameValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter") handleRenameSession(s.id);
                            if (e.key === "Escape") setRenamingSessionId(null);
                          }}
                          className="flex-1 text-xs px-2 py-0.5 rounded border border-emerald-500 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white outline-none"
                        />
                        <button onClick={() => handleRenameSession(s.id)} className="text-emerald-500 hover:text-emerald-400 p-0.5"><Check className="h-3.5 w-3.5" /></button>
                        <button onClick={() => setRenamingSessionId(null)} className="text-zinc-400 hover:text-red-400 p-0.5"><X className="h-3.5 w-3.5" /></button>
                      </div>
                    ) : (
                      <span className="text-xs truncate font-normal leading-relaxed pr-2">{s.title}</span>
                    )}

                    {renamingSessionId !== s.id && (
                      <div className="flex items-center opacity-0 group-hover:opacity-100 transition shrink-0">
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            setMenuOpenId(prev => prev === s.id ? null : s.id);
                          }}
                          className="p-1 hover:bg-zinc-300 dark:hover:bg-zinc-700/60 rounded-lg text-zinc-400 hover:text-zinc-200 transition"
                          title="Options"
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}

                    {/* Context Options Popup Menu */}
                    {menuOpenId === s.id && (
                      <div
                        onClick={e => e.stopPropagation()}
                        className="absolute right-2 top-8 z-30 w-36 bg-white dark:bg-[#202123] border border-zinc-200 dark:border-zinc-700/80 rounded-xl shadow-xl py-1.5 text-xs text-zinc-700 dark:text-zinc-200 animate-in fade-in zoom-in-95 duration-100"
                      >
                        <button
                          onClick={() => {
                            setRenamingSessionId(s.id);
                            setSessionRenameValue(s.title);
                            setMenuOpenId(null);
                          }}
                          className="w-full flex items-center space-x-2 px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-700/50 text-left transition"
                        >
                          <Pencil className="h-3.5 w-3.5 text-zinc-400" />
                          <span>Rename</span>
                        </button>
                        <button
                          onClick={() => {
                            setDeleteModal({ type: "session", id: s.id, name: s.title });
                            setMenuOpenId(null);
                          }}
                          className="w-full flex items-center space-x-2 px-3 py-1.5 hover:bg-red-50 dark:hover:bg-red-950/30 text-red-600 dark:text-red-400 text-left transition font-medium"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-red-500" />
                          <span>Delete</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Documents Section (PDFs) */}
          <div className="space-y-1.5 pt-2">
            <div className="flex items-center justify-between px-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              <span>Documents</span>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 flex items-center space-x-1 px-2 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 transition shadow-2xs"
                title="Upload PDF Document"
              >
                <UploadCloud className="h-3 w-3 mr-0.5" />
                <span>Upload PDF</span>
              </button>
              <input type="file" ref={fileInputRef} onChange={handleUpload} accept=".pdf" className="hidden" />
            </div>

            {isUploading && (
              <div className="px-3 py-2 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 rounded-xl flex items-center space-x-2 text-xs text-emerald-600 dark:text-emerald-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Uploading & parsing PDF...</span>
              </div>
            )}

            {uploadError && (
              <div className="px-3 py-2 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 rounded-xl flex items-center space-x-2 text-xs text-red-600 dark:text-red-400">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{uploadError}</span>
              </div>
            )}

            <div className="space-y-0.5">
              {documents.length === 0 ? (
                <div className="px-3 py-2 text-xs text-zinc-400 dark:text-zinc-500 italic">No documents uploaded yet</div>
              ) : (
                (showAllProjects ? documents : documents.slice(0, 5)).map((doc) => (
                  <div
                    key={doc.id}
                    onClick={() => doc.status === "completed" && toggleDocSelection(doc.id)}
                    className={`group relative flex items-center justify-between px-3 py-2 rounded-xl transition ${
                      selectedDocIds.includes(doc.id)
                        ? "bg-emerald-100/70 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 font-medium"
                        : "hover:bg-zinc-200/60 dark:hover:bg-[#212328] text-zinc-700 dark:text-zinc-300"
                    } ${doc.status === "completed" ? "cursor-pointer" : "cursor-default"}`}
                  >
                    <div className="flex items-center space-x-2 truncate flex-1 min-w-0 mr-2">
                      <Folder className="h-4 w-4 shrink-0 text-zinc-400 dark:text-zinc-400 group-hover:text-emerald-500 transition" />
                      {renamingDocId === doc.id ? (
                        <div className="flex items-center space-x-1 flex-1 min-w-0" onClick={e => e.stopPropagation()}>
                          <input
                            autoFocus
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") handleRenameDoc(doc.id); if (e.key === "Escape") setRenamingDocId(null); }}
                            className="w-full text-xs px-2 py-0.5 rounded border border-emerald-500 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white outline-none"
                          />
                          <button onClick={() => handleRenameDoc(doc.id)} className="text-emerald-500 hover:text-emerald-400 p-0.5"><Check className="h-3.5 w-3.5" /></button>
                          <button onClick={() => setRenamingDocId(null)} className="text-zinc-400 hover:text-red-400 p-0.5"><X className="h-3.5 w-3.5" /></button>
                        </div>
                      ) : (
                        <span className="text-xs truncate font-medium">{doc.name}</span>
                      )}
                    </div>

                    {/* Action Buttons on Hover */}
                    {renamingDocId !== doc.id && (
                      <div className="flex items-center space-x-0.5 opacity-0 group-hover:opacity-100 transition shrink-0">
                        {doc.status === "completed" && (
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              setViewingDoc({ id: doc.id, name: doc.name });
                            }}
                            className="p-1 hover:bg-zinc-300 dark:hover:bg-zinc-700/60 rounded text-zinc-400 hover:text-emerald-500 transition"
                            title="View PDF"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            setRenamingDocId(doc.id);
                            setRenameValue(doc.name);
                          }}
                          className="p-1 hover:bg-zinc-300 dark:hover:bg-zinc-700/60 rounded text-zinc-400 hover:text-blue-500 transition"
                          title="Rename document"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            setDeleteModal({ type: "doc", id: doc.id, name: doc.name });
                          }}
                          className="p-1 hover:bg-zinc-300 dark:hover:bg-zinc-700/60 rounded text-zinc-400 hover:text-red-500 transition"
                          title="Delete document"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}

              {documents.length > 5 && !showAllProjects && (
                <button
                  onClick={() => setShowAllProjects(true)}
                  className="w-full text-left px-3 py-1.5 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition font-medium"
                >
                  Show more ({documents.length - 5})
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Bottom User Profile Section */}
        <div className="p-3 border-t border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between bg-zinc-100/90 dark:bg-[#121316]">
          <div className="flex items-center space-x-3 overflow-hidden">
            {user?.photoURL ? (
              <img src={user.photoURL} alt="Avatar" className="h-8 w-8 rounded-full object-cover border border-zinc-300 dark:border-zinc-700" />
            ) : (
              <div className="h-8 w-8 rounded-full bg-zinc-300 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 flex items-center justify-center font-bold text-xs shrink-0">
                {user?.displayName ? user.displayName.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) : (user?.email?.slice(0, 2).toUpperCase() || "SA")}
              </div>
            )}
            <div className="flex flex-col truncate">
              <span className="text-xs font-semibold tracking-wide text-zinc-900 dark:text-white truncate">
                {user?.displayName || user?.email?.split("@")[0].toUpperCase() || "SARTHAK MEHRA"}
              </span>
              <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono">
                Go
              </span>
            </div>
          </div>
          <div className="flex items-center space-x-1">
            <button onClick={toggleTheme} className="p-1.5 text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-white rounded-lg transition" title="Toggle theme">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button onClick={signOut} className="p-1.5 text-zinc-500 hover:text-red-500 dark:text-zinc-400 dark:hover:text-red-400 rounded-lg transition" title="Sign out">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Panel - Chat Area */}
      <main className={`flex-1 flex flex-col bg-zinc-50 dark:bg-[#080B11] relative transition-opacity duration-200 ${isSessionLoading ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
        {/* Top Header */}
        <header className="h-16 border-b border-zinc-200 dark:border-[#1E293B] bg-white/80 dark:bg-[#0E131F]/80 backdrop-blur-md px-6 flex items-center justify-between shrink-0 sticky top-0 z-10 gap-4">
          {/* Left Title */}
          <div className="flex items-center space-x-2.5 shrink-0 min-w-0">
            {!isSidebarOpen && (
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="p-1.5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-lg transition"
                title="Open sidebar"
              >
                <PanelLeft className="h-5 w-5" />
              </button>
            )}
            <MessageSquare className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <h2 className="font-semibold text-zinc-800 dark:text-slate-200 truncate max-w-[130px] sm:max-w-[180px] lg:max-w-xs">
              {sessions.find(s => s.id === activeSessionId)?.title || "New Chat"}
            </h2>
          </div>

          {/* Center Document Context Hint */}
          <div className={`hidden ${viewingDoc ? 'hidden' : 'xl:block'} text-xs text-zinc-500 dark:text-slate-400 truncate text-center px-2 flex-1 max-w-md`}>
            {selectedDocIds.length > 0
              ? `Querying ${selectedDocIds.length} selected document${selectedDocIds.length > 1 ? 's' : ''} — click doc to filter`
              : 'Querying all active documents — click a doc to filter'}
          </div>

          {/* Right Action Buttons (Collapsed when viewing a document to give PDF panel maximum space) */}
          {!viewingDoc && (
            <div className="flex items-center space-x-2 shrink-0">
              {messages.length > 0 && (
                <>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowExportMenu(prev => !prev)}
                      title="Export conversation"
                      className="flex items-center space-x-1.5 text-xs text-zinc-700 dark:text-zinc-200 hover:text-emerald-600 dark:hover:text-emerald-400 px-2.5 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800/80 hover:border-emerald-300 dark:hover:border-emerald-900/60 bg-white/90 dark:bg-[#18191C] hover:bg-emerald-50/60 dark:hover:bg-emerald-950/20 transition-all duration-200 shadow-2xs font-semibold group"
                    >
                      <Download className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition duration-200" />
                      <span>Export</span>
                      <ChevronDown className={`h-3 w-3 opacity-60 transition-transform duration-200 ${showExportMenu ? "rotate-180" : ""}`} />
                    </button>

                    {showExportMenu && (
                      <>
                        {/* Invisible backdrop overlay to handle closing on click outside */}
                        <div className="fixed inset-0 z-20" onClick={() => setShowExportMenu(false)} />

                        <div className="absolute right-0 mt-2 z-30 w-56 bg-white/95 dark:bg-[#18191C]/95 backdrop-blur-md border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl shadow-2xl p-1.5 text-xs animate-in fade-in slide-in-from-top-2 duration-150">
                          <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 border-b border-zinc-100 dark:border-zinc-800/60 mb-1">
                            Export Format
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              handleDownloadMarkdown();
                              setShowExportMenu(false);
                            }}
                            className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800/70 text-left transition duration-150 group"
                          >
                            <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/40 text-blue-600 dark:text-blue-400 group-hover:scale-105 transition">
                              <FileText className="h-4 w-4" />
                            </div>
                            <div className="flex flex-col">
                              <span className="font-semibold text-zinc-800 dark:text-zinc-100">Markdown (.md)</span>
                              <span className="text-[10px] text-zinc-400 dark:text-zinc-500">Formatted text with sources</span>
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              handleDownloadPDF();
                              setShowExportMenu(false);
                            }}
                            className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800/70 text-left transition duration-150 group"
                          >
                            <div className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/40 text-rose-600 dark:text-rose-400 group-hover:scale-105 transition">
                              <Download className="h-4 w-4" />
                            </div>
                            <div className="flex flex-col">
                              <span className="font-semibold text-zinc-800 dark:text-zinc-100">PDF Document (.pdf)</span>
                              <span className="text-[10px] text-zinc-400 dark:text-zinc-500">Print or save as PDF</span>
                            </div>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleShare}
                    title="Share a link to this chat"
                    className="flex items-center space-x-1.5 text-xs text-zinc-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-900/50 bg-white dark:bg-zinc-900 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 transition"
                  >
                    <Share2 className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Share</span>
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
                    <span className="hidden sm:inline">Clear</span>
                  </button>
                </>
              )}
              {user && (
                <div className="flex items-center space-x-1.5 border-r border-zinc-200 dark:border-slate-850 pr-2 mr-0.5">
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
                  <span className="hidden 2xl:inline text-xs text-zinc-600 dark:text-slate-300 max-w-[100px] truncate font-medium">
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
          )}
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
                    <div className="whitespace-pre-wrap">{msg.content}</div>
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
        <aside className="w-[380px] lg:w-[460px] xl:w-[520px] max-w-[40vw] border-l border-zinc-200 dark:border-[#1E293B] bg-white dark:bg-[#0E131F] flex flex-col shrink-0">
          <div className="h-16 px-4 border-b border-zinc-200 dark:border-[#1E293B] flex items-center justify-between bg-zinc-50 dark:bg-[#111622] shrink-0">
            <div className="flex items-center space-x-2 min-w-0 mr-2">
              <FileText className="h-4.5 w-4.5 text-emerald-500 shrink-0" />
              <span className="font-semibold text-xs text-zinc-900 dark:text-white truncate max-w-[180px] lg:max-w-[260px]">{viewingDoc.name}</span>
              {viewingDoc.page && (
                <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-400 px-1.5 py-0.5 rounded font-mono shrink-0">
                  Pg. {viewingDoc.page}
                </span>
              )}
            </div>
            <button 
              onClick={() => setViewingDoc(null)}
              className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl bg-zinc-200/80 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 transition font-semibold text-xs border border-zinc-300 dark:border-zinc-700 shadow-2xs shrink-0 group"
              title="Close PDF viewer"
            >
              <X className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-white transition" />
              <span>Close</span>
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

      {/* ChatGPT Delete Confirmation Modal (Supports Light & Dark theme) */}
      {deleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-white dark:bg-[#18191C] border border-zinc-200 dark:border-zinc-800/80 rounded-2xl shadow-2xl p-6 flex flex-col space-y-4 text-zinc-900 dark:text-zinc-100">
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white tracking-tight">
              {deleteModal.type === "session" ? "Delete chat?" : "Delete document?"}
            </h3>
            <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
              This will delete <strong className="font-semibold text-zinc-950 dark:text-white">{deleteModal.name}</strong>.
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-500">
              Visit settings to delete any memories saved during this chat.
            </p>
            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteModal(null)}
                className="px-4 py-2 rounded-full text-xs font-medium bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (deleteModal.type === "session") {
                    handleDeleteSession(deleteModal.id as string);
                  } else {
                    handleDeleteDoc(deleteModal.id as number);
                  }
                  setDeleteModal(null);
                }}
                className="px-5 py-2 rounded-full text-xs font-semibold bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/30 transition"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
