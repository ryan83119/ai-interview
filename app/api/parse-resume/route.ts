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

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: '未接收到上傳的檔案。' }, { status: 400 });
    }

    const fileName = file.name.toLowerCase();
    const arrayBuffer = await file.arrayBuffer();
    let extractedText = '';

    if (fileName.endsWith('.pdf')) {
      // 1. 使用針對 Node/Next.js 優化且無 canvas 依賴的 unpdf
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { extractText } = require('unpdf');
        const res = await extractText(new Uint8Array(arrayBuffer));
        if (res && res.text) {
          extractedText = Array.isArray(res.text) ? res.text.join('\n\n') : String(res.text);
        }
      } catch (unpdfErr) {
        console.warn('unpdf extraction failed, trying fallback:', unpdfErr);
      }

      // 2. 若 unpdf 萃取文字極少（如掃描圖片型 PDF），啟用 Gemini 視覺/多模態 OCR 解析
      if (!extractedText || extractedText.trim().length < 20) {
        const apiKey = process.env.GEMINI_API_KEY;
        if (apiKey) {
          try {
            const base64Data = Buffer.from(arrayBuffer).toString('base64');
            const aiRes = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  contents: [
                    {
                      parts: [
                        { inlineData: { mimeType: 'application/pdf', data: base64Data } },
                        {
                          text: '請完整辨識並讀取這份履歷檔案中的所有文字內容（包含個人資訊、學經歷、專案、技能專長等），直接輸出純文字，不要加入額外解說。'
                        }
                      ]
                    }
                  ],
                  generationConfig: { temperature: 0.2 }
                }),
                signal: AbortSignal.timeout(20000)
              }
            );

            if (aiRes.ok) {
              const aiData = await aiRes.json();
              const aiText = aiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
              if (aiText.trim()) {
                extractedText = aiText.trim();
              }
            }
          } catch (geminiOcrErr) {
            console.warn('Gemini OCR fallback failed:', geminiOcrErr);
          }
        }
      }
    } else if (fileName.endsWith('.docx')) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const mammoth = require('mammoth');
        const result = await mammoth.extractRawText({ buffer: Buffer.from(arrayBuffer) });
        extractedText = result.value || '';
      } catch (docxErr: unknown) {
        console.error('DOCX parsing error:', docxErr);
        return NextResponse.json(
          { error: 'Word (.docx) 檔案讀取失敗，請確認檔案未損壞或受密碼保護。' },
          { status: 422 }
        );
      }
    } else if (fileName.endsWith('.txt') || fileName.endsWith('.md')) {
      extractedText = Buffer.from(arrayBuffer).toString('utf-8');
    } else {
      return NextResponse.json(
        { error: '不支援的檔案格式，請上傳 PDF、DOCX、TXT 或 MD 履歷檔案。' },
        { status: 400 }
      );
    }

    // 清理字元與空行
    extractedText = extractedText.replace(/\r\n/g, '\n').trim();

    if (!extractedText || extractedText.length < 5) {
      return NextResponse.json(
        { error: '未能從此檔案中解析出文字。若這是純圖片掃描的 PDF，建議轉為文字檔或切換至「手動貼上」模式。' },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      fileName: file.name,
      fileSize: file.size,
      text: extractedText
    });
  } catch (err: unknown) {
    console.error('Parse resume error:', err);
    const message = err instanceof Error ? err.message : '伺服器解析履歷時發生未預期錯誤';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
