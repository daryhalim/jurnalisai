"use client";

// Midtrans Snap type declaration
declare global {
  interface Window {
    snap: {
      pay: (
        token: string,
        options: {
          onSuccess?: (result: any) => void;
          onPending?: (result: any) => void;
          onError?: (result: any) => void;
          onClose?: () => void;
        }
      ) => void;
    };
  }
}

import React, { useState, useEffect, useRef } from "react";
import { 
  Sparkles, 
  FileText, 
  Trash2, 
  Wand2, 
  ShieldAlert, 
  ShieldCheck, 
  Sliders, 
  RefreshCw, 
  Download, 
  Info, 
  CheckCircle2, 
  X,
  AlertCircle
} from "lucide-react";
import styles from "./page.module.css";

interface HighlightItem {
  text: string;
  reason: string;
}

interface AICheckResponse {
  score: number;
  explanation: string;
  highlights: HighlightItem[];
}

interface JournalData {
  judul: string;
  abstrak: string;
  pendahuluan: string;
  metode: string;
  hasil: string;
  kesimpulan: string;
  referensi: string;
}

const initialJournalData: JournalData = {
  judul: "",
  abstrak: "",
  pendahuluan: "",
  metode: "",
  hasil: "",
  kesimpulan: "",
  referensi: ""
};

type TabType = keyof JournalData;

export default function Home() {
  // File Upload State
  const [reportFile, setReportFile] = useState<File | null>(null);
  
  // Refs for file inputs
  const reportInputRef = useRef<HTMLInputElement>(null);

  // App API & Status State
  const [apiKey, setApiKey] = useState<string>("");
  const [showApiPanel, setShowApiPanel] = useState<boolean>(false);

  const isValidGeminiKey = (key?: string): boolean => {
    return typeof key === "string" && key.trim().startsWith("AIzaSy");
  };

  const isValidKieKey = (key?: string): boolean => {
    return typeof key === "string" && key.trim().length === 32 && /^[a-fA-F0-9]+$/.test(key.trim());
  };

  const getKeyTypeLabel = (): string => {
    if (!apiKey) return "Setup API Key";
    if (isValidGeminiKey(apiKey)) return "Gemini API Terhubung";
    if (isValidKieKey(apiKey)) return "KIE API Terhubung";
    return "API Key Terhubung";
  };
  const [status, setStatus] = useState<"idle" | "uploading" | "processing" | "checking" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [translate, setTranslate] = useState<boolean>(false);
  const [citationStyle, setCitationStyle] = useState<string>("apa7");

  // Journal Workspace State
  const [journalData, setJournalData] = useState<JournalData>(initialJournalData);
  const [activeTab, setActiveTab] = useState<TabType>("judul");
  
  // Turnitin AI Checker State
  const [aiScores, setAiScores] = useState<Record<TabType, number>>({
    judul: 0,
    abstrak: 0,
    pendahuluan: 0,
    metode: 0,
    hasil: 0,
    kesimpulan: 0,
    referensi: 0
  });
  const [aiHighlights, setAiHighlights] = useState<Record<TabType, HighlightItem[]>>({
    judul: [],
    abstrak: [],
    pendahuluan: [],
    metode: [],
    hasil: [],
    kesimpulan: [],
    referensi: []
  });
  const [aiExplanations, setAiExplanations] = useState<Record<TabType, string>>({
    judul: "",
    abstrak: "",
    pendahuluan: "",
    metode: "",
    hasil: "",
    kesimpulan: "",
    referensi: ""
  });

  // Paraphrase Popover State
  const [popoverVisible, setPopoverVisible] = useState<boolean>(false);
  const [popoverPos, setPopoverPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [popoverOriginalText, setPopoverOriginalText] = useState<string>("");
  const [popoverSuggestedText, setPopoverSuggestedText] = useState<string>("");
  const [popoverLoading, setPopoverLoading] = useState<boolean>(false);
  const [activeHighlightIndex, setActiveHighlightIndex] = useState<number>(-1);

  // Success Modal
  const [successModalVisible, setSuccessModalVisible] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Load API Key from localstorage on mount and enforce anti-copy/anti-screenshot
  useEffect(() => {
    const savedKey = localStorage.getItem("gemini_api_key");
    if (savedKey) {
      setApiKey(savedKey);
    }

    // Intercept Copy event
    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      if (e.clipboardData) {
        e.clipboardData.setData('text/plain', '');
      }
      alert("Penyalinan teks dilarang! Gunakan tombol 'Ekspor & Download .docx' di bagian bawah untuk mengunduh hasil jurnal Anda.");
    };

    // Intercept Cut event
    const handleCut = (e: ClipboardEvent) => {
      e.preventDefault();
      alert("Pemotongan teks dilarang! Gunakan tombol 'Ekspor & Download .docx' di bagian bawah untuk mengunduh hasil jurnal Anda.");
    };

    // Keyboard protection
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const isMeta = e.metaKey;
      const isCtrl = e.ctrlKey;
      const isShift = e.shiftKey;
      const isMetaOrCtrl = isMeta || isCtrl;

      // Detect macOS screenshot shortcuts: Cmd + Shift + 3, 4, 5
      if (isMeta && isShift && (key === '3' || key === '4' || key === '5')) {
        e.preventDefault();
        document.body.classList.add("blur-content");
        setTimeout(() => {
          document.body.classList.remove("blur-content");
        }, 3000);
        return;
      }

      // Detect Windows screenshot shortcut: Win + Shift + S
      if (isMeta && isShift && key === 's') {
        e.preventDefault();
        document.body.classList.add("blur-content");
        setTimeout(() => {
          document.body.classList.remove("blur-content");
        }, 3000);
        return;
      }

      if (isMetaOrCtrl && (key === 'c' || key === 'x')) {
        e.preventDefault();
        alert("Penyalinan teks dilarang! Silakan unduh file hasil dengan menekan tombol 'Ekspor & Download .docx' di bagian bawah.");
      }

      if (isMetaOrCtrl && key === 'p') {
        e.preventDefault();
        alert("Pencetakan dokumen dilarang!");
      }

      if (e.key === 'PrintScreen') {
        e.preventDefault();
        navigator.clipboard.writeText('');
        document.body.classList.add("blur-content");
        setTimeout(() => {
          document.body.classList.remove("blur-content");
        }, 3000);
        alert("Tangkapan layar dilarang!");
      }
    };

    // Right click prevention
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    // Layer 2: Visibility change detection (more reliable than blur)
    // This fires when user switches apps or macOS screenshot tool activates
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        document.body.classList.add("blur-content");
      } else {
        // Delay removing blur to ensure screenshot capture window has passed
        setTimeout(() => {
          document.body.classList.remove("blur-content");
        }, 500);
      }
    };

    // Fallback: window blur/focus (backup for visibility change)
    const handleBlur = () => {
      document.body.classList.add("blur-content");
    };

    const handleFocus = () => {
      setTimeout(() => {
        document.body.classList.remove("blur-content");
      }, 300);
    };

    document.addEventListener("copy", handleCopy);
    document.addEventListener("cut", handleCut);
    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);

    return () => {
      document.removeEventListener("copy", handleCopy);
      document.removeEventListener("cut", handleCut);
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);


  const saveApiKey = (key: string) => {
    setApiKey(key);
    if (key.trim()) {
      localStorage.setItem("gemini_api_key", key);
    } else {
      localStorage.removeItem("gemini_api_key");
    }
    setShowApiPanel(false);
  };

  // Handle drag and drop visuals
  const [dragOverReport, setDragOverReport] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverReport(true);
  };

  const handleDragLeave = () => {
    setDragOverReport(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleDragLeave();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith(".docx") || file.name.endsWith(".pdf")) {
        setReportFile(file);
      }
    }
  };

  // Helper: robust fetch that reads text first, then parses JSON
  const safeFetchJSON = async (url: string, options: RequestInit): Promise<any> => {
    const res = await fetch(url, options);
    const rawText = await res.text();

    if (!res.ok) {
      // Try to extract error message from JSON response
      try {
        const errorData = JSON.parse(rawText);
        throw new Error(errorData.error || `Server error ${res.status}`);
      } catch (parseErr: any) {
        // If the response is HTML (timeout/gateway error), provide helpful message
        if (rawText.includes("Gateway Timeout") || rawText.includes("Bad Gateway") || res.status === 502 || res.status === 504) {
          throw new Error("Batas waktu server habis (Gateway Timeout). Silakan coba lagi dalam beberapa saat.");
        }
        if (parseErr.message && !parseErr.message.includes("JSON")) {
          throw parseErr; // Re-throw if it's our custom error
        }
        throw new Error(`Server error ${res.status}: Respon tidak valid.`);
      }
    }

    if (!rawText.trim()) {
      throw new Error("Server mengembalikan respon kosong.");
    }

    try {
      return JSON.parse(rawText);
    } catch {
      throw new Error("Respon server bukan format JSON yang valid.");
    }
  };

  // Main Generator Logic — Section-by-Section Pipeline
  const startGenerating = async () => {
    if (!reportFile) return;

    setStatus("processing");
    setCurrentStep(0);
    setErrorMsg("");

    try {
      // ===== STEP 1: Ekstraksi Teks dari Dokumen =====
      setCurrentStep(1);

      const extractFormData = new FormData();
      extractFormData.append("report", reportFile);

      const extractResult = await safeFetchJSON("/api/extract", {
        method: "POST",
        body: extractFormData
      });

      const reportText: string = extractResult.reportText;
      if (!reportText || !reportText.trim()) {
        throw new Error("File laporan kosong atau tidak terbaca.");
      }

      const sectionPayload = (section: string, previousSections?: Record<string, string>) => ({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey && { "x-gemini-key": apiKey })
        },
        body: JSON.stringify({
          reportText,
          section,
          citationStyle,
          translate,
          previousSections
        })
      });

      const result: JournalData = { ...initialJournalData };

      // ===== STEP 2: Judul & Abstrak =====
      setCurrentStep(2);
      const judulAbstrak = await safeFetchJSON("/api/generate-section", sectionPayload("judul_abstrak"));
      result.judul = judulAbstrak.judul || "";
      result.abstrak = judulAbstrak.abstrak || "";
      setJournalData({ ...result });

      // ===== STEP 3: Pendahuluan =====
      setCurrentStep(3);
      const pendahuluan = await safeFetchJSON("/api/generate-section", sectionPayload("pendahuluan"));
      result.pendahuluan = pendahuluan.pendahuluan || "";
      setJournalData({ ...result });

      // ===== STEP 4: Metode =====
      setCurrentStep(4);
      const metode = await safeFetchJSON("/api/generate-section", sectionPayload("metode"));
      result.metode = metode.metode || "";
      setJournalData({ ...result });

      // ===== STEP 5: Hasil & Pembahasan =====
      setCurrentStep(5);
      const hasil = await safeFetchJSON("/api/generate-section", sectionPayload("hasil"));
      result.hasil = hasil.hasil || "";
      setJournalData({ ...result });

      // ===== STEP 6: Kesimpulan =====
      setCurrentStep(6);
      const kesimpulan = await safeFetchJSON("/api/generate-section", sectionPayload("kesimpulan", {
        judul: result.judul,
        abstrak: result.abstrak,
        pendahuluan: result.pendahuluan,
        hasil: result.hasil
      }));
      result.kesimpulan = kesimpulan.kesimpulan || "";
      setJournalData({ ...result });

      // ===== STEP 7: Sinkronisasi Kutipan & Daftar Pustaka =====
      setCurrentStep(7);
      const referensi = await safeFetchJSON("/api/generate-section", sectionPayload("referensi", {
        pendahuluan: result.pendahuluan,
        metode: result.metode,
        hasil: result.hasil,
        kesimpulan: result.kesimpulan
      }));
      result.referensi = referensi.referensi || "";
      setJournalData({ ...result });

      // ===== STEP 8: Turnitin AI Check (opsional, non-blocking) =====
      setCurrentStep(8);

      const tabsToCheck: TabType[] = ["abstrak", "pendahuluan"];
      const updatedScores = { ...aiScores };
      const updatedHighlights = { ...aiHighlights };
      const updatedExplanations = { ...aiExplanations };

      for (const tab of tabsToCheck) {
        if (result[tab] && result[tab].trim()) {
          try {
            const resData: AICheckResponse = await safeFetchJSON("/api/check-ai", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(apiKey && { "x-gemini-key": apiKey })
              },
              body: JSON.stringify({ text: result[tab] })
            });
            updatedScores[tab] = resData.score;
            updatedHighlights[tab] = resData.highlights || [];
            updatedExplanations[tab] = resData.explanation || "";
          } catch (e) {
            console.error(`AI checking failed for tab: ${tab}`, e);
          }
        }
      }

      setAiScores(updatedScores);
      setAiHighlights(updatedHighlights);
      setAiExplanations(updatedExplanations);

      setStatus("done");
      setActiveTab("judul");
    } catch (err: any) {
      console.error(err);
      setStatus("error");
      setErrorMsg(err.message || "Terjadi kesalahan sistem saat memproses.");
    }
  };

  // Perform AI analysis on the currently active tab
  const checkCurrentTabAI = async (textToCheck = journalData[activeTab]) => {
    if (!textToCheck || !textToCheck.trim() || activeTab === "judul" || activeTab === "referensi") return;
    
    setStatus("checking");
    try {
      const res = await fetch("/api/check-ai", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(apiKey && { "x-gemini-key": apiKey })
        },
        body: JSON.stringify({ text: textToCheck })
      });

      if (res.ok) {
        const resData: AICheckResponse = await res.json();
        setAiScores(prev => ({ ...prev, [activeTab]: resData.score }));
        setAiHighlights(prev => ({ ...prev, [activeTab]: resData.highlights || [] }));
        setAiExplanations(prev => ({ ...prev, [activeTab]: resData.explanation || "" }));
      }
    } catch (err) {
      console.error("AI check failed:", err);
    } finally {
      setStatus("done");
    }
  };

  // Paraphrase specific sentence triggered from highlights popup
  const handlePopoverParaphraseRequest = async (sentence: string) => {
    setPopoverLoading(true);
    try {
      const res = await fetch("/api/paraphrase", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(apiKey && { "x-gemini-key": apiKey })
        },
        body: JSON.stringify({ text: sentence })
      });
      if (res.ok) {
        const resData = await res.json();
        setPopoverSuggestedText(resData.paraphrasedText);
      }
    } catch (e) {
      console.error(e);
      setPopoverSuggestedText("Gagal memproses parafrase otomatis.");
    } finally {
      setPopoverLoading(false);
    }
  };

  const openHighlightPopover = (e: React.MouseEvent, text: string, index: number) => {
    e.preventDefault();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    
    // Position popover
    setPopoverPos({
      x: rect.left + window.scrollX - 50,
      y: rect.bottom + window.scrollY + 8
    });
    
    setPopoverOriginalText(text);
    setPopoverSuggestedText("");
    setActiveHighlightIndex(index);
    setPopoverVisible(true);
    
    // Immediately ask Gemini for a paraphrase suggestion
    handlePopoverParaphraseRequest(text);
  };

  const applyPopoverParaphrase = () => {
    if (!popoverSuggestedText || activeHighlightIndex === -1) return;

    const originalText = popoverOriginalText;
    const replacementText = popoverSuggestedText;

    // 1. Update text draft
    const oldText = journalData[activeTab];
    const newText = oldText.replace(originalText, replacementText);
    
    setJournalData(prev => ({ ...prev, [activeTab]: newText }));

    // 2. Remove highlight item from list
    const currentHighlights = [...(aiHighlights[activeTab] || [])];
    currentHighlights.splice(activeHighlightIndex, 1);
    setAiHighlights(prev => ({ ...prev, [activeTab]: currentHighlights }));

    setPopoverVisible(false);

    // 3. Recheck AI score for this tab after modification
    checkCurrentTabAI(newText);
  };

  // Full Tab automated paraphrase
  const paraphraseFullTab = async () => {
    const textToParaphrase = journalData[activeTab];
    if (!textToParaphrase.trim() || activeTab === "judul" || activeTab === "referensi") return;

    setStatus("checking");
    try {
      const res = await fetch("/api/paraphrase", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(apiKey && { "x-gemini-key": apiKey })
        },
        body: JSON.stringify({ text: textToParaphrase })
      });

      if (res.ok) {
        const resData = await res.json();
        const newText = resData.paraphrasedText;
        setJournalData(prev => ({ ...prev, [activeTab]: newText }));
        
        // Remove highlights since we paraphrased everything
        setAiHighlights(prev => ({ ...prev, [activeTab]: [] }));
        
        // Check AI scores for the new text
        await checkCurrentTabAI(newText);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setStatus("done");
    }
  };

  // Export filled document to DOCX — direct download (free mode)
  const handleExportDocx = async () => {
    setIsExporting(true);
    try {
      const formData = new FormData();
      formData.append("data", JSON.stringify(journalData));

      const res = await fetch("/api/export", {
        method: "POST",
        body: formData
      });

      if (!res.ok) {
        throw new Error("Gagal mengunduh dokumen.");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `naskah_jurnal_${activeTab === "judul" ? "terformat" : activeTab}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setSuccessModalVisible(true);
    } catch (e: any) {
      console.error(e);
      alert(`Ekspor gagal: ${e.message || e}`);
    } finally {
      setIsExporting(false);
    }
  };

  // Rendering Preview Pane with interactive highlights
  const renderPreviewWithHighlights = () => {
    const text = journalData[activeTab];
    const highlights = aiHighlights[activeTab] || [];

    if (!text) return <p style={{ color: "var(--text-muted)", fontStyle: "italic" }}>Kosong.</p>;
    if (activeTab === "judul") return <h2 style={{ fontSize: "1.5rem", fontWeight: "bold", textAlign: "center" }}>{text}</h2>;
    if (activeTab === "referensi") {
      return (
        <div style={{ whiteSpace: "pre-line" }}>
          {text}
        </div>
      );
    }

    if (highlights.length === 0) {
      return <p style={{ whiteSpace: "pre-wrap" }}>{text}</p>;
    }

    // Sort highlights by length descending to avoid partial matches inside other matches
    const sortedHighlights = [...highlights].sort((a, b) => b.text.length - a.text.length);

    // Build interactive element hierarchy
    let previewContent: React.ReactNode[] = [text];

    sortedHighlights.forEach((hl, hlIdx) => {
      const nextContent: React.ReactNode[] = [];

      previewContent.forEach((node) => {
        if (typeof node === "string") {
          const parts = node.split(hl.text);
          if (parts.length > 1) {
            parts.forEach((part, partIdx) => {
              nextContent.push(part);
              if (partIdx < parts.length - 1) {
                nextContent.push(
                  <span 
                    key={`hl-${hlIdx}-${partIdx}`} 
                    className={styles.highlightAi}
                    onClick={(e) => openHighlightPopover(e, hl.text, hlIdx)}
                    title={hl.reason}
                  >
                    {hl.text}
                  </span>
                );
              }
            });
          } else {
            nextContent.push(node);
          }
        } else {
          nextContent.push(node);
        }
      });

      previewContent = nextContent;
    });

    return <p style={{ whiteSpace: "pre-wrap" }}>{previewContent}</p>;
  };

  // Helper values for score dials
  const activeScore = aiScores[activeTab] || 0;
  const activeEx = aiExplanations[activeTab] || "";
  const dialOffset = 377 - (377 * activeScore) / 100;

  let dialColor = "var(--success)";
  let statusText = "Aman / Manusia";
  if (activeScore > 65) {
    dialColor = "var(--danger)";
    statusText = "Sangat Tinggi";
  } else if (activeScore > 30) {
    dialColor = "var(--warning)";
    statusText = "Indikasi Sedang";
  }

  // Trigger file inputs
  const clickInput = (ref: React.RefObject<HTMLInputElement | null>) => {
    if (ref.current) ref.current.click();
  };

  return (
    <>
      {/* Screen Shield DRM overlay */}
      <div className="screen-shield" aria-hidden="true" />
      
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.logoArea}>
          <div className={styles.logoIcon}>
            <Sparkles size={20} />
          </div>
          <h1 className={styles.logoTitle}>Jurnalis.AI</h1>
        </div>
      </header>

      {/* Tutorial Banner */}
      <div className={styles.tutorialBanner}>
        <Info size={20} />
        <div className={styles.tutorialText}>
          <strong>Cara Kerja:</strong> Unggah laporan penelitian atau PKM Anda. AI akan mengekstrak &amp; menyusun naskah jurnal ilmiah lengkap secara otomatis. Setelah diedit &amp; lolos Turnitin Checker, klik <strong>Ekspor &amp; Download</strong> untuk mengunduh file <code>.docx</code> jurnal yang sudah jadi.
        </div>
      </div>

      {/* Phase 1: Upload Files Zone */}
      {status === "idle" || status === "error" ? (
        <div className={styles.workspace}>
          <div className="glass-card" style={{ padding: "2rem" }}>
            <h2 style={{ fontFamily: "var(--font-title)", fontWeight: 700, marginBottom: "0.5rem" }}>Unggah Laporan Penelitian</h2>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginBottom: "2rem" }}>
              Upload file laporan penelitian atau PKM Anda untuk dikonversi menjadi naskah jurnal ilmiah oleh AI.
            </p>

            <div style={{ display: "flex", justifyContent: "center" }}>
              {/* Dropzone: Report */}
              <div 
                className={`${styles.uploadCard} ${reportFile ? styles.uploadCardActive : ""}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => clickInput(reportInputRef)}
                style={{ borderColor: dragOverReport ? "var(--primary)" : "", maxWidth: "480px", width: "100%" }}
              >
                <input 
                  type="file" 
                  ref={reportInputRef} 
                  accept=".docx,.pdf" 
                  style={{ display: "none" }} 
                  onChange={(e) => e.target.files && setReportFile(e.target.files[0])}
                />
                <div className={styles.uploadIconWrapper}>
                  <FileText size={28} />
                </div>
                <div className={styles.uploadTitle}>Laporan Penelitian / PKM</div>
                <div className={styles.uploadDesc}>Tarik file Word (.docx) atau PDF ke sini, atau klik untuk memilih file.</div>
                
                {reportFile && (
                  <div className={styles.fileIndicator} onClick={(e) => e.stopPropagation()}>
                    <FileText size={16} style={{ color: "var(--success)" }} />
                    <span style={{ textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap", maxWidth: "200px" }}>
                      {reportFile.name}
                    </span>
                    <span className={styles.removeFile} onClick={() => setReportFile(null)}>
                      <Trash2 size={14} />
                    </span>
                  </div>
                )}
              </div>
            </div>

            {status === "error" && (
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", color: "var(--danger)", marginBottom: "1rem", marginTop: "1rem" }}>
                <AlertCircle size={16} />
                <span className={styles.errorText}>{errorMsg}</span>
              </div>
            )}

            <div className={styles.actionPanel}>
              <button 
                className={styles.btnGradient} 
                disabled={!reportFile}
                onClick={startGenerating}
              >
                <Wand2 size={20} />
                Mulai Proses Konversi Jurnal
              </button>
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Format didukung: Word (.docx) & PDF</span>
            </div>
          </div>
        </div>
      ) : null}

      {/* Phase 2: Processing Overlay */}
      {status === "processing" ? (
        <div className={styles.processingModal}>
          <div className={`${styles.processingContent} glass-card`} style={{ padding: "2rem" }}>
            <div className={styles.loaderRing}></div>
            <h3 style={{ fontFamily: "var(--font-title)", fontSize: "1.25rem", fontWeight: 700, marginBottom: "0.5rem" }}>
              Sedang Menyusun Jurnal Anda
            </h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
              AI sedang menulis jurnal Anda bagian per bagian...
            </p>

            <div className={styles.stepList}>
              <div className={`${styles.stepItem} ${currentStep > 1 ? styles.stepItemCompleted : currentStep === 1 ? styles.stepItemActive : ""}`}>
                <div className={styles.stepDot}></div>
                <span>Membaca & mengekstrak isi laporan penelitian...</span>
              </div>
              <div className={`${styles.stepItem} ${currentStep > 2 ? styles.stepItemCompleted : currentStep === 2 ? styles.stepItemActive : ""}`}>
                <div className={styles.stepDot}></div>
                <span>Menyusun Judul & Abstrak...</span>
              </div>
              <div className={`${styles.stepItem} ${currentStep > 3 ? styles.stepItemCompleted : currentStep === 3 ? styles.stepItemActive : ""}`}>
                <div className={styles.stepDot}></div>
                <span>Menulis bagian Pendahuluan (dengan kutipan)...</span>
              </div>
              <div className={`${styles.stepItem} ${currentStep > 4 ? styles.stepItemCompleted : currentStep === 4 ? styles.stepItemActive : ""}`}>
                <div className={styles.stepDot}></div>
                <span>Menulis bagian Metode...</span>
              </div>
              <div className={`${styles.stepItem} ${currentStep > 5 ? styles.stepItemCompleted : currentStep === 5 ? styles.stepItemActive : ""}`}>
                <div className={styles.stepDot}></div>
                <span>Menulis Hasil & Pembahasan (bagian terpanjang)...</span>
              </div>
              <div className={`${styles.stepItem} ${currentStep > 6 ? styles.stepItemCompleted : currentStep === 6 ? styles.stepItemActive : ""}`}>
                <div className={styles.stepDot}></div>
                <span>Menulis Kesimpulan...</span>
              </div>
              <div className={`${styles.stepItem} ${currentStep > 7 ? styles.stepItemCompleted : currentStep === 7 ? styles.stepItemActive : ""}`}>
                <div className={styles.stepDot}></div>
                <span>Menyinkronkan Kutipan & Daftar Pustaka...</span>
              </div>
              <div className={`${styles.stepItem} ${currentStep > 8 ? styles.stepItemCompleted : currentStep === 8 ? styles.stepItemActive : ""}`}>
                <div className={styles.stepDot}></div>
                <span>Estimasi Turnitin AI Detector awal...</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Phase 3: Dashboard Workspace */}
      {status === "done" || status === "checking" ? (
        <div className={styles.workspaceProcessed}>
          {/* Left panel: Dial, configuration */}
          <div className={styles.controlPanel}>
            {/* Turnitin Gauge */}
            <div className={`${styles.turnitinPanel} glass-card`}>
              <div className={styles.panelHeading} style={{ justifyContent: "center" }}>
                {activeScore > 30 ? (
                  <ShieldAlert size={18} style={{ color: "var(--danger)" }} />
                ) : (
                  <ShieldCheck size={18} style={{ color: "var(--success)" }} />
                )}
                <span>Turnitin AI Simulator</span>
              </div>
              <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "0.5rem" }}>
                Estimasi gaya bahasa mesin pada tab {activeTab.toUpperCase()}
              </p>

              {activeTab === "judul" || activeTab === "referensi" ? (
                <div style={{ padding: "2rem 0", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                  Skor AI tidak dihitung untuk bagian Judul dan Referensi.
                </div>
              ) : (
                <>
                  <div className={styles.scoreBox}>
                    <svg className={styles.scoreSvg}>
                      <circle className={styles.scoreTrack} cx="70" cy="70" r="60" />
                      <circle 
                        className={styles.scoreFill} 
                        cx="70" 
                        cy="70" 
                        r="60" 
                        style={{ 
                          stroke: dialColor, 
                          strokeDashoffset: dialOffset,
                          strokeDasharray: "377" 
                        }}
                      />
                    </svg>
                    <div className={styles.scoreTextWrapper}>
                      <span className={styles.scoreNum} style={{ color: dialColor }}>{activeScore}%</span>
                      <span className={styles.scoreLabel}>AI Content</span>
                    </div>
                  </div>

                  <div className={styles.turnitinDetails}>
                    <div className={styles.detailItem}>
                      <span className={styles.detailVal} style={{ color: dialColor }}>{statusText}</span>
                      <span className={styles.detailLbl}>Status Deteksi</span>
                    </div>
                    <div className={styles.detailItem}>
                      <span className={styles.detailVal}>{activeScore > 0 ? Math.round(activeScore / 4.5 + 4) : 0}%</span>
                      <span className={styles.detailLbl}>Similarity</span>
                    </div>
                  </div>

                  {activeScore > 30 ? (
                    <div className={`${styles.paraRecommendation} ${styles.paraRecRed}`}>
                      <span style={{ color: "var(--danger)", fontWeight: 600 }}>Tindakan Disarankan:</span> Beberapa paragraf terdeteksi AI. Klik kalimat bergaris merah di dokumen kanan untuk paraphrase instan, atau klik <strong>Parafrase Otomatis</strong> di atas untuk memproses seluruh tab ini.
                    </div>
                  ) : (
                    <div className={`${styles.paraRecommendation} ${styles.paraRecGreen}`}>
                      <span style={{ color: "var(--success)", fontWeight: 600 }}>Naskah Aman:</span> Karakteristik gaya penulisan tab ini dinilai mirip dengan karya tulis manusia.
                    </div>
                  )}
                  <button className={styles.btnGradient} onClick={paraphraseFullTab} type="button" style={{ marginTop: "0.5rem", width: "100%" }}>Parafrase Otomatis</button>
                </>
              )}
            </div>

            {/* Config panel */}
            <div className="glass-card" style={{ padding: "1.5rem" }}>
              <div className={styles.panelHeading}>
                <Sliders size={18} style={{ color: "var(--primary)" }} />
                <span>Konfigurasi Jurnal</span>
              </div>
              
              <div className={styles.optionGroup}>
                <div className={styles.toggleContainer}>
                  <div>
                    <div style={{ fontWeight: 500 }}>Terjemahan Scopus (En)</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                      Translate naskah ke Bahasa Inggris
                    </div>
                  </div>
                  <label className={styles.switch}>
                    <input 
                      type="checkbox" 
                      checked={translate} 
                      onChange={(e) => {
                        setTranslate(e.target.checked);
                        // In a real application, you would trigger translation endpoint here.
                        // For the prototype we can alert or suggest re-generating.
                      }}
                    />
                    <span className={styles.slider}></span>
                  </label>
                </div>

                <div className={styles.toggleContainer} style={{ flexDirection: "column", alignItems: "stretch", gap: "0.75rem" }}>
                  <div>
                    <div style={{ fontWeight: 500 }}>Gaya Sitasi & Daftar Pustaka</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                      Pilih format kutipan naskah jurnal
                    </div>
                  </div>
                  <select 
                    value={citationStyle}
                    onChange={(e) => setCitationStyle(e.target.value)}
                    style={{
                      background: "rgba(0, 0, 0, 0.25)",
                      border: "1px solid var(--border-color)",
                      borderRadius: "8px",
                      padding: "0.5rem 0.75rem",
                      color: "white",
                      fontSize: "0.85rem",
                      outline: "none",
                      cursor: "pointer",
                      maxWidth: "100%",
                      textOverflow: "ellipsis"
                    }}
                  >
                    <option value="apa7" style={{ background: "#06202B", color: "white" }}>APA 7th Edition (Nama, Tahun)</option>
                    <option value="ieee" style={{ background: "#06202B", color: "white" }}>IEEE Style ([1], [2])</option>
                    <option value="harvard" style={{ background: "#06202B", color: "white" }}>Harvard Style</option>
                    <option value="vancouver" style={{ background: "#06202B", color: "white" }}>Vancouver Style (Numerik)</option>
                  </select>
                </div>

                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", background: "rgba(255,255,255,0.02)", padding: "0.5rem", borderRadius: "6px", border: "1px solid var(--border-color)" }}>
                  💡 Ganti tab editor untuk memantau, memvalidasi skor AI, dan merevisi bagian naskah.
                </div>
              </div>
            </div>
          </div>

          {/* Right panel: Editor Workspace */}
          <div className="glass-card states-editor-container" style={{ padding: "1.75rem", display: "flex", flexDirection: "column" }}>
            <div className={styles.editorHeader}>
              <div className={styles.editorTabs}>
                {(Object.keys(journalData) as TabType[]).map((tab) => (
                  <button 
                    key={tab}
                    className={`${styles.tabBtn} ${activeTab === tab ? styles.tabBtnActive : ""}`}
                    onClick={() => setActiveTab(tab)}
                  >
                    {tab.toUpperCase()}
                  </button>
                ))}
              </div>

              {activeTab !== "judul" && activeTab !== "referensi" && (
                <button 
                  className={styles.btnSmall} 
                  style={{ 
                    background: "linear-gradient(135deg, var(--primary), var(--secondary))", 
                    color: "white", 
                    border: "none",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.25rem"
                  }}
                  disabled={status === "checking"}
                  onClick={paraphraseFullTab}
                >
                  <RefreshCw size={12} className={status === "checking" ? "spin" : ""} />
                  Parafrase Otomatis
                </button>
              )}
            </div>

            <div className={styles.editorWorkspace}>
              {/* Draft Editor Textarea */}
              <div className={styles.editorPane}>
                <div className={styles.paneHeader}>
                  <span>Editor Draf Jurnal</span>
                  <span className={styles.paneBadge}>Dapat Diedit</span>
                </div>
                <textarea 
                  className={styles.paneBody}
                  value={journalData[activeTab]}
                  onChange={(e) => {
                    const textVal = e.target.value;
                    setJournalData(prev => ({ ...prev, [activeTab]: textVal }));
                  }}
                  onBlur={() => checkCurrentTabAI()}
                />
              </div>

              {/* Pre-layout Document Preview with highlights */}
              <div className={styles.editorPane}>
                <div className={styles.paneHeader}>
                  <span>Hasil Output Layout Jurnal</span>
                  <span className={styles.paneBadge} style={{ background: "rgba(16, 185, 129, 0.1)", color: "var(--success)" }}>
                    Opsi A Tergabung
                  </span>
                </div>
                <div className={`${styles.paneBody} ${styles.paneBodyPreview}`}>
                  {renderPreviewWithHighlights()}
                </div>
              </div>
            </div>

            {/* Hover Popover Paraphrase Dialog */}
            {popoverVisible && (
              <div 
                className={styles.paraphrasePopover}
                style={{ left: `${popoverPos.x}px`, top: `${popoverPos.y}px` }}
              >
                <div className={styles.popoverHeader}>
                  <span>Skor AI Tinggi Terdeteksi</span>
                  <span style={{ color: "var(--danger)", fontWeight: 700 }}>Risiko AI</span>
                </div>
                <div className={styles.popoverBody} style={{ fontStyle: "italic" }}>
                  "{popoverOriginalText}"
                </div>
                <div className={styles.popoverHeader} style={{ color: "var(--success)", marginTop: "0.5rem" }}>
                  Saran Parafrase Gemini:
                </div>
                <div className={styles.popoverBody} style={{ borderColor: "rgba(16, 185, 129, 0.3)", background: "rgba(16, 185, 129, 0.03)" }}>
                  {popoverLoading ? "Menghubungi AI Gemini untuk memparafase..." : popoverSuggestedText}
                </div>
                <div className={styles.popoverActions}>
                  <button className={`${styles.btnSmall} ${styles.btnSmallSecondary}`} onClick={() => setPopoverVisible(false)}>
                    Batal
                  </button>
                  <button 
                    className={`${styles.btnSmall} ${styles.btnSmallPrimary}`} 
                    disabled={popoverLoading || !popoverSuggestedText}
                    onClick={applyPopoverParaphrase}
                  >
                    Terapkan Parafrase
                  </button>
                </div>
              </div>
            )}

            {/* Export Footer */}
            <div className={styles.exportFooter}>
              <div className={styles.editorStatus}>
                <div className="pulse-green" />
                <span>Siap untuk diexport</span>
              </div>
              <button 
                className={styles.btnGradient} 
                style={{ padding: "0.75rem 1.75rem", fontSize: "0.95rem" }}
                disabled={isExporting}
                onClick={handleExportDocx}
              >
                <Download size={18} />
                {isExporting ? "Mengekspor..." : "Ekspor & Download .docx"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Success Modal */}
      {successModalVisible && (
        <div className={styles.successModal}>
          <div className={styles.successCard}>
            <div className={styles.successIcon}>
              <CheckCircle2 size={40} />
            </div>
            <h3 style={{ fontFamily: "var(--font-title)", fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>
              Dokumen Sukses Diekspor!
            </h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginBottom: "1.5rem" }}>
              Naskah jurnal ilmiah Anda telah berhasil dibuat. File <strong>naskah_jurnal_terformat.docx</strong> telah terunduh ke komputer Anda.
            </p>
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
              <button className={`${styles.btnSmall} ${styles.btnSmallPrimary}`} style={{ padding: "0.6rem 1.5rem" }} onClick={() => setSuccessModalVisible(false)}>
                Selesai
              </button>
              <button 
                className={`${styles.btnSmall} ${styles.btnSmallSecondary}`} 
                style={{ padding: "0.6rem 1.5rem" }} 
                onClick={() => {
                  setSuccessModalVisible(false);
                  setStatus("idle");
                  setReportFile(null);
                  setReportFile(null);
                  setJournalData(initialJournalData);
                }}
              >
                Buat Baru
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
