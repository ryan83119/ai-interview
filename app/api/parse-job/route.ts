import { NextResponse } from 'next/server';

interface ParsedJob {
  company: string;
  title: string;
  description: string;
  tools?: string;
  condition?: string;
  rawText: string;
}

export async function parseJobUrl(url: string): Promise<ParsedJob | null> {
  const trimmedUrl = url.trim();
  if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
    return null;
  }

  // 1. 104 人力銀行特殊處理 (透過 104 AJAX 官方 API 解析，避開 Cloudflare 擋 HTML)
  const match104 = trimmedUrl.match(/104\.com\.tw\/job\/([a-zA-Z0-9]+)/i);
  if (match104) {
    try {
      const jobId = match104[1];
      const res = await fetch(`https://www.104.com.tw/job/ajax/content/${jobId}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Referer': `https://www.104.com.tw/job/${jobId}`,
          'Accept': 'application/json, text/plain, */*'
        },
        signal: AbortSignal.timeout(6000)
      });

      if (res.ok) {
        const json = await res.json();
        const data = json.data;
        if (data) {
          const company = data.header?.custName || '';
          const title = data.header?.jobName || '';
          const description = data.jobDetail?.jobDescription || '';
          const condition = data.condition?.other || '';
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const tools = data.condition?.specialty ? data.condition.specialty.map((s: any) => s.description).join(', ') : '';

          const rawText = [
            company ? `【目標應徵公司】：${company}` : '',
            title ? `【應徵職缺職位】：${title}` : '',
            description ? `【職缺工作內容】：\n${description}` : '',
            tools ? `【擅長工具與技能】：${tools}` : '',
            condition ? `【其他條件要求】：\n${condition}` : ''
          ].filter(Boolean).join('\n\n');

          return { company, title, description, tools, condition, rawText };
        }
      }
    } catch (e) {
      console.warn('104 ajax parse error:', e);
    }
  }

  // 2. 一般網頁（CakeResume, Yourator, 公司官網等）通用 HTML 抓取
  try {
    const res = await fetch(trimmedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      signal: AbortSignal.timeout(6000)
    });

    if (res.ok) {
      const html = await res.text();
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
      const ogDescMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
      const metaDescMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);

      const title = ogTitleMatch?.[1] || titleMatch?.[1] || '';
      const description = ogDescMatch?.[1] || metaDescMatch?.[1] || '';

      if (title || description) {
        let company = '';
        if (title.includes('|')) {
          const parts = title.split('|');
          company = parts[parts.length - 1].trim();
        } else if (title.includes('-')) {
          const parts = title.split('-');
          company = parts[parts.length - 1].trim();
        }

        const rawText = [
          company ? `【目標應徵公司】：${company}` : '',
          title ? `【應徵職缺職位】：${title}` : '',
          description ? `【職缺說明摘要】：\n${description}` : ''
        ].filter(Boolean).join('\n\n');

        return { company, title, description, rawText };
      }
    }
  } catch (e) {
    console.warn('General URL parse error:', e);
  }

  return null;
}

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: '請提供有效的職缺網址' }, { status: 400 });
    }

    const parsed = await parseJobUrl(url);
    if (!parsed) {
      return NextResponse.json({
        success: false,
        message: '無法自動解析該網址，請直接於下方手動輸入公司名稱、職缺與工作說明。'
      });
    }

    return NextResponse.json({
      success: true,
      data: parsed
    });
  } catch (error: unknown) {
    console.error('Parse job error:', error);
    const msg = error instanceof Error ? error.message : '解析職缺網址時發生未知錯誤';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
