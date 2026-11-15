import { NextResponse } from 'next/server';

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
    let resume = '';
    let history: Message[] = [];
    let totalQuestions = 3;

    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      jobUrl = (formData.get('jobUrl') as string) || '';
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
      resume = body.resume || '';
      history = body.history || [];
      totalQuestions = Number(body.totalQuestions) || 3;
    }

    // 限制正式題數範圍在 1 ~ 10 題
    totalQuestions = Math.min(Math.max(totalQuestions, 1), 10);

    // 計算目前候選人已回答的次數
    // 0: 尚未回答 -> 出【開場自我介紹】
    // 1: 剛回答完自我介紹 -> 出【正式第 1 題】
    // 2 ~ totalQuestions: 出【正式第 2 ~ totalQuestions 題】
    // totalQuestions + 1: 正式題目全回答完畢 -> 面試官提問【候選人反問環節】
    // > totalQuestions + 1: 候選人已提出反問 -> 面試官回答候選人問題，並產出【總體評分與逐題複盤報告】
    const candidateAnswers = history.filter((m) => m.role === 'candidate');
    const answerCount = candidateAnswers.length;

    const systemInstruction = `
你是一位具備多年招聘經驗的頂尖企業資深面試官。
請根據應徵職缺資訊及候選人提供的履歷資料，進行嚴謹、專業且循序漸進的完整模擬面試。

【面試流程架構】
1. 【開場自我介紹】（不計入題數）：向候選人親切開場，邀請候選人自我介紹與說明應徵動機。
2. 【正式專業問答】（共 ${totalQuestions} 道正式題目）：候選人自介完後，面試官結合履歷與自我介紹所講內容，提出【正式第 1 題】至【正式第 ${totalQuestions} 題】進行專業深挖。
3. 【候選人結尾反問】（不計入題數）：正式題回答完畢後，面試官主動詢問候選人是否有問題想了解公司、團隊或該職位。
4. 【總結與全方位複盤】：面試官先親切回答候選人的反問，接著給出完整的評分報告，包含【自我介紹】、【所有正式題目】以及【候選人反問提問品質】的全方位評審與更佳示範。

【輸出規定】
每次回應必須為標準 JSON 格式，不得輸出任何額外 Markdown 標籤或字元以外的內容。
`;

    let userPrompt = '';

    if (answerCount === 0) {
      // 階段 1：破冰開場自我介紹（不計題數）
      userPrompt = `
【職缺資訊/網址】：${jobUrl || '一般專業技術職缺'}
【候選人履歷】：
${resume || '無提供履歷，請進行標準職務面試'}

這是面試的最初開場。本階段為【破冰開場與自我介紹】（請注意：此開場不計入使用者選擇的 ${totalQuestions} 道正式專業題數）。
請向候選人親切問候，簡述今日面試的職位，並邀請候選人進行簡要的自我介紹，同時分享是什麼契機或職涯規劃促使他決定應徵這個職位。

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
【職缺資訊/網址】：${jobUrl}
【候選人履歷】：${resume}
【整場面試正式題數】：共 ${totalQuestions} 題
【目前進度】：候選人剛完成【自我介紹】。現在正式進入【正式面試題目第 1 題】（共 ${totalQuestions} 題）。
【面試歷史歷程】：
${JSON.stringify(history, null, 2)}

候選人剛完成了自我介紹與動機陳述。請你先給予簡短專業點評，並結合【候選人履歷】以及【自我介紹所提到的具體經歷或動機】，順暢提出【正式第 1 題】（共 ${totalQuestions} 題）。
針對其履歷或自我介紹中最具亮點的專案成果、關鍵技術或核心經驗切入深挖。

請務必嚴格以如下 JSON 格式回應（不加 \`\`\`json 標籤）：
{
  "type": "question",
  "stage": "formal",
  "formalQuestionNumber": 1,
  "totalQuestions": ${totalQuestions},
  "content": "面試官對自我介紹的簡評，並提出正式第 1 個問題",
  "isFinished": false
}
`;
      } else {
        userPrompt = `
【職缺資訊/網址】：${jobUrl}
【候選人履歷】：${resume}
【整場面試正式題數】：共 ${totalQuestions} 題
【目前進度】：候選人已回答至正式第 ${formalQNum - 1} 題。現在準備提出【正式第 ${formalQNum} 題】（共 ${totalQuestions} 題）${isLastFormalQuestion ? '（這是最後一道正式問題）' : ''}。
【面試歷史歷程】：
${JSON.stringify(history, null, 2)}

候選人剛回答了正式第 ${formalQNum - 1} 題。請給予簡明、具洞見的專業點評，並順暢過渡提出【正式第 ${formalQNum} 題】。
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
【職缺資訊/網址】：${jobUrl}
【候選人履歷】：${resume}
【整場面試正式題數】：共 ${totalQuestions} 題（已全數回答完畢）
【面試歷史歷程】：
${JSON.stringify(history, null, 2)}

候選人已完成了最後一道正式問題！
現在進入經典的【候選人反問環節】（不計入題數）。
請面試官先對最後一題的回答給予簡短正面肯定，接著正式告知「今天的專業面試問題到此告一段落」，並親切詢問候選人：「接下來把時間交給你，請問你對於我們公司、團隊、這個職位的日常挑戰或未來的發展，有沒有什麼想問我的問題？」

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
【職缺資訊/網址】：${jobUrl}
【候選人履歷】：${resume}
【面試歷史歷程（包含 1 次自我介紹 + ${totalQuestions} 道正式問答 + 1 次候選人反問）】：
${JSON.stringify(history, null, 2)}

候選人剛才向面試官提出了他的反問問題（或表示目前沒有問題）。
整場面試正式圓滿結束！
現在請面試官執行兩項核心任務：
1. 在 content 欄位中，先以資深面試官的身分，專業、熱誠且具體地【回答候選人提出的問題】（若候選人詢問公司文化、團隊挑戰、技術棧或期望，請給出誠懇且有深度的業界視角解答；若候選人說沒問題，則給予溫暖結尾致意）。
2. 在 assessment 欄位中產出整場面試的綜合評核與全方位逐題複盤報告。

【評分與建議的重要評核要求】：
評分與 questionReviews 必須完整涵蓋以下三大環節：
- 環節一【破冰開場】：stageName: "【破冰開場】自我介紹與應徵動機"，評析其自我介紹與動機，並告知如何介紹得更好。
- 環節二【正式題目】：stageName: "正式第 1 題" 至 "正式第 ${totalQuestions} 題"，每題給予評分、點評與 STAR 架構的高分示範回答。
- 環節三【結尾反問】：stageName: "【結尾反問】候選人向面試官提問"，評估候選人反問問題的品質（是否有企圖心、商業敏銳度、文化洞察或專業深度？），評分 (0-100)，並在 betterAnswer 中具體指導「如何向面試官反問能給公司留下深刻印象、提升錄取率的高分提問範例話術」。

請務必嚴格以如下 JSON 格式回應（不加 \`\`\`json 標籤）：
{
  "type": "feedback",
  "stage": "completed",
  "totalQuestions": ${totalQuestions},
  "isFinished": true,
  "content": "面試官針對候選人反問問題的詳細專業回答，並向候選人致謝的溫暖結語",
  "assessment": {
    "totalScore": 88,
    "dimensions": [
      { "name": "職務契合度", "score": 90, "comment": "具體簡評" },
      { "name": "專業與邏輯思考", "score": 85, "comment": "具體簡評" },
      { "name": "溝通表達與主動性", "score": 88, "comment": "具體簡評" }
    ],
    "strengths": [
      "優勢要點 1",
      "優勢要點 2"
    ],
    "improvements": [
      "改進方向 1",
      "改進方向 2"
    ],
    "overallSummary": "給予求職者的完整綜述與未來實戰建議",
    "questionReviews": [
      {
        "stageName": "【破冰開場】自我介紹與應徵動機",
        "questionNumber": 0,
        "question": "開場自我介紹題目內容",
        "candidateAnswer": "候選人自我介紹要點",
        "score": 85,
        "feedback": "自我介紹的亮點與盲點點評",
        "betterAnswer": "建議如何自我介紹能更吸睛、更有條理的示範話術"
      },
      {
        "stageName": "正式第 1 題",
        "questionNumber": 1,
        "question": "正式第 1 題題目內容",
        "candidateAnswer": "候選人回答摘要",
        "score": 88,
        "feedback": "本題表現點評",
        "betterAnswer": "建議如何回答得更好（附帶具體範例話術與技巧）"
      },
      {
        "stageName": "【結尾反問】候選人向面試官提問",
        "questionNumber": ${totalQuestions + 1},
        "question": "面試官邀請提問的發言",
        "candidateAnswer": "候選人提出的反問問題",
        "score": 90,
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
