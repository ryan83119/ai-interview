import { NextResponse } from 'next/server';
import { parseJobUrl } from '../parse-job/route';

// Polyfill DOMMatrix for Node.js environment if needed by PDF.js
if (typeof globalThis.DOMMatrix === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).DOMMatrix = class DOMMatrix {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    m11 = 1; m12 = 0; m13 = 0; m14 = 0;
    m21 = 0; m22 = 1; m23 = 0; m24 = 0;
    m31 = 0; m32 = 0; m33 = 1; m34 = 0;
    m41 = 0; m42 = 0; m43 = 0; m44 = 1;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(init?: any) {
      if (Array.isArray(init) && init.length === 6) {
        this.a = this.m11 = init[0];
        this.b = this.m12 = init[1];
        this.c = this.m21 = init[2];
        this.d = this.m22 = init[3];
        this.e = this.m41 = init[4];
        this.f = this.m42 = init[5];
      }
    }
    multiply() { return this; }
    translate() { return this; }
    scale() { return this; }
    rotate() { return this; }
    inverse() { return this; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transformPoint(p?: any) { return p || { x: 0, y: 0 }; }
  };
}

interface Message {
  role: 'interviewer' | 'candidate';
  content: string;
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

async function extractTextFromFile(file: File): Promise<string> {
  const fileName = file.name.toLowerCase();
  const arrayBuffer = await file.arrayBuffer();

  if (fileName.endsWith('.pdf')) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { extractText } = require('unpdf');
      const res = await extractText(new Uint8Array(arrayBuffer));
      if (res && res.text) {
        return Array.isArray(res.text) ? res.text.join('\n\n') : String(res.text);
      }
    } catch (unpdfErr) {
      console.warn('unpdf extractText error:', unpdfErr);
    }
    return '';
  } else if (fileName.endsWith('.docx')) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ buffer: Buffer.from(arrayBuffer) });
    return result.value || '';
  } else if (fileName.endsWith('.txt') || fileName.endsWith('.md')) {
    return Buffer.from(arrayBuffer).toString('utf-8');
  } else {
    throw new Error('不支援的檔案格式，請上傳 PDF、DOCX、TXT 或 MD 檔案。');
  }
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: '找不到 GEMINI_API_KEY，請確認 .env.local 已正確設定。' },
        { status: 500 }
      );
    }

    let jobUrl = '';
    let companyName = '';
    let jobTitle = '';
    let jobDescription = '';
    let resume = '';
    let history: Message[] = [];
    let totalQuestions = 3;

    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      jobUrl = (formData.get('jobUrl') as string) || '';
      companyName = (formData.get('companyName') as string) || '';
      jobTitle = (formData.get('jobTitle') as string) || '';
      jobDescription = (formData.get('jobDescription') as string) || '';
      resume = (formData.get('resume') as string) || '';
      const totalQStr = formData.get('totalQuestions') as string;
      if (totalQStr) totalQuestions = Number(totalQStr) || 3;

      const historyStr = formData.get('history') as string;
      if (historyStr) {
        try {
          history = JSON.parse(historyStr);
        } catch {
          history = [];
        }
      }

      const resumeFile = formData.get('resumeFile') as File | null;
      if (resumeFile && resumeFile.size > 0) {
        const fileText = await extractTextFromFile(resumeFile);
        if (fileText.trim()) {
          resume = fileText.trim();
        }
      }
    } else {
      const body = await req.json();
      jobUrl = body.jobUrl || '';
      companyName = body.companyName || '';
      jobTitle = body.jobTitle || '';
      jobDescription = body.jobDescription || '';
      resume = body.resume || '';
      history = body.history || [];
      totalQuestions = Number(body.totalQuestions) || 3;
    }

    // 若使用者輸入了網址，且未填寫詳細內容，自動由後端解析（支援 104、CakeResume 等）
    if (jobUrl && (jobUrl.startsWith('http://') || jobUrl.startsWith('https://')) && !jobDescription) {
      try {
        const parsed = await parseJobUrl(jobUrl);
        if (parsed) {
          if (!companyName && parsed.company) companyName = parsed.company;
          if (!jobTitle && parsed.title) jobTitle = parsed.title;
          if (parsed.description) jobDescription = parsed.description;
        }
      } catch (err) {
        console.warn('Backend auto parseJobUrl error:', err);
      }
    }

    // 整合職缺資訊摘要
    const targetJobSummary = [
      companyName ? `【目標應徵公司】：${companyName}` : '',
      jobTitle ? `【目標應徵職缺】：${jobTitle}` : '',
      jobDescription ? `【職缺工作內容與技能要求 (JD)】：\n${jobDescription}` : '',
      jobUrl && !jobDescription ? `【職缺來源資訊/網址】：${jobUrl}` : ''
    ].filter(Boolean).join('\n\n') || (jobUrl ? `【目標職缺資訊】：${jobUrl}` : '【目標職缺】：標準專業職務考核');

    // 限制正式題數範圍在 1 ~ 10 題
    totalQuestions = Math.min(Math.max(totalQuestions, 1), 10);

    // 計算目前候選人已回答的次數
    const candidateAnswers = history.filter((m) => m.role === 'candidate');
    const answerCount = candidateAnswers.length;

    const systemInstruction = `
你是一位具備十餘年頂尖跨國企業招聘經驗、標準極度嚴苛的資深技術面試官。
請根據【目標應徵職缺資訊】及【候選人履歷】，進行極具實戰檢驗度、嚴謹且犀利的專業模擬面試。

【面試官身分與公司歸屬鐵律（絕對嚴禁混淆！）】：
1. 面試官代表的公司：面試官「必須且只能」代表【目標應徵公司】（例如若資訊中有「Google」或「台積電」，面試官即代表該目標企業的資深考官！）。
2. 前東家界線：候選人履歷中所記載的公司（如候選人過去曾任職的「聯華食品」、「源友企業」）是候選人的【過往工作經歷 / 前東家】！
3. 【嚴禁指鹿為馬】：絕對【嚴禁】把候選人以前任職的公司當作本次面試的招聘企業！面試官絕不可自稱「我是聯華食品的面試官」！
4. 若目標職缺資訊未載明公司名稱，面試官請自稱為「目標職位招聘團隊的面試官」，任何情況下都絕不得從候選人履歷中抓舊公司來充數！

【面試官專業態度與互動原則】：
1. 嚴肅把關：在真實專業面試中，候選人若作答極短（如僅一句話）、敷衍或僅憑直覺直觀回答（例如「薪水高」、「我想學技術」、「我會配合主管」），面試官必須在回應中直白指正其作答過於簡略、缺乏專業深度與準備，並要求後續回答必須提供具體脈絡與案例。
2. 循序漸進：
   - 階段 0：破冰開場與自我介紹（不計入題數）。
   - 階段 1 至 ${totalQuestions}：結合履歷與自介深入深挖核心技能與專案挑戰（計入 ${totalQuestions} 道正式題目）。
   - 階段 ${totalQuestions} + 1：邀請候選人結尾反問（不計入題數）。
   - 階段 總結：先專業回答候選人反問，並輸出【極嚴格的全方位評審與逐題複盤報告】。

【輸出規定】：
每次回應必須為標準合法 JSON 格式，不得輸出任何額外 Markdown 標籤或字元以外的內容。
`;

    let userPrompt = '';

    if (answerCount === 0) {
      // 階段 1：破冰開場自我介紹（不計題數）
      userPrompt = `
【目標應徵職缺資訊】：
${targetJobSummary}

【候選人履歷】：
${resume || '無提供履歷，請進行標準職務面試'}

這是面試的最初開場。本階段為【破冰開場與自我介紹】（請注意：此開場不計入使用者選擇的 ${totalQuestions} 道正式專業題數）。
請以【目標應徵公司】的面試官身分向候選人親切問候，簡述今日面試的職位，並邀請候選人進行簡要的自我介紹，同時分享是什麼契機或職涯規劃促使他決定應徵我們公司的這個職位。

請務必嚴格以如下 JSON 格式回應（不加 \`\`\`json 標籤）：
{
  "type": "question",
  "stage": "intro",
  "formalQuestionNumber": 0,
  "totalQuestions": ${totalQuestions},
  "content": "面試官的開場致詞與邀請自我介紹的問題",
  "isFinished": false
}
`;
    } else if (answerCount <= totalQuestions) {
      // 階段 2：正式專業深挖出題（正式第 1 題到第 totalQuestions 題）
      const formalQNum = answerCount;
      const isLastFormalQuestion = formalQNum === totalQuestions;

      if (formalQNum === 1) {
        userPrompt = `
【目標應徵職缺資訊】：
${targetJobSummary}
【候選人履歷】：${resume}
【整場面試正式題數】：共 ${totalQuestions} 題
【目前進度】：候選人剛完成【自我介紹】。現在正式進入【正式面試題目第 1 題】（共 ${totalQuestions} 題）。
【面試歷史歷程】：
${JSON.stringify(history, null, 2)}

候選人剛完成了自我介紹與動機陳述。請你先給予專業犀利的點評：
- 若候選人的自我介紹僅有一句話、極度簡短或敷衍（例如只說「薪水高」、「我想學技術」等），面試官必須在回應開頭嚴肅指出：「在正式面試中，如此簡短且缺乏細節的回答是非常不恰當的，完全無法展現你的專業背景與職涯動機。」並嚴正提醒其在接下來的正式題目中展現具體實務細節。
- 接續結合【候選人履歷】與【自我介紹】，順暢提出【正式第 1 題】（共 ${totalQuestions} 題），針對其關鍵技術、專案經歷或核心能力深入深挖。

請務必嚴格以如下 JSON 格式回應（不加 \`\`\`json 標籤）：
{
  "type": "question",
  "stage": "formal",
  "formalQuestionNumber": 1,
  "totalQuestions": ${totalQuestions},
  "content": "面試官對自我介紹的犀利點評與正式第 1 個深入問題",
  "isFinished": false
}
`;
      } else {
        userPrompt = `
【目標應徵職缺資訊】：
${targetJobSummary}
【候選人履歷】：${resume}
【整場面試正式題數】：共 ${totalQuestions} 題
【目前進度】：候選人已回答至正式第 ${formalQNum - 1} 題。現在準備提出【正式第 ${formalQNum} 題】（共 ${totalQuestions} 題）${isLastFormalQuestion ? '（這是最後一道正式問題）' : ''}。
【面試歷史歷程】：
${JSON.stringify(history, null, 2)}

候選人剛回答了正式第 ${formalQNum - 1} 題。請給予真實、具業界水準的專業點評：
- 若上一題候選人回答非常膚淺短小（如僅一句話、字數極少、缺乏情境與成果），面試官必須嚴肅指責該回答缺乏誠意與專業深度，並督促候選人提供具體行動與技術脈絡。
- 順暢過渡提出【正式第 ${formalQNum} 題】。
${
  isLastFormalQuestion
    ? '因為這是最後一道正式問題，請著重於高壓挑戰、關鍵架構決策、跨部門衝突協作或核心價值觀。'
    : '請深挖上一題回答的技術細節、除錯脈絡或提出進階的實戰情境挑戰。'
}

請務必嚴格以如下 JSON 格式回應（不加 \`\`\`json 標籤）：
{
  "type": "question",
  "stage": "formal",
  "formalQuestionNumber": ${formalQNum},
  "totalQuestions": ${totalQuestions},
  "content": "面試官的簡評與正式第 ${formalQNum} 個問題",
  "isFinished": false
}
`;
      }
    } else if (answerCount === totalQuestions + 1) {
      // 階段 3：所有正式題目回答完畢 -> 面試官提問【候選人反問環節】（不計入題數）
      userPrompt = `
【目標應徵職缺資訊】：
${targetJobSummary}
【候選人履歷】：${resume}
【整場面試正式題數】：共 ${totalQuestions} 題（已全數回答完畢）
【面試歷史歷程】：
${JSON.stringify(history, null, 2)}

候選人已完成了最後一道正式問題！
現在進入關鍵的【候選人反問環節】（不計入題數）。
請面試官針對最後一題的作答給予總結評述，接著正式告知「今天的專業面試問題到此告一段落」，並正式詢問候選人：「接下來把時間交給你，請問你對於我們公司、團隊、這個職位的日常挑戰或未來的發展，有沒有什麼想問我的問題？」

請務必嚴格以如下 JSON 格式回應（不加 \`\`\`json 標籤）：
{
  "type": "question",
  "stage": "reverse_question",
  "formalQuestionNumber": ${totalQuestions + 1},
  "totalQuestions": ${totalQuestions},
  "content": "面試官對上一題簡評，並邀請候選人提出反問的問題",
  "isFinished": false
}
`;
    } else {
      // 階段 4：候選人已提出反問 -> 面試官在 content 中親切回答，並輸出【總體評分與全方位複盤報告】
      userPrompt = `
【目標應徵職缺資訊】：
${targetJobSummary}
【候選人履歷】：${resume}
【面試歷史歷程（包含 1 次自我介紹 + ${totalQuestions} 道正式問答 + 1 次候選人反問）】：
${JSON.stringify(history, null, 2)}

候選人剛才向面試官提出了他的反問問題（或表示目前沒有問題）。
整場面試正式結束！現在請面試官執行兩項核心任務：
1. 在 content 欄位中，先以資深面試官的身分，專業且具體地【回答候選人提出的問題】（若候選人詢問公司文化、團隊挑戰或期望，請給出誠懇且有深度的業界解答；若候選人說沒問題或僅隨意敷衍反問，則給予簡要結尾）。
2. 在 assessment 欄位中產出整場面試的綜合評核與全方位逐題複盤報告。

========================================================================
【極度嚴格的面試評分標準規章（最高指導原則，嚴禁濫發及格分或同情分！）】
在真實企業高階面試中，專業深度、STAR 結構（情境、任務、行動、成果）與具體細節是錄取的唯一標準。請嚴格執行以下評分尺度：

【單題評分標準 (0 ~ 100 分)】：
- 0 ~ 35 分（嚴重不及格 / 極度不恰當）：
  * 候選人回答僅有一句話、敷衍短句、直觀直覺反應（例如「薪水高」、「我想學東西」、「我會認真做」、「有加班費就好」）。
  * 內容極短（小於 35 字），完全缺乏專案細節、無任何情境背景、無具體行動與技術、無量化成果。
  * 【強制懲罰鐵律】：凡是僅有一兩句或字數極短（<40字）的敷衍回答，該題評分「絕對必須」落在 10 ~ 35 分之間，絕對不可超過 40 分！
- 36 ~ 55 分（未達及格標準 / 粗淺空泛）：
  * 雖有嘗試回答但流於表面抽象，缺少具體案例佐證或技術深度，答非所問或無法說明個人關鍵貢獻。
  * 反問問題毫無專業度或企圖心（如僅問「請問公司有下午茶嗎」、「會常加班嗎」）。
- 56 ~ 74 分（基本及格 / 普通尚可）：
  * 能大致回答問題核心，有基礎說明，但在技術細節、STAR 結構完整度或商業思維上缺乏亮點。
- 75 ~ 89 分（良好 / 具競爭力）：
  * 完整符合 STAR 原則，有具體情境、行動步驟與明確成果，展現出扎實的專業素養與問題解決能力。
- 90 ~ 100 分（卓越 / 頂尖候選人）：
  * 邏輯清晰縝密、量化指標突出、具宏觀商業或技術架構視野，能預判風險並提出創新解法，反問極具戰略格局。

【總分與各維度計算鐵律 (totalScore & dimensions)】：
- totalScore 必須嚴格反映各題真實得分之加權平均，【嚴禁給予保底及格分（不可無條件給 60+）】！
- 若候選人通篇皆只回答一句話或膚淺敷衍回答，整場面試的 totalScore 必須落在 15 ~ 38 分之間，判定為【嚴重不及格 / 不予錄取】！
- 三大維度（職務契合度、專業與邏輯思考、溝通表達與主動性）的得分必須如實給出極低分（如 15~35 分），並在 comment 中痛切指責其回答缺乏內容。
- overallSummary 面試官總評必須直擊痛點：「本次面試回答極度過簡、僅有單薄直觀的一句話，完全無法佐證履歷中的經驗與技能，在真實面試中將在第一輪即刻遭到淘汰。」
- 逐題 review 的 feedback 請一針見血地點出缺陷，並在 betterAnswer 中提供完整長篇 STAR 高分範本，清楚示範業界高水準作答。
========================================================================

請務必嚴格以如下 JSON 格式回應（不加 \`\`\`json 標籤）：
{
  "type": "feedback",
  "stage": "completed",
  "totalQuestions": ${totalQuestions},
  "isFinished": true,
  "content": "面試官針對候選人反問問題的詳細專業回答，並向候選人致謝的溫暖結語",
  "assessment": {
    "totalScore": 28,
    "dimensions": [
      { "name": "職務契合度", "score": 25, "comment": "回答過於短淺，完全無法對照職缺所需技能與專案要求。" },
      { "name": "專業與邏輯思考", "score": 20, "comment": "缺乏具體專案脈絡與 STAR 結構，未展現出工程思維。" },
      { "name": "溝通表達與主動性", "score": 30, "comment": "回答過於草率簡短，態度顯得被動且缺乏面試準備。" }
    ],
    "strengths": [
      "有基本應答意願，但亟需在內容深度上加強"
    ],
    "improvements": [
      "嚴禁單句回答：面試中每題回答應至少包含具體情境、行動與可量化成果（建議回答 150-300 字）",
      "務必運用 STAR 架構展開實戰專案細節，而非僅憑個人直覺發言"
    ],
    "overallSummary": "面試官對整場面試的真實嚴格總評（若回答敷衍請直言淘汰）",
    "questionReviews": [
      {
        "stageName": "【破冰開場】自我介紹與應徵動機",
        "questionNumber": 0,
        "question": "開場自我介紹題目內容",
        "candidateAnswer": "候選人自我介紹作答",
        "score": 20,
        "feedback": "自我介紹過於簡略，僅有單句，未提及其核心優勢與契機。",
        "betterAnswer": "建議如何自我介紹能更吸睛、更有條理的完整示範話術"
      },
      {
        "stageName": "正式第 1 題",
        "questionNumber": 1,
        "question": "正式第 1 題題目內容",
        "candidateAnswer": "候選人回答內容",
        "score": 25,
        "feedback": "本題作答點評（如只有一句話，指出其致命缺陷）",
        "betterAnswer": "建議如何回答得更好（附帶完整 STAR 架構的具體範例話術與技巧）"
      },
      {
        "stageName": "【結尾反問】候選人向面試官提問",
        "questionNumber": ${totalQuestions + 1},
        "question": "面試官邀請提問的發言",
        "candidateAnswer": "候選人提出的反問問題",
        "score": 30,
        "feedback": "針對候選人提問深度、主動性與思考層次的專業點評",
        "betterAnswer": "建議可以如何反問（例如詢問團隊目前最大的技術挑戰、期望新成員前三個月達成的里程碑等高分提問範例）"
      }
    ]
  }
}
`;
    }

    // 呼叫 Gemini API（全部採用毫秒級極速 Flash-Lite 模型陣列）
    const modelsToTry = [
      'gemini-3.5-flash-lite',
      'gemini-flash-lite-latest',
      'gemini-3.1-flash-lite'
    ];

    let lastError: Error | null = null;
    let rawText = '';

    for (const model of modelsToTry) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      text: `${systemInstruction}\n\n${userPrompt}`
                    }
                  ]
                }
              ],
              generationConfig: {
                temperature: 0.7,
                responseMimeType: 'application/json'
              }
            }),
            signal: AbortSignal.timeout(12000)
          }
        );

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error?.message || `API request failed with status ${response.status}`);
        }

        const data = await response.json();
        rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (rawText) {
          break;
        }
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.warn(`Model ${model} failed, trying next fallback:`, lastError.message);
      }
    }

    if (!rawText) {
      throw lastError || new Error('未能由 Gemini API 取得有效回應，請稍候重試。');
    }

    const cleanedText = rawText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const parsedResult = JSON.parse(cleanedText);

    return NextResponse.json(parsedResult);
  } catch (error: unknown) {
    console.error('Interview API error:', error);
    const message = error instanceof Error ? error.message : '處理面試請求時發生未知錯誤';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
