"use client";

import React, { useState, useEffect } from "react";
import { 
  Sparkles, 
  FileText, 
  Database, 
  ArrowRight, 
  Eye, 
  Table, 
  CheckCircle, 
  Search,
  BookOpen,
  Sun,
  Moon
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";

const GithubIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
  </svg>
);

export default function LandingPage() {
  const { user, loading } = useAuth();
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const savedTheme = localStorage.getItem("prism-theme") as "dark" | "light" | null;
    if (savedTheme) {
      setTheme(savedTheme);
      if (savedTheme === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    } else {
      document.documentElement.classList.add("dark");
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    localStorage.setItem("prism-theme", nextTheme);
    if (nextTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#090D16] text-slate-900 dark:text-slate-100 font-sans antialiased selection:bg-emerald-500 selection:text-black relative transition-colors duration-300">
      {/* Subtle Background Accent */}
      <div 
        className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-6xl h-[350px] pointer-events-none opacity-15"
        style={{
          background: "radial-gradient(ellipse 70% 40% at 50% 0%, #10b981, transparent)"
        }}
      />

      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-white/80 dark:bg-[#090D16]/80 border-b border-slate-200 dark:border-slate-800/80 px-6 lg:px-12 h-16 flex items-center justify-between transition-colors">
        <Link href="/" className="flex items-center space-x-2.5 hover:opacity-90 transition">
          <img src="/logo.png" alt="PRISM Logo" className="h-7 w-7 rounded-lg object-cover shadow-md" />
          <span className="text-base font-bold tracking-wide text-slate-900 dark:text-white">
            PRISM
          </span>
          <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400">
            v1.1
          </span>
        </Link>

        <div className="flex items-center space-x-6">
          <a
            href="https://github.com/sarthakmehra02/Prism"
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition flex items-center space-x-1"
          >
            <GithubIcon className="h-3.5 w-3.5" />
            <span>GitHub</span>
          </a>
          {loading ? (
            <div className="h-8 w-24 bg-slate-200 dark:bg-slate-900 rounded-lg animate-pulse" />
          ) : user ? (
            <Link
              href="/dashboard"
              className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white shadow-md transition duration-200"
            >
              <span>Open Workspace</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          ) : (
            <div className="flex items-center space-x-3">
              <Link 
                href="/login" 
                className="text-xs font-medium text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white transition"
              >
                Log In
              </Link>
              <Link
                href="/login"
                className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white shadow-md transition duration-200"
              >
                Get Started
              </Link>
            </div>
          )}
          <button 
            type="button"
            onClick={toggleTheme}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 transition shadow-sm"
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <Sun className="h-4 w-4 text-emerald-400" /> : <Moon className="h-4 w-4 text-emerald-600" />}
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="max-w-6xl mx-auto px-6 lg:px-12 pt-16 lg:pt-24 pb-16 space-y-10">
        <div className="max-w-3xl space-y-5">
          <div className="inline-flex items-center space-x-2 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md px-3 py-1 text-xs font-mono text-emerald-700 dark:text-emerald-400">
            <span>Multimodal Document Intelligence</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight">
            Document RAG with page-level citations.
          </h1>

          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed font-normal max-w-2xl">
            Upload PDFs, extract markdown tables, and describe visual charts using vision models. Query your documents with hybrid vector search and receive grounded answers backed by source page references.
          </p>

          <div className="flex items-center space-x-4 pt-2">
            <Link
              href={user ? "/dashboard" : "/login"}
              className="px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition flex items-center space-x-2 shadow-md"
            >
              <span>{user ? "Open Workspace" : "Get Started"}</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <a
              href="https://github.com/sarthakmehra02/Prism"
              target="_blank"
              rel="noreferrer"
              className="px-5 py-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition flex items-center space-x-2 shadow-sm"
            >
              <GithubIcon className="h-3.5 w-3.5" />
              <span>Source Code</span>
            </a>
          </div>
        </div>

        {/* Product Screenshot Mockup */}
        <div className="bg-white dark:bg-[#0E131F] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-2xl transition-colors">
          <div className="px-4 py-2.5 bg-slate-100 dark:bg-[#0A0D16] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-slate-700" />
              <span className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-slate-700" />
              <span className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-slate-700" />
            </div>
            <span className="text-[11px] font-mono text-slate-500">http://localhost:3000/dashboard</span>
            <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-900/50 px-2 py-0.5 rounded">
              Active Session
            </span>
          </div>

          <div className="p-6 grid grid-cols-1 md:grid-cols-12 gap-6 bg-slate-50/50 dark:bg-[#090D16]">
            {/* Sidebar Mock */}
            <div className="md:col-span-4 bg-white dark:bg-[#0E131F] border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
              <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">Workspace Files</div>
              <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 rounded-lg flex items-center justify-between">
                <div className="flex items-center space-x-2.5 overflow-hidden">
                  <FileText className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span className="text-xs text-slate-800 dark:text-slate-200 font-medium truncate">jfk_report.pdf</span>
                </div>
                <span className="text-[9px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-900/40">
                  Active
                </span>
              </div>
              <div className="bg-slate-50/50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800/60 p-3 rounded-lg flex items-center justify-between">
                <div className="flex items-center space-x-2.5 overflow-hidden">
                  <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate">2N3904_datasheet.pdf</span>
                </div>
                <span className="text-[9px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-900/40">
                  Active
                </span>
              </div>
            </div>

            {/* Chat Mock */}
            <div className="md:col-span-8 bg-white dark:bg-[#0E131F] border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-4">
              <div className="flex justify-end">
                <div className="bg-emerald-600 text-white text-xs px-3.5 py-2 rounded-lg font-medium shadow-sm">
                  What was the quarterly revenue growth in Q3?
                </div>
              </div>
              <div className="flex justify-start">
                <div className="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-300 text-xs p-3.5 rounded-lg space-y-2 max-w-[95%]">
                  <div>
                    According to the chart on page 3, Q3 revenue reached <strong className="text-slate-900 dark:text-white">$4.8M</strong> (+14.2% quarterly growth).
                  </div>
                  <div className="pt-1 flex items-center space-x-2">
                    <span className="bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-medium px-2 py-0.5 rounded flex items-center">
                      <FileText className="h-3 w-3 mr-1 text-emerald-600 dark:text-emerald-400" /> jfk_report.pdf (Pg. 3)
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="border-t border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#070A11] py-16 transition-colors">
        <div className="max-w-6xl mx-auto px-6 lg:px-12 space-y-10">
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">How Prism Processes Documents</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Built using modern layout parsing and vision LLMs.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-slate-50 dark:bg-[#0E131F] border border-slate-200 dark:border-slate-800 p-5 rounded-xl space-y-2.5">
              <div className="flex items-center space-x-2 text-emerald-600 dark:text-emerald-400">
                <Table className="h-4 w-4" />
                <span className="text-xs font-bold text-slate-900 dark:text-white">1. Structure Parsing</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Uses Docling to convert PDF layouts, nested lists, and table grids directly into markdown blocks.
              </p>
            </div>

            <div className="bg-slate-50 dark:bg-[#0E131F] border border-slate-200 dark:border-slate-800 p-5 rounded-xl space-y-2.5">
              <div className="flex items-center space-x-2 text-teal-600 dark:text-teal-400">
                <Eye className="h-4 w-4" />
                <span className="text-xs font-bold text-slate-900 dark:text-white">2. Figure Vision OCR</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Crops visual figures with PyMuPDF bboxes and dispatches them to Llama 3.2 Vision for descriptive textual summaries.
              </p>
            </div>

            <div className="bg-slate-50 dark:bg-[#0E131F] border border-slate-200 dark:border-slate-800 p-5 rounded-xl space-y-2.5">
              <div className="flex items-center space-x-2 text-cyan-600 dark:text-cyan-400">
                <Database className="h-4 w-4" />
                <span className="text-xs font-bold text-slate-900 dark:text-white">3. Hybrid Retrieval</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Combines pgvector semantic search and PostgreSQL Full-Text Search using Reciprocal Rank Fusion (RRF).
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="max-w-6xl mx-auto px-6 lg:px-12 py-8 border-t border-slate-200 dark:border-slate-800/60 flex items-center justify-between text-xs text-slate-500 font-mono">
        <div>Prism Document Intelligence</div>
        <div className="flex items-center space-x-4">
          <Link href="/dashboard" className="hover:text-slate-900 dark:hover:text-slate-300 transition">Workspace</Link>
          <a href="https://github.com/sarthakmehra02/Prism" target="_blank" rel="noreferrer" className="hover:text-slate-900 dark:hover:text-slate-300 transition">GitHub</a>
        </div>
      </footer>
    </div>
  );
}
