'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Briefcase,
  FileText,
  Send,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Award,
  TrendingUp,
  MessageSquare,
  Bot,
  User,
  Copy,
  Check,
  ChevronRight,
  ChevronDown,
  ArrowRight,
  HelpCircle,
  Lightbulb,
  SlidersHorizontal,
  UploadCloud,
  FileUp,
  FileCheck,
  X,
  Eye,
  EyeOff,
  RefreshCw,
  Star,
  Compass,
  HelpCircle as QuestionIcon
} from 'lucide-react';

interface Message {
  role: 'interviewer' | 'candidate';
  content: string;
}

interface Dimension {
  name: string;
  score: number;
  comment: string;
}

interface QuestionReview {
  stageName?: string;
  questionNumber: number;
  question: string;
  candidateAnswer: string;
  score: number;
  feedback: string;
  betterAnswer: string;
}

interface Assessment {
  totalScore: number;
  dimensions: Dimension[];
  strengths: string[];
  improvements: string[];
  overallSummary: string;
  questionReviews?: QuestionReview[];
}

const SAMPLE_PRESETS = [
  {
    title: '前端資深工程師',
    url: 'https://example.com/jobs/senior-frontend-engineer',
    resume: `【個人簡介】
5 年前端開發經驗，熟悉 React、Next.js、TypeScript 與 Tailwind CSS。主導過高流量電商核心模組重構，並導入微前端架構。

【工作經歷】
- 科技新創 資深前端工程師（2023 - 至今）：
  - 負責使用者介面效能優化，將 LCP 指標提升 45%，跳出率降低 12%。
  - 導入 Tailwind 與 Design System，跨團隊元件覆用率達 80%。
- 軟體顧問公司 前端工程師（2021 - 2023）：
  - 開發 CRM 系統與即時數據儀表板，支援 WebSocket 即時圖表渲染。`
  },
  {
    title: 'AI 產品經理',
    url: 'https://example.com/jobs/ai-product-manager',
    resume: `【個人簡介】
4 年科技產品規劃經驗，專注於生成式 AI 應用落地、LLM 工作流程設計與商業變現。

【核心專案】
- 企業級智能客服系統：從 0 到 1 規劃 RAG 檢索架構與評測指標，客服自動回覆率達 72%，年省百萬營運成本。
- 具備跨領域溝通與敏捷開發引領能力，能精準將商業目標轉化為工程規格。`
  }
];

const FAQS = [
  {
    q: '自我介紹與結尾反問會計入我所設定的題數嗎？',
    a: '完全不會！系統所設定的題數僅代表「正式專業題目」的數量。面試會以「自我介紹」破冰開場，接著進行您設定數量的正式專業題目深挖，最後由面試官邀請您進行「結尾反問」。自我介紹與結尾反問皆不佔用正式題數。'
  },
  {
    q: '結尾反問會被納入評分嗎？',
    a: '會的！在頂尖外商與企業面試中，候選人向面試官提出的問題是衡量其主動性、商業敏感度、思考格局與團隊契合度的重要標準。評分報告將為您的反問提供評分與點評，並示範「如何提問能給面試官留下深刻印象」。'
  },
  {
    q: '上傳的履歷與職缺資料會被儲存或公開嗎？',
    a: '不會。我們極度注重個人隱私，所有履歷檔案與職缺文字僅於當次會話中即時進行向量比對與模擬問答，絕不進行永久儲存或用於公開模型訓練。'
  },
  {
    q: '逐題覆盤中的「如何回答得更好」是如何產生的？',
    a: '系統依據頂尖科技企業常用的 STAR 答題原則（情境、任務、行動、成果），分析您的回答盲點，並由資深面試官視角提供精確的範例話術與量化加分訣竅。'
  }
];

export default function SaaSInterviewApp() {
  const [currentView, setCurrentView] = useState<'landing' | 'simulator'>('landing');

  // 面試狀態
  const [phase, setPhase] = useState<'setup' | 'interview' | 'report'>('setup');
  const [jobUrl, setJobUrl] = useState('');
  const [resume, setResume] = useState('');
  const [resumeMode, setResumeMode] = useState<'upload' | 'text'>('upload');
  const [uploadedFile, setUploadedFile] = useState<{ name: string; size: number } | null>(null);
  const [fileParsing, setFileParsing] = useState(false);
  const [showExtractedPreview, setShowExtractedPreview] = useState(false);
  
  // 不預設題數，讓使用者自主選擇 (初始為 null)
  const [totalQuestions, setTotalQuestions] = useState<number | null>(null);
  const [history, setHistory] = useState<Message[]>([]);
  
  // 階段識別：'intro' | 'formal' | 'reverse_question'
  const [currentStage, setCurrentStage] = useState<'intro' | 'formal' | 'reverse_question'>('intro');
  const [currentFormalQuestion, setCurrentFormalQuestion] = useState(0);

  const [candidateInput, setCandidateInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [copied, setCopied] = useState(false);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const simulatorRef = useRef<HTMLDivElement>(null);

  // 自動捲動
  useEffect(() => {
    if (phase === 'interview') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [history, loading, phase]);

  const launchSimulator = () => {
    setCurrentView('simulator');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // 處理檔案上傳
  const handleFileUpload = async (file: File) => {
    if (!file) return;

    const validExtensions = ['.pdf', '.docx', '.txt', '.md'];
    const hasValidExt = validExtensions.some((ext) => file.name.toLowerCase().endsWith(ext));
    if (!hasValidExt) {
      setError(`不支援的檔案格式（${file.name}），請上傳 PDF、DOCX、TXT 或 MD 履歷檔案。`);
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      setError('檔案大小不可超過 20MB。');
      return;
    }

    setError(null);
    setFileParsing(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/parse-resume', {
        method: 'POST',
        body: formData
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || `檔案解析失敗 (${res.status})`);
      }

      if (!data.text || data.text.trim().length < 5) {
        throw new Error('未能由檔案中讀取到足夠文字，若是純圖片掃描檔建議先轉為純文字或手動貼上。');
      }

      setResume(data.text);
      setUploadedFile({ name: file.name, size: file.size });
      setShowExtractedPreview(true);
    } catch (err: unknown) {
      console.error('File upload error:', err);
      const msg = err instanceof Error ? err.message : '解析履歷檔案失敗';
      setError(msg);
      setUploadedFile(null);
    } finally {
      setFileParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveFile = () => {
    setUploadedFile(null);
    setResume('');
    setShowExtractedPreview(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const loadPreset = (preset: typeof SAMPLE_PRESETS[0]) => {
    setJobUrl(preset.url);
    setResume(preset.resume);
    setResumeMode('text');
    setUploadedFile(null);
  };

  // 開始面試 -> 取得開場自我介紹題目
  const handleStartInterview = async () => {
    if (!resume.trim()) {
      setError('請先上傳履歷檔案或貼上您的履歷內容，以利 AI 面試官進行深入提問。');
      return;
    }

    if (!totalQuestions || totalQuestions < 1) {
      setError('請先選擇或輸入欲進行的正式面試題數（1 ~ 10 題）。');
      return;
    }

    const qCount = Math.min(Math.max(Number(totalQuestions), 1), 10);
    setTotalQuestions(qCount);
    setError(null);
    setLoading(true);
    setPhase('interview');
    setHistory([]);
    setCurrentStage('intro');
    setCurrentFormalQuestion(0);

    try {
      const res = await fetch('/interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobUrl: jobUrl.trim(),
          resume: resume.trim(),
          totalQuestions: qCount,
          history: []
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || '啟動面試失敗');
      }

      const data = await res.json();
      setHistory([{ role: 'interviewer', content: data.content }]);
      setCurrentStage(data.stage || 'intro');
      setCurrentFormalQuestion(data.formalQuestionNumber || 0);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '啟動面試時發生錯誤';
      setError(msg);
      setPhase('setup');
    } finally {
      setLoading(false);
    }
  };

  // 呼叫面試 API 推進流程
  const requestInterviewResponse = async (historyToSend: Message[]) => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobUrl: jobUrl.trim(),
          resume: resume.trim(),
          totalQuestions: totalQuestions || 3,
          history: historyToSend
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || '發送回答失敗');
      }

      const data = await res.json();

      if (data.isFinished || data.type === 'feedback') {
        // 面試圓滿結束，取得面試官回答候選人反問的內容，以及最終評分複盤報告
        setHistory((prev) => [...prev, { role: 'interviewer', content: data.content }]);
        setAssessment(data.assessment);
        setPhase('report');
      } else {
        // 下一題（自我介紹 -> 正式第 1 題 -> ... -> 反問環節）
        setHistory((prev) => [...prev, { role: 'interviewer', content: data.content }]);
        setCurrentStage(data.stage || 'formal');
        setCurrentFormalQuestion(data.formalQuestionNumber || 0);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '取得面試官回應時發生錯誤';
      setError(msg);
    } finally {
      setLoading(false);
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  };

  // 提交候選人回答
  const handleSubmitAnswer = async () => {
    if (!candidateInput.trim() || loading) return;

    const answer = candidateInput.trim();
    setCandidateInput('');
    setError(null);

    const updatedHistory: Message[] = [...history, { role: 'candidate', content: answer }];
    setHistory(updatedHistory);
    await requestInterviewResponse(updatedHistory);
  };

  // 錯誤重試
  const handleRetryLastAnswer = async () => {
    if (loading || history.length === 0) return;
    setError(null);
    await requestInterviewResponse(history);
  };

  // 複製報告 (完整包含自我介紹、正式題目與結尾反問)
  const handleCopyReport = () => {
    if (!assessment) return;

    let reviewText = '';
    if (assessment.questionReviews && assessment.questionReviews.length > 0) {
      reviewText = `\n\n【逐題精準覆盤與更佳回答示範】\n` +
        assessment.questionReviews
          .map(
            (r) =>
              `--- ${r.stageName || (r.questionNumber === 0 ? '【破冰開場】自我介紹與動機' : `正式第 ${r.questionNumber} 題`)} (${r.score}分) ---\n` +
              `[題目]：${r.question}\n` +
              `[您的回答/提問]：${r.candidateAnswer}\n` +
              `[表現點評]：${r.feedback}\n` +
              `[如何回答/提問得更好]：${r.betterAnswer}\n`
          )
          .join('\n');
    }

    const text = `【AI 面試模擬評分與逐題複盤報告】\n總分：${assessment.totalScore} / 100 (包含自我介紹 ＋ ${totalQuestions || 3} 道正式專業深挖題 ＋ 結尾反問)\n\n【各項維度】\n${assessment.dimensions.map((d) => `- ${d.name} (${d.score}分): ${d.comment}`).join('\n')}\n\n【亮點優勢】\n${assessment.strengths.map((s) => `✔ ${s}`).join('\n')}\n\n【改進建議】\n${assessment.improvements.map((i) => `▲ ${i}`).join('\n')}\n\n【面試官總評語】\n${assessment.overallSummary}${reviewText}`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 重置回設定
  const handleReset = () => {
    setPhase('setup');
    setHistory([]);
    setAssessment(null);
    setCurrentStage('intro');
    setCurrentFormalQuestion(0);
    setCandidateInput('');
    setError(null);
  };

  return (
    <div className="min-h-screen bg-[#F8F6F2] text-[#2C302E] flex flex-col font-sans selection:bg-[#4A6B62]/20">
      {/* ======================= 全站統一頂級 SaaS Header ======================= */}
      <header className="sticky top-0 z-50 bg-[#F8F6F2]/85 backdrop-blur-md border-b border-[#E8E2D8]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-18 flex items-center justify-between">
          <div
            onClick={() => setCurrentView('landing')}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-xl bg-[#4A6B62] text-white flex items-center justify-center shadow-xs transition-transform group-hover:scale-105">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg tracking-tight text-[#1E2321]">
                  InterviewCraft
                </span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#EFEAE2] text-[#4A6B62] border border-[#DFD8CD]">
                  PRO
                </span>
              </div>
              <p className="text-[11px] text-[#7A827D] hidden sm:block">
                AI 智慧職缺與履歷深挖面試系統
              </p>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-xs font-medium text-[#5E6862]">
            <button
              onClick={() => {
                setCurrentView('landing');
                setTimeout(() => {
                  document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
                }, 50);
              }}
              className="hover:text-[#1E2321] transition-colors cursor-pointer"
            >
              核心優勢
            </button>
            <button
              onClick={() => {
                setCurrentView('landing');
                setTimeout(() => {
                  document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' });
                }, 50);
              }}
              className="hover:text-[#1E2321] transition-colors cursor-pointer"
            >
              使用流程
            </button>
            <button
              onClick={() => {
                setCurrentView('landing');
                setTimeout(() => {
                  document.getElementById('testimonials')?.scrollIntoView({ behavior: 'smooth' });
                }, 50);
              }}
              className="hover:text-[#1E2321] transition-colors cursor-pointer"
            >
              求職者見證
            </button>
            <button
              onClick={() => {
                setCurrentView('landing');
                setTimeout(() => {
                  document.getElementById('faq')?.scrollIntoView({ behavior: 'smooth' });
                }, 50);
              }}
              className="hover:text-[#1E2321] transition-colors cursor-pointer"
            >
              常見問題
            </button>
          </nav>

          <div className="flex items-center gap-3">
            {currentView === 'landing' ? (
              <button
                type="button"
                onClick={launchSimulator}
                className="px-5 py-2.5 rounded-xl bg-[#4A6B62] hover:bg-[#3D5952] text-white text-xs sm:text-sm font-medium flex items-center gap-2 transition-all shadow-sm hover:shadow-md cursor-pointer"
              >
                <span>立即開始模擬</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setCurrentView('landing')}
                className="px-4 py-2 rounded-xl border border-[#D5CDC2] bg-white hover:bg-[#FAF8F5] text-xs font-medium text-[#414844] flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
              >
                <Compass className="w-3.5 h-3.5" />
                <span>返回產品介紹</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* 視圖 A：高質感 SaaS Landing Page 介紹首頁 */}
      {/* ========================================================================= */}
      {currentView === 'landing' && (
        <div className="flex-1 flex flex-col">
          {/* Hero 區塊 */}
          <section className="relative overflow-hidden pt-12 pb-20 sm:pt-20 sm:pb-28">
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-gradient-to-tr from-[#D5E0DB]/40 to-[#EAE3D9]/60 rounded-full blur-3xl -z-10 pointer-events-none" />

            <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center space-y-8">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium bg-white/80 border border-[#DDD6CC] text-[#4A6B62] shadow-2xs">
                <Sparkles className="w-3.5 h-3.5" />
                <span>自我介紹 ＋ 自選正式題數 ＋ 結尾反問全流程</span>
              </div>

              <div className="space-y-4 max-w-3xl mx-auto">
                <h1 className="text-3xl sm:text-5xl md:text-6xl font-bold tracking-tight text-[#1E2321] leading-[1.15]">
                  在真正踏入面試前，
                  <br />
                  先與 <span className="text-[#4A6B62] underline decoration-[#4A6B62]/30 underline-offset-8">頂尖 AI 面試官</span> 深度交鋒
                </h1>
                <p className="text-base sm:text-lg text-[#616B65] leading-relaxed max-w-2xl mx-auto">
                  貼上目標職缺網址，上傳 PDF / Word 履歷檔案。由自我介紹破冰開場，接續自行選擇題數進行專業深挖，最後進行候選人反問，會後產出包含自介與反問的完整覆盤診斷。
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={launchSimulator}
                  className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-[#4A6B62] hover:bg-[#3D5952] text-white font-medium text-sm sm:text-base flex items-center justify-center gap-2.5 transition-all shadow-md hover:shadow-lg cursor-pointer"
                >
                  <span>免費開始模擬面試</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-white/80 hover:bg-white border border-[#DDD6CC] text-[#3A423E] font-medium text-sm transition-all shadow-2xs hover:shadow-xs cursor-pointer"
                >
                  探索運作流程
                </button>
              </div>

              <div className="pt-6 flex flex-wrap items-center justify-center gap-6 text-xs text-[#7A827D]">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#4A6B62]" />
                  <span>自我介紹與結尾反問不計題數</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#4A6B62]" />
                  <span>自主彈性選擇正式專業題數</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#4A6B62]" />
                  <span>評分完整納入自介與反問提問表現</span>
                </div>
              </div>

              {/* 產品動態預覽展示卡片 */}
              <div className="pt-6 max-w-4xl mx-auto">
                <div className="relative rounded-2xl bg-white/70 backdrop-blur-md border border-[#E5DFD6] p-4 sm:p-6 shadow-md overflow-hidden text-left space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-[#EDE7DF] text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-[#E5B5A1]" />
                      <div className="w-3 h-3 rounded-full bg-[#F3D59B]" />
                      <div className="w-3 h-3 rounded-full bg-[#B8D7C7]" />
                      <span className="font-semibold text-[#4A6B62] ml-2">完整四段式面試流程</span>
                    </div>
                    <span className="text-[11px] font-medium text-[#4A6B62] bg-[#EFEAE2] px-2.5 py-1 rounded-md">
                      【破冰】自我介紹 ➔ 正式專業深挖 ➔ 【結尾】候選人反問 ➔ 全方位複盤
                    </span>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-[#4A6B62] text-white flex items-center justify-center text-xs flex-shrink-0">
                        <Bot className="w-4 h-4" />
                      </div>
                      <div className="bg-white border border-[#E8E2D8] rounded-2xl p-4 text-xs sm:text-sm text-[#2C302E] shadow-2xs leading-relaxed max-w-2xl">
                        <div className="font-bold text-[11px] text-[#4A6B62] mb-1">AI 招聘主管 · 結尾反問環節</div>
                        今天的專業問答就到這邊！非常感謝你的深入分享。最後的時間交給你，請問你對於我們公司未來的產品規劃、團隊技術棧挑戰，或是這個職位的日常期望，有沒有什麼想問我的問題？
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-[#F4F8F5] border border-[#D5E5DC] flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Award className="w-5 h-5 text-[#4A6B62]" />
                        <div>
                          <div className="text-xs font-bold text-[#204033]">納入自介與反問的全方位複盤診斷</div>
                          <div className="text-[11px] text-[#557567]">不僅給予正式題回饋，更剖析您的反問提問深度，提供高分提問示範話術</div>
                        </div>
                      </div>
                      <button
                        onClick={launchSimulator}
                        className="text-xs font-semibold text-[#4A6B62] hover:text-[#2E4A41] flex items-center gap-1 cursor-pointer"
                      >
                        立即體驗 <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ======================= 核心功能優勢 (Features) ======================= */}
          <section id="features" className="py-20 bg-white/60 border-y border-[#E8E2D8]">
            <div className="max-w-6xl mx-auto px-4 sm:px-6">
              <div className="text-center max-w-xl mx-auto space-y-3 mb-16">
                <span className="text-xs font-bold tracking-widest text-[#4A6B62] uppercase">
                  Product Capabilities
                </span>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1E2321]">
                  真正對標真實外商招聘流程
                </h2>
                <p className="text-sm text-[#6A736E] leading-relaxed">
                  破冰自介、自訂專業題數深挖、結尾候選人反問與解答，三者皆納入評分體系。
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-[#FAF8F5] border border-[#E5DFD6] hover:border-[#4A6B62] rounded-2xl p-6 transition-all hover:shadow-xs space-y-3">
                  <div className="w-10 h-10 rounded-xl bg-[#4A6B62]/10 text-[#4A6B62] flex items-center justify-center">
                    <User className="w-5 h-5" />
                  </div>
                  <h3 className="font-semibold text-base text-[#1E2321]">
                    破冰自介不計題數
                  </h3>
                  <p className="text-xs text-[#6A736E] leading-relaxed">
                    以自我介紹與應徵動機自然破冰，您所選取的正式題數完全留給關鍵專業深挖。
                  </p>
                </div>

                <div className="bg-[#FAF8F5] border border-[#E5DFD6] hover:border-[#4A6B62] rounded-2xl p-6 transition-all hover:shadow-xs space-y-3">
                  <div className="w-10 h-10 rounded-xl bg-[#4A6B62]/10 text-[#4A6B62] flex items-center justify-center">
                    <SlidersHorizontal className="w-5 h-5" />
                  </div>
                  <h3 className="font-semibold text-base text-[#1E2321]">
                    自由自選題數
                  </h3>
                  <p className="text-xs text-[#6A736E] leading-relaxed">
                    不預設題數，由使用者根據練習需求自由點選或輸入 1 ~ 10 題正式專業問答。
                  </p>
                </div>

                <div className="bg-[#FAF8F5] border border-[#E5DFD6] hover:border-[#4A6B62] rounded-2xl p-6 transition-all hover:shadow-xs space-y-3">
                  <div className="w-10 h-10 rounded-xl bg-[#4A6B62]/10 text-[#4A6B62] flex items-center justify-center">
                    <QuestionIcon className="w-5 h-5" />
                  </div>
                  <h3 className="font-semibold text-base text-[#1E2321]">
                    結尾反問與即時解答
                  </h3>
                  <p className="text-xs text-[#6A736E] leading-relaxed">
                    題目結束後，面試官邀請您提問並給予詳細解答，全面檢視您的提問水準與主動性。
                  </p>
                </div>

                <div className="bg-[#FAF8F5] border border-[#E5DFD6] hover:border-[#4A6B62] rounded-2xl p-6 transition-all hover:shadow-xs space-y-3">
                  <div className="w-10 h-10 rounded-xl bg-[#4A6B62]/10 text-[#4A6B62] flex items-center justify-center">
                    <Lightbulb className="w-5 h-5" />
                  </div>
                  <h3 className="font-semibold text-base text-[#1E2321]">
                    自介與反問全納入評分
                  </h3>
                  <p className="text-xs text-[#6A736E] leading-relaxed">
                    覆盤報告完整評核自介亮點、每道正式題 STAR 改善點，以及如何反問得更具殺傷力。
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* ======================= 運作流程 (How It Works) ======================= */}
          <section id="how-it-works" className="py-20">
            <div className="max-w-5xl mx-auto px-4 sm:px-6">
              <div className="text-center max-w-lg mx-auto space-y-3 mb-16">
                <span className="text-xs font-bold tracking-widest text-[#4A6B62] uppercase">
                  Workflow
                </span>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1E2321]">
                  四階段專業面試實戰
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white/70 border border-[#E5DFD6] rounded-2xl p-6 space-y-2.5 shadow-2xs">
                  <div className="text-2xl font-black text-[#4A6B62]/30">01</div>
                  <h3 className="font-bold text-sm text-[#1E2321]">履歷上傳與自選題數</h3>
                  <p className="text-xs text-[#6A736E] leading-relaxed">
                    上傳 PDF / Word 履歷檔案或貼上內容，並自行選擇欲演練的正式題數。
                  </p>
                </div>

                <div className="bg-white/70 border border-[#E5DFD6] rounded-2xl p-6 space-y-2.5 shadow-2xs">
                  <div className="text-2xl font-black text-[#4A6B62]/30">02</div>
                  <h3 className="font-bold text-sm text-[#1E2321]">開場自我介紹</h3>
                  <p className="text-xs text-[#6A736E] leading-relaxed">
                    進行破冰自介與動機陳述，面試官隨即結合自介內容與履歷展開深挖。
                  </p>
                </div>

                <div className="bg-white/70 border border-[#E5DFD6] rounded-2xl p-6 space-y-2.5 shadow-2xs">
                  <div className="text-2xl font-black text-[#4A6B62]/30">03</div>
                  <h3 className="font-bold text-sm text-[#1E2321]">正式專業題 ➔ 結尾反問</h3>
                  <p className="text-xs text-[#6A736E] leading-relaxed">
                    完成自訂題數的正式深挖後，進入反問環節，向面試官提問並獲得深度解答。
                  </p>
                </div>

                <div className="bg-white/70 border border-[#E5DFD6] rounded-2xl p-6 space-y-2.5 shadow-2xs">
                  <div className="text-2xl font-black text-[#4A6B62]/30">04</div>
                  <h3 className="font-bold text-sm text-[#1E2321]">全環節診斷與示範</h3>
                  <p className="text-xs text-[#6A736E] leading-relaxed">
                    產出總評分與覆盤報告，包含自介、各題 STAR 指引與反問提問範例。
                  </p>
                </div>
              </div>

              <div className="mt-12 text-center">
                <button
                  type="button"
                  onClick={launchSimulator}
                  className="px-7 py-3 rounded-xl bg-[#4A6B62] hover:bg-[#3D5952] text-white text-xs sm:text-sm font-medium inline-flex items-center gap-2 transition-all shadow-sm hover:shadow-md cursor-pointer"
                >
                  <span>立即開啟模擬體驗</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </section>

          {/* ======================= 常見問題 (FAQ) ======================= */}
          <section id="faq" className="py-20 bg-white/60 border-t border-[#E8E2D8]">
            <div className="max-w-3xl mx-auto px-4 sm:px-6">
              <div className="text-center space-y-3 mb-14">
                <span className="text-xs font-bold tracking-widest text-[#4A6B62] uppercase">
                  FAQ
                </span>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1E2321]">
                  常見問題解答
                </h2>
              </div>

              <div className="space-y-3">
                {FAQS.map((item, index) => {
                  const isOpen = openFaqIndex === index;
                  return (
                    <div
                      key={index}
                      className="bg-white/80 border border-[#E5DFD6] rounded-2xl overflow-hidden transition-all shadow-2xs"
                    >
                      <button
                        type="button"
                        onClick={() => setOpenFaqIndex(isOpen ? null : index)}
                        className="w-full px-6 py-4.5 text-left flex items-center justify-between gap-4 font-semibold text-sm sm:text-base text-[#1E2321] cursor-pointer"
                      >
                        <span>{item.q}</span>
                        <ChevronDown
                          className={`w-4 h-4 text-[#7A827D] transition-transform duration-200 flex-shrink-0 ${
                            isOpen ? 'rotate-180 text-[#4A6B62]' : ''
                          }`}
                        />
                      </button>
                      {isOpen && (
                        <div className="px-6 pb-5 pt-1 text-xs sm:text-sm text-[#616B65] leading-relaxed border-t border-[#F0EBE3]">
                          {item.a}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* ======================= 底部轉換 Call To Action ======================= */}
          <section className="py-16 bg-[#4A6B62] text-white">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center space-y-6">
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                準備好迎戰下一場面試了嗎？
              </h2>
              <p className="text-white/80 text-sm max-w-xl mx-auto leading-relaxed">
                自選題目數量，從開場自我介紹到結尾反問，演練一場不留遺憾的高水準面試。
              </p>
              <div>
                <button
                  type="button"
                  onClick={launchSimulator}
                  className="px-8 py-3.5 rounded-xl bg-white text-[#4A6B62] hover:bg-[#F8F6F2] font-semibold text-sm transition-all shadow-md hover:shadow-lg cursor-pointer inline-flex items-center gap-2"
                >
                  <span>立即開啟模擬面試</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 視圖 B：模擬面試核心互動應用程式 (Simulator App) */}
      {/* ========================================================================= */}
      {currentView === 'simulator' && (
        <div ref={simulatorRef} className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 md:p-8 flex flex-col animate-in fade-in duration-300">
          {/* 錯誤警示條 */}
          {error && (
            <div className="mb-6 p-4 rounded-xl bg-[#FBF0EE] border border-[#F1D4CD] text-[#A63A2D] text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs animate-in fade-in">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <span className="font-semibold">提示訊息：</span> {error}
                </div>
              </div>
              {phase === 'interview' && history.length > 0 && history[history.length - 1].role === 'candidate' && (
                <button
                  type="button"
                  onClick={handleRetryLastAnswer}
                  disabled={loading}
                  className="self-end sm:self-auto px-3.5 py-1.5 rounded-lg bg-[#A63A2D] hover:bg-[#8F3125] text-white text-xs font-medium flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  點此重試取得面試官回應
                </button>
              )}
            </div>
          )}

          {/* 階段 1：資料準備與設定 */}
          {phase === 'setup' && (
            <div className="flex flex-col gap-8 animate-in fade-in duration-300">
              <div className="text-center max-w-xl mx-auto space-y-3 pt-4">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[#EFEAE2] text-[#4A6B62] border border-[#DFD8CD]">
                  <Sparkles className="w-3.5 h-3.5" />
                  自我介紹 ＋ 自選正式題數 ＋ 結尾反問
                </span>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1E2321]">
                  為您的目標職缺，做足實戰演練
                </h2>
                <p className="text-sm text-[#666F69] leading-relaxed">
                  請貼上職缺資訊並上傳履歷，自行選擇正式題數。系統會以自我介紹破冰開場，接續正式問答，並在結尾邀請您向面試官反問。
                </p>
              </div>

              {/* 快速填入範例 */}
              <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
                <span className="text-[#848C87]">快速體驗示範：</span>
                {SAMPLE_PRESETS.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => loadPreset(preset)}
                    className="px-3 py-1.5 rounded-lg bg-white/80 hover:bg-white border border-[#DFD8CD] hover:border-[#4A6B62] text-[#414844] transition-all shadow-2xs hover:shadow-xs cursor-pointer"
                  >
                    ⚡ {preset.title}
                  </button>
                ))}
              </div>

              {/* 輸入表單卡片 */}
              <div className="bg-white/80 backdrop-blur-sm border border-[#E5DFD6] rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
                {/* 職缺網址 */}
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-[#2C302E] flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-[#4A6B62]" />
                    目標職缺網址或職位名稱
                    <span className="text-xs font-normal text-[#8A918C]">（選填，可直接貼上 104、LinkedIn 或公司職缺）</span>
                  </label>
                  <input
                    type="text"
                    value={jobUrl}
                    onChange={(e) => setJobUrl(e.target.value)}
                    placeholder="例如：https://www.cakeresume.com/companies/... 或 輸入「資深全端工程師」"
                    className="w-full px-4 py-3 rounded-xl bg-[#FAF8F5] border border-[#DDD6CC] focus:border-[#4A6B62] focus:bg-white focus:outline-hidden transition-all text-sm placeholder:text-[#A0A8A2]"
                  />
                </div>

                {/* 正式面試題數設定（完全不預設題數，讓使用者自主選擇） */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <label className="text-sm font-semibold text-[#2C302E] flex items-center gap-2">
                        <SlidersHorizontal className="w-4 h-4 text-[#4A6B62]" />
                        正式面試題數設定
                        <span className="text-xs text-[#C47A53]">*請選擇</span>
                      </label>
                      <p className="text-[11px] text-[#7A827D]">
                        此題數僅計算正式專業題目，開場自我介紹與結尾反問不佔用題數
                      </p>
                    </div>

                    {totalQuestions ? (
                      <span className="text-xs font-semibold text-[#4A6B62] bg-[#EFEAE2] px-3 py-1 rounded-md border border-[#DFD8CD] animate-in fade-in">
                        自我介紹 ＋ 正式 {totalQuestions} 題 ＋ 結尾反問
                      </span>
                    ) : (
                      <span className="text-xs text-[#A63A2D] bg-[#FBF0EE] px-3 py-1 rounded-md border border-[#F1D4CD]">
                        尚未選擇題數
                      </span>
                    )}
                  </div>

                  {/* 1 ~ 10 題一鍵點選按鈕陣列（無預設選取） */}
                  <div className="space-y-2">
                    <div className="text-xs text-[#7A827D] font-medium">點擊選擇正式題數：</div>
                    <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => {
                        const isSelected = totalQuestions === num;
                        return (
                          <button
                            key={num}
                            type="button"
                            onClick={() => {
                              setTotalQuestions(num);
                              setError(null);
                            }}
                            className={`py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                              isSelected
                                ? 'bg-[#4A6B62] text-white shadow-xs scale-102 ring-2 ring-[#4A6B62]/30'
                                : 'bg-[#FAF8F5] border border-[#DDD6CC] text-[#4E5651] hover:border-[#4A6B62] hover:bg-white'
                            }`}
                          >
                            <span>{num} 題</span>
                            <span className="text-[9px] opacity-70 font-normal">
                              {num <= 2 ? '快速' : num <= 4 ? '標準' : num <= 6 ? '深度' : '攻防'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 亦支援輸入框輸入 */}
                  <div className="flex items-center gap-2 pt-1 text-xs text-[#7A827D]">
                    <span>或直接在此輸入題數：</span>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={totalQuestions || ''}
                      placeholder="1 ~ 10"
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val)) {
                          setTotalQuestions(Math.min(Math.max(val, 1), 10));
                          setError(null);
                        } else {
                          setTotalQuestions(null);
                        }
                      }}
                      className="w-20 px-3 py-1.5 text-center text-xs font-bold rounded-lg bg-[#FAF8F5] border border-[#DDD6CC] focus:border-[#4A6B62] focus:bg-white focus:outline-hidden"
                    />
                    <span>題（上限 10 題）</span>
                  </div>
                </div>

                {/* 履歷資料輸入區域 */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-semibold text-[#2C302E] flex items-center gap-2">
                      <FileText className="w-4 h-4 text-[#4A6B62]" />
                      您的履歷資料
                      <span className="text-xs text-[#C47A53]">*必填</span>
                    </label>

                    <div className="flex items-center bg-[#EFEAE2] p-1 rounded-xl text-xs">
                      <button
                        type="button"
                        onClick={() => setResumeMode('upload')}
                        className={`px-3 py-1 rounded-lg font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                          resumeMode === 'upload'
                            ? 'bg-white text-[#4A6B62] shadow-2xs'
                            : 'text-[#666F69] hover:text-[#2C302E]'
                        }`}
                      >
                        <UploadCloud className="w-3.5 h-3.5" />
                        上傳履歷檔案
                      </button>
                      <button
                        type="button"
                        onClick={() => setResumeMode('text')}
                        className={`px-3 py-1 rounded-lg font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                          resumeMode === 'text'
                            ? 'bg-white text-[#4A6B62] shadow-2xs'
                            : 'text-[#666F69] hover:text-[#2C302E]'
                        }`}
                      >
                        <FileText className="w-3.5 h-3.5" />
                        手動貼上 / 填寫
                      </button>
                    </div>
                  </div>

                  {/* 模式 A：上傳檔案 */}
                  {resumeMode === 'upload' && (
                    <div className="space-y-3">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileUpload(file);
                        }}
                        className="hidden"
                      />

                      {!uploadedFile ? (
                        <div
                          onClick={() => fileInputRef.current?.click()}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            const file = e.dataTransfer.files?.[0];
                            if (file) handleFileUpload(file);
                          }}
                          className={`border-2 border-dashed border-[#DDD6CC] hover:border-[#4A6B62] bg-[#FAF8F5] hover:bg-white rounded-2xl p-8 text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-3 ${
                            fileParsing ? 'opacity-60 pointer-events-none' : ''
                          }`}
                        >
                          {fileParsing ? (
                            <div className="flex flex-col items-center gap-2 py-4">
                              <div className="w-8 h-8 border-3 border-[#4A6B62]/20 border-t-[#4A6B62] rounded-full animate-spin" />
                              <span className="text-sm font-semibold text-[#4A6B62]">
                                AI 正在閱讀並萃取履歷檔案內容...
                              </span>
                              <span className="text-xs text-[#7A827D]">
                                請稍候數秒，正在解析檔案文字...
                              </span>
                            </div>
                          ) : (
                            <>
                              <div className="w-12 h-12 rounded-2xl bg-[#EFEAE2] text-[#4A6B62] flex items-center justify-center">
                                <FileUp className="w-6 h-6" />
                              </div>
                              <div className="space-y-1">
                                <div className="text-sm font-semibold text-[#2C302E]">
                                  點擊此處選擇檔案，或直接拖曳檔案至此
                                </div>
                                <div className="text-xs text-[#8A918C]">
                                  支援 PDF、Word (.docx)、TXT、Markdown（單檔上限 20MB）
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      ) : (
                        <div className="bg-[#FAF8F5] border border-[#DDD6CC] rounded-2xl p-4 sm:p-5 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-[#4A6B62]/10 text-[#4A6B62] flex items-center justify-center flex-shrink-0">
                                <FileCheck className="w-5 h-5" />
                              </div>
                              <div>
                                <div className="text-sm font-semibold text-[#1E2321] truncate max-w-xs sm:max-w-md">
                                  {uploadedFile.name}
                                </div>
                                <div className="text-xs text-[#7A827D] flex items-center gap-2 mt-0.5">
                                  <span>{(uploadedFile.size / 1024).toFixed(1)} KB</span>
                                  <span>•</span>
                                  <span className="text-[#3D6B58] font-medium flex items-center gap-1">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-[#3D6B58]" />
                                    上傳成功！AI 已完成內容萃取（共 {resume.length} 字）
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setShowExtractedPreview(!showExtractedPreview)}
                                className="px-3 py-1.5 text-xs text-[#4A6B62] hover:bg-[#EFEAE2] rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                              >
                                {showExtractedPreview ? (
                                  <>
                                    <EyeOff className="w-3.5 h-3.5" />
                                    收合內容
                                  </>
                                ) : (
                                  <>
                                    <Eye className="w-3.5 h-3.5" />
                                    預覽文字
                                  </>
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={handleRemoveFile}
                                className="p-1.5 text-[#A63A2D] hover:bg-[#FBF0EE] rounded-lg transition-colors cursor-pointer"
                                title="移除檔案"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          {showExtractedPreview && (
                            <div className="pt-3 border-t border-[#EDE7DF] space-y-1.5">
                              <div className="flex items-center justify-between text-[11px] font-semibold text-[#7A827D]">
                                <span>由後端 AI 解析之文字內容：</span>
                                <span className="text-[#3D6B58]">可直接用於面試問答</span>
                              </div>
                              <div className="max-h-48 overflow-y-auto p-3 rounded-xl bg-white border border-[#E5DFD6] text-xs text-[#38403C] leading-relaxed whitespace-pre-wrap">
                                {resume}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 模式 B：手動輸入 */}
                  {resumeMode === 'text' && (
                    <div className="space-y-2">
                      <textarea
                        rows={8}
                        value={resume}
                        onChange={(e) => setResume(e.target.value)}
                        placeholder="請貼上您的履歷內容、專案經驗、技能專長或個人簡介...（內容愈具體，面試官的問題愈能精準切入）"
                        className="w-full px-4 py-3 rounded-xl bg-[#FAF8F5] border border-[#DDD6CC] focus:border-[#4A6B62] focus:bg-white focus:outline-hidden transition-all text-sm placeholder:text-[#A0A8A2] leading-relaxed resize-y"
                      />
                      <div className="flex justify-end text-xs text-[#8A918C]">
                        共 {resume.length} 字
                      </div>
                    </div>
                  )}
                </div>

                {/* 開始按鈕 */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleStartInterview}
                    disabled={loading || fileParsing}
                    className="w-full py-3.5 px-6 rounded-xl bg-[#4A6B62] hover:bg-[#3D5952] text-white font-medium text-sm sm:text-base flex items-center justify-center gap-2 transition-all shadow-sm hover:shadow-md disabled:opacity-50 cursor-pointer"
                  >
                    {loading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        面試官正在研讀履歷並準備開場...
                      </>
                    ) : (
                      <>
                        開始模擬面試
                        {totalQuestions ? `（自我介紹 ＋ 正式 ${totalQuestions} 題 ＋ 結尾反問）` : '（請先於上方選擇題數）'}
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 階段 2：面試互動中 */}
          {phase === 'interview' && (
            <div className="flex-1 flex flex-col gap-4 animate-in fade-in duration-300">
              {/* 面試進度橫條 */}
              <div className="bg-white/90 border border-[#E6E0D7] rounded-xl px-4 py-3 flex items-center justify-between shadow-2xs">
                <div className="flex items-center gap-3">
                  {currentStage === 'intro' && (
                    <div className="text-xs font-bold text-[#4A6B62] bg-[#EFEAE2] px-3 py-1 rounded-md flex items-center gap-1.5 border border-[#DFD8CD]">
                      <span className="w-2 h-2 rounded-full bg-[#4A6B62] animate-pulse" />
                      【破冰開場】自我介紹
                    </div>
                  )}

                  {currentStage === 'formal' && (
                    <div className="text-xs font-semibold text-[#4A6B62] bg-[#EFEAE2] px-3 py-1 rounded-md border border-[#DFD8CD]">
                      正式第 {currentFormalQuestion} / {totalQuestions || 3} 題
                    </div>
                  )}

                  {currentStage === 'reverse_question' && (
                    <div className="text-xs font-bold text-[#3B6658] bg-[#E4EFEA] px-3 py-1 rounded-md flex items-center gap-1.5 border border-[#C5DDD2]">
                      <span className="w-2 h-2 rounded-full bg-[#3B6658] animate-pulse" />
                      【結尾反問】換您向面試官提問
                    </div>
                  )}

                  <span className="text-xs text-[#7A827D] hidden sm:inline">
                    {currentStage === 'intro' && '請簡短自我介紹並分享應徵契機（不計入題數）'}
                    {currentStage === 'formal' && currentFormalQuestion === 1 && '正式第 1 題：深度深挖專案與核心技能'}
                    {currentStage === 'formal' && currentFormalQuestion > 1 && currentFormalQuestion < (totalQuestions || 3) && `正式第 ${currentFormalQuestion} 題：技術架構與情境挑戰`}
                    {currentStage === 'formal' && currentFormalQuestion === (totalQuestions || 3) && `正式第 ${currentFormalQuestion} 題：關鍵決策、團隊協作與綜合考察（最後一道正式題）`}
                    {currentStage === 'reverse_question' && '換您提問！可詢問團隊文化、技術棧挑戰或未來期望（不計入題數，將納入評分）'}
                  </span>
                </div>

                <div className="w-36 bg-[#EFEAE2] rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-[#4A6B62] h-full transition-all duration-500 rounded-full"
                    style={{
                      width: currentStage === 'intro'
                        ? '10%'
                        : currentStage === 'reverse_question'
                        ? '100%'
                        : `${Math.min((currentFormalQuestion / (totalQuestions || 1)) * 100, 100)}%`
                    }}
                  />
                </div>
              </div>

              {/* 對話記錄區 */}
              <div className="flex-1 min-h-[380px] max-h-[560px] overflow-y-auto space-y-4 p-2 sm:p-4 rounded-2xl bg-white/50 border border-[#EBE5DC]">
                {history.map((msg, index) => {
                  const isInterviewer = msg.role === 'interviewer';
                  return (
                    <div
                      key={index}
                      className={`flex items-start gap-3 ${
                        isInterviewer ? 'justify-start' : 'justify-end'
                      }`}
                    >
                      {isInterviewer && (
                        <div className="w-8 h-8 rounded-lg bg-[#4A6B62] text-white flex items-center justify-center flex-shrink-0 text-xs shadow-2xs mt-1">
                          <Bot className="w-4 h-4" />
                        </div>
                      )}
                      <div
                        className={`max-w-[85%] sm:max-w-[75%] rounded-2xl p-4 text-sm leading-relaxed ${
                          isInterviewer
                            ? 'bg-white border border-[#E5DFD6] text-[#2C302E] shadow-2xs'
                            : 'bg-[#4A6B62] text-white shadow-xs'
                        }`}
                      >
                        <div className="text-[11px] font-semibold opacity-70 mb-1 flex items-center gap-1.5">
                          {isInterviewer ? 'AI 面試官' : '我的發言'}
                        </div>
                        <div className="whitespace-pre-wrap">{msg.content}</div>
                      </div>
                      {!isInterviewer && (
                        <div className="w-8 h-8 rounded-lg bg-[#687D74] text-white flex items-center justify-center flex-shrink-0 text-xs shadow-2xs mt-1">
                          <User className="w-4 h-4" />
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* 思考中動態特效 */}
                {loading && (
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#4A6B62] text-white flex items-center justify-center flex-shrink-0 text-xs shadow-2xs mt-1">
                      <Bot className="w-4 h-4" />
                    </div>
                    <div className="bg-white border border-[#E5DFD6] rounded-2xl p-4 text-sm shadow-2xs flex items-center gap-2 text-[#7A827D]">
                      <div className="flex gap-1.5 items-center">
                        <span className="w-2 h-2 rounded-full bg-[#4A6B62] animate-bounce" />
                        <span className="w-2 h-2 rounded-full bg-[#4A6B62] animate-bounce [animation-delay:0.2s]" />
                        <span className="w-2 h-2 rounded-full bg-[#4A6B62] animate-bounce [animation-delay:0.4s]" />
                      </div>
                      <span className="text-xs ml-1">
                        {currentStage === 'intro'
                          ? '面試官正在聆聽您的自我介紹，並準備切入正式第 1 題...'
                          : currentStage === 'reverse_question'
                          ? '面試官正在回答您的反問，並統整全場診斷報告...'
                          : '面試官正在評估並構思下一題...'}
                      </span>
                    </div>
                  </div>
                )}

                {/* 發生錯誤時的重試按鈕 */}
                {error && !loading && history.length > 0 && history[history.length - 1].role === 'candidate' && (
                  <div className="flex justify-center py-2 animate-in fade-in">
                    <button
                      type="button"
                      onClick={handleRetryLastAnswer}
                      className="px-4 py-2 rounded-xl bg-[#A63A2D] hover:bg-[#8F3125] text-white text-xs font-semibold flex items-center gap-2 shadow-sm transition-all cursor-pointer"
                    >
                      <RefreshCw className="w-4 h-4" />
                      剛剛連線逾時，點此重新取得面試官回應
                    </button>
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>

              {/* 回答輸入面板 */}
              <div className="bg-white border border-[#E6E0D7] rounded-2xl p-3 sm:p-4 shadow-sm space-y-2">
                <div className="flex items-center justify-between text-xs text-[#848C87] px-1">
                  <span className="flex items-center gap-1">
                    {currentStage === 'intro' && (
                      <>
                        💡 <span className="font-semibold text-[#4A6B62]">破冰提示</span>：簡明扼要點出您的核心專業背景與應徵該職位的強烈動機
                      </>
                    )}
                    {currentStage === 'formal' && (
                      <>
                        💡 建議掌握 <span className="font-semibold text-[#4A6B62]">STAR 原則</span>（情境、任務、行動、成果）
                      </>
                    )}
                    {currentStage === 'reverse_question' && (
                      <>
                        💡 <span className="font-semibold text-[#3B6658]">反問提示</span>：可詢問團隊目前的技術痛點、前 3 個月的期待目標或公司文化，展現主動性（此題將納入評分）
                      </>
                    )}
                  </span>
                  <span>{candidateInput.length} 字</span>
                </div>
                <div className="flex gap-2">
                  <textarea
                    ref={textareaRef}
                    rows={3}
                    value={candidateInput}
                    onChange={(e) => setCandidateInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        handleSubmitAnswer();
                      }
                    }}
                    disabled={loading}
                    placeholder={
                      currentStage === 'intro'
                        ? '請在此輸入您的自我介紹與應徵動機... (快捷鍵: Ctrl/Cmd + Enter 送出)'
                        : currentStage === 'reverse_question'
                        ? '請在此輸入您想問面試官的問題... (若無問題可輸入「目前沒有問題」，快捷鍵: Ctrl/Cmd + Enter 送出)'
                        : '請在此輸入您的回答... (快捷鍵: Ctrl/Cmd + Enter 送出)'
                    }
                    className="flex-1 px-3 py-2.5 rounded-xl bg-[#FAF8F5] border border-[#DDD6CC] focus:border-[#4A6B62] focus:bg-white focus:outline-hidden text-sm placeholder:text-[#A0A8A2] resize-none leading-relaxed"
                  />
                  <button
                    type="button"
                    onClick={handleSubmitAnswer}
                    disabled={loading || !candidateInput.trim()}
                    className="px-5 rounded-xl bg-[#4A6B62] hover:bg-[#3D5952] text-white flex flex-col items-center justify-center gap-1 transition-all shadow-2xs disabled:opacity-40 cursor-pointer min-w-[76px]"
                  >
                    <Send className="w-4 h-4" />
                    <span className="text-xs font-medium">送出</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 階段 3：評分與逐題複盤報告 */}
          {phase === 'report' && assessment && (
            <div className="space-y-6 animate-in fade-in duration-400">
              {/* 報告首頁橫幅 */}
              <div className="bg-gradient-to-br from-[#4A6B62] to-[#364F48] text-white rounded-3xl p-6 sm:p-8 shadow-md relative overflow-hidden">
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div>
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-white/15 text-white/90 mb-3 backdrop-blur-xs">
                      <Award className="w-3.5 h-3.5" />
                      全流程面試完成 · 自我介紹 ＋ {totalQuestions || 3} 道正式題 ＋ 結尾反問診斷書
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                      面試表現綜合評估
                    </h2>
                    <p className="text-white/80 text-sm mt-1 max-w-lg leading-relaxed">
                      已完整評估您在開場自我介紹、{totalQuestions || 3} 道正式專業問答，以及結尾反問的提問深度與思維格局。
                    </p>
                  </div>

                  <div className="flex items-center gap-4 bg-white/10 backdrop-blur-md px-6 py-4 rounded-2xl border border-white/20 self-start md:self-auto">
                    <div className="text-center">
                      <div className="text-4xl sm:text-5xl font-black tracking-tight text-white">
                        {assessment.totalScore}
                      </div>
                      <div className="text-[11px] font-medium text-white/70 tracking-widest uppercase mt-0.5">
                        總評得分 / 100
                      </div>
                    </div>
                    <div className="text-xs text-white/80 border-l border-white/20 pl-4 py-1 leading-relaxed">
                      {assessment.totalScore >= 85 ? (
                        <span className="font-semibold text-[#B9F5D8]">優異表現，極具競爭力（推薦錄取）</span>
                      ) : assessment.totalScore >= 70 ? (
                        <span className="font-semibold text-[#FBE4A0]">良好基礎，具備競爭潛力（可考慮錄取）</span>
                      ) : assessment.totalScore >= 50 ? (
                        <span className="font-semibold text-[#FFC4BA]">未達門檻，內容空泛缺乏說服力（暫不錄取）</span>
                      ) : (
                        <span className="font-semibold text-[#FF9B8A] bg-black/20 px-2 py-0.5 rounded">嚴重不及格，作答過簡敷衍（強烈淘汰）</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* 分項維度指標 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {assessment.dimensions.map((dim, idx) => {
                  const isFail = dim.score < 50;
                  const isWarning = dim.score < 70;
                  return (
                    <div
                      key={idx}
                      className="bg-white/80 border border-[#E6E0D7] rounded-2xl p-5 shadow-2xs space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-sm text-[#2C302E]">
                          {dim.name}
                        </h3>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${
                          isFail
                            ? 'bg-[#FBF0EE] text-[#A63A2D] border-[#F1D4CD]'
                            : isWarning
                            ? 'bg-[#FEF7EC] text-[#B45309] border-[#FDE68A]'
                            : 'bg-[#EFEAE2] text-[#4A6B62] border-[#DFD8CD]'
                        }`}>
                          {dim.score} 分
                        </span>
                      </div>
                      <div className="w-full bg-[#EFEAE2] rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${
                            isFail
                              ? 'bg-[#A63A2D]'
                              : isWarning
                              ? 'bg-[#C47A53]'
                              : 'bg-[#4A6B62]'
                          }`}
                          style={{ width: `${Math.min(dim.score, 100)}%` }}
                        />
                      </div>
                      <p className="text-xs text-[#666F69] leading-relaxed">
                        {dim.comment}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* 優勢與改進建議兩欄卡片 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white/80 border border-[#E6E0D7] rounded-2xl p-6 shadow-2xs space-y-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#3D6B58]">
                    <CheckCircle2 className="w-4 h-4 text-[#4A6B62]" />
                    展現的優勢亮點 (Strengths)
                  </div>
                  <ul className="space-y-2.5">
                    {assessment.strengths.map((str, idx) => (
                      <li key={idx} className="flex items-start gap-2.5 text-xs sm:text-sm text-[#38403C] leading-relaxed">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#4A6B62] mt-2 flex-shrink-0" />
                        <span>{str}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="bg-white/80 border border-[#E6E0D7] rounded-2xl p-6 shadow-2xs space-y-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#B35F36]">
                    <TrendingUp className="w-4 h-4 text-[#C47A53]" />
                    建議加強與避坑方向 (Actionable Advice)
                  </div>
                  <ul className="space-y-2.5">
                    {assessment.improvements.map((imp, idx) => (
                      <li key={idx} className="flex items-start gap-2.5 text-xs sm:text-sm text-[#38403C] leading-relaxed">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#C47A53] mt-2 flex-shrink-0" />
                        <span>{imp}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* 逐題回顧與更佳回答示範區塊（包含自介、正式題與反問） */}
              {assessment.questionReviews && assessment.questionReviews.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 px-1">
                    <HelpCircle className="w-5 h-5 text-[#4A6B62]" />
                    <h3 className="font-bold text-base sm:text-lg text-[#1E2321]">
                      全流程答辯深度覆盤與高分示範
                    </h3>
                    <span className="text-xs text-[#7A827D] ml-auto">
                      完整包含自我介紹 ＋ {totalQuestions || 3} 道正式題 ＋ 結尾反問
                    </span>
                  </div>

                  <div className="space-y-4">
                    {assessment.questionReviews.map((rev, index) => {
                      const isIntro = rev.questionNumber === 0 || rev.stageName?.includes('自我介紹');
                      const isReverse = rev.stageName?.includes('反問') || rev.questionNumber > (totalQuestions || 3);
                      return (
                        <div
                          key={index}
                          className="bg-white/90 border border-[#E6E0D7] rounded-2xl p-5 sm:p-6 shadow-2xs space-y-4 transition-all"
                        >
                          <div className="flex items-start justify-between gap-4 pb-3 border-b border-[#F0EBE3]">
                            <div className="space-y-1">
                              <span className={`inline-block px-2.5 py-0.5 rounded-md text-[11px] font-bold ${
                                isIntro
                                  ? 'bg-[#EAE4D9] text-[#78644A]'
                                  : isReverse
                                  ? 'bg-[#E4EFEA] text-[#2C624E]'
                                  : 'bg-[#EFEAE2] text-[#4A6B62]'
                              }`}>
                                {rev.stageName || (isIntro ? '【破冰開場】自我介紹與動機' : isReverse ? '【結尾反問】候選人向面試官提問' : `正式第 ${rev.questionNumber} 題`)}
                              </span>
                              <h4 className="font-semibold text-sm sm:text-base text-[#1E2321] leading-snug">
                                {rev.question}
                              </h4>
                            </div>
                            <div className="flex-shrink-0 text-right">
                              <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold border ${
                                rev.score < 45
                                  ? 'bg-[#FBF0EE] text-[#A63A2D] border-[#F1D4CD]'
                                  : rev.score < 70
                                  ? 'bg-[#FEF7EC] text-[#B45309] border-[#FDE68A]'
                                  : 'bg-[#EAF5EF] text-[#2D6A4F] border-[#C8E6D3]'
                              }`}>
                                <span>{rev.score} 分</span>
                                <span className="text-[10px] opacity-80 font-normal">
                                  {rev.score < 45 ? '· 嚴重過簡' : rev.score < 70 ? '· 待加強' : '· 良好'}
                                </span>
                              </span>
                            </div>
                          </div>

                          <div className="bg-[#FAF8F5] rounded-xl p-3.5 border border-[#EDE7DF] space-y-1 text-xs sm:text-sm">
                            <div className="font-medium text-[#7A827D] text-[11px] flex items-center gap-1.5">
                              <User className="w-3.5 h-3.5 text-[#687D74]" />
                              {isReverse ? '您向面試官提出的反問：' : '您的作答要點回顧：'}
                            </div>
                            <p className="text-[#38403C] leading-relaxed">
                              {rev.candidateAnswer}
                            </p>
                          </div>

                          <div className="space-y-1 text-xs sm:text-sm">
                            <div className="font-medium text-[#7A827D] text-[11px] flex items-center gap-1.5">
                              <Bot className="w-4 h-4 text-[#4A6B62]" />
                              {isReverse ? '面試官針對提問品質的評析：' : '本題作答點評：'}
                            </div>
                            <p className="text-[#38403C] leading-relaxed">
                              {rev.feedback}
                            </p>
                          </div>

                          <div className="bg-[#F2F7F4] border border-[#D5E5DC] rounded-xl p-4 space-y-2">
                            <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-[#2D5A4A]">
                              <Lightbulb className="w-4 h-4 text-[#4A6B62]" />
                              {isReverse ? '💡 建議可以如何反問（給予公司深刻印象的高分提問範例）：' : '💡 可以怎麼樣回答得更好（高分示範與架構建議）：'}
                            </div>
                            <div className="text-xs sm:text-sm text-[#244337] leading-relaxed whitespace-pre-wrap">
                              {rev.betterAnswer}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 總結評語 */}
              <div className="bg-white/80 border border-[#E6E0D7] rounded-2xl p-6 shadow-2xs space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-[#7A827D] flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-[#4A6B62]" />
                  面試官總評語 (Overall Summary)
                </div>
                <p className="text-sm text-[#2C302E] leading-relaxed">
                  {assessment.overallSummary}
                </p>
              </div>

              {/* 底部操作按鈕 */}
              <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleCopyReport}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-[#D5CDC2] bg-white hover:bg-[#FAF8F5] text-xs sm:text-sm font-medium text-[#414844] flex items-center justify-center gap-2 transition-all cursor-pointer shadow-2xs"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 text-[#4A6B62]" />
                      已複製完整複盤報告
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      複製完整複盤診斷書
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-[#4A6B62] hover:bg-[#3D5952] text-white text-xs sm:text-sm font-medium flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  進行下一輪模擬面試
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================= 全站統一 SaaS Footer ======================= */}
      <footer className="mt-auto bg-[#EDE8E1] border-t border-[#DFD8CD] py-12 text-[#616B65] text-xs">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div className="space-y-3 md:col-span-1">
              <div className="flex items-center gap-2 font-bold text-sm text-[#1E2321]">
                <div className="w-6 h-6 rounded-lg bg-[#4A6B62] text-white flex items-center justify-center text-xs">
                  <Bot className="w-3.5 h-3.5" />
                </div>
                <span>InterviewCraft</span>
              </div>
              <p className="leading-relaxed text-[#7A827D]">
                專為科技與各領域專業人才打造的頂尖 AI 面試模擬器。實戰深挖、智能診斷，助您拿下理想 Offer。
              </p>
            </div>

            <div className="space-y-2">
              <div className="font-semibold text-[#1E2321]">產品功能</div>
              <ul className="space-y-1.5 text-[#6E7872]">
                <li><button onClick={() => { setCurrentView('landing'); setTimeout(() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' }), 50); }} className="hover:text-[#1E2321] transition-colors cursor-pointer">核心優勢</button></li>
                <li><button onClick={() => { setCurrentView('landing'); setTimeout(() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' }), 50); }} className="hover:text-[#1E2321] transition-colors cursor-pointer">使用流程</button></li>
                <li><button onClick={launchSimulator} className="hover:text-[#1E2321] transition-colors cursor-pointer">模擬演練室</button></li>
              </ul>
            </div>

            <div className="space-y-2">
              <div className="font-semibold text-[#1E2321]">支援技術</div>
              <ul className="space-y-1.5 text-[#6E7872]">
                <li>Google Gemini 3.5 次世代模型</li>
                <li>多模態 PDF / DOCX 智慧解析</li>
                <li>STAR 原則深度演算法</li>
              </ul>
            </div>

            <div className="space-y-2">
              <div className="font-semibold text-[#1E2321]">隱私與規範</div>
              <p className="text-[#7A827D] leading-relaxed">
                所有上傳履歷與問答對話僅於當次模擬中即時使用，不作任何永久數據保存，保障求職隱私。
              </p>
            </div>
          </div>

          <div className="pt-6 border-t border-[#DFD8CD] flex flex-col sm:flex-row items-center justify-between gap-4 text-[#8A918C]">
            <div>© {new Date().getFullYear()} InterviewCraft. All rights reserved.</div>
            <div className="flex items-center gap-4">
              <span>Made with Google DeepMind Gemini & Next.js</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
