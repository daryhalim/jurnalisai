import { NextRequest, NextResponse } from "next/server";

const KIE_API_KEY = process.env.KIE_API_KEY || "a78ff25836b2d31011ce5b8dc6ce1887";
const KIE_API_URL = "https://api.kie.ai/gemini-2.5-flash/v1/chat/completions";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

async function callKieAI(prompt: string, clientKieKey?: string): Promise<string> {
  const apiKey = clientKieKey || KIE_API_KEY;
  if (!apiKey) {
    throw new Error("KIE_API_KEY not configured");
  }

  const response = await fetch(KIE_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gemini-2.5-flash",
      messages: [{ role: "user", content: prompt }]
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`KIE API error ${response.status}: ${errBody}`);
  }

  const data = await response.json();

  if (data.code && data.code !== 200) {
    throw new Error(`KIE API error ${data.code}: ${data.msg || "Unknown error"}`);
  }
  if (!data.choices || data.choices.length === 0) {
    if (data.msg || data.error) {
      throw new Error(`KIE API error: ${data.msg || data.error}`);
    }
    throw new Error("KIE API returned no choices");
  }

  const rawText = data.choices[0]?.message?.content || "";
  console.log("[KIE /check-ai] raw response preview:", rawText.substring(0, 300));

  try {
    const parsed = JSON.parse(rawText);
    // If already the final object (has score field), return raw
    if (typeof parsed.score === "number") return rawText;
    const text = parsed.text ?? parsed.content ?? parsed.result ?? parsed.output ?? parsed.response ?? rawText;
    return typeof text === "string" ? text : JSON.stringify(text);
  } catch {
    return rawText;
  }
}

async function callGeminiDirect(prompt: string, overrideKey?: string): Promise<string> {
  const key = overrideKey || GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  console.log("[check-ai Direct] Calling Gemini API...");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 8000,
        },
      }),
    }
  );

  if (!response.ok) {
    const errBody = await response.text();
    console.error(`[check-ai Direct] Error ${response.status}:`, errBody.substring(0, 500));
    throw new Error(`Gemini API error ${response.status}: ${errBody.substring(0, 200)}`);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  console.log("[check-ai Direct] response length:", rawText.length);
  console.log("[check-ai Direct] response preview:", rawText.substring(0, 300));

  if (!rawText.trim()) {
    throw new Error("Gemini API returned empty content");
  }

  return rawText;
}

function isValidGeminiKey(key?: string): boolean {
  return typeof key === "string" && key.trim().startsWith("AIzaSy");
}

function isValidKieKey(key?: string): boolean {
  return typeof key === "string" && key.trim().length === 32 && /^[a-fA-F0-9]+$/.test(key.trim());
}

async function callAI(prompt: string, clientKey?: string): Promise<string> {
  const clientGeminiKey = isValidGeminiKey(clientKey) ? clientKey : undefined;
  const clientKieKey = isValidKieKey(clientKey) ? clientKey : undefined;

  if (clientGeminiKey) {
    try {
      console.log("[check-ai callAI] Trying client-provided Gemini API key...");
      return await callGeminiDirect(prompt, clientGeminiKey);
    } catch (geminiError: any) {
      console.warn("[check-ai callAI] Client Gemini key call failed:", geminiError.message);
    }
  }

  try {
    return await callKieAI(prompt, clientKieKey);
  } catch (kieError: any) {
    console.warn("[check-ai callAI] KIE API failed:", kieError.message);
    const fallbackKey = clientGeminiKey || GEMINI_API_KEY;
    if (isValidGeminiKey(fallbackKey)) {
      console.log("[check-ai callAI] Trying direct Gemini API fallback...");
      return await callGeminiDirect(prompt, fallbackKey);
    }
    throw new Error(`KIE API gagal: ${kieError.message}. Fallback ke Gemini API tidak tersedia karena kunci API tidak valid atau tidak dikonfigurasi.`);
  }
}

function extractJSON(text: string): any {
  const stripped = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  try { return JSON.parse(stripped); } catch {}
  const match = stripped.match(/\{[\s\S]*\}/);
  if (match) return JSON.parse(match[0]);
  throw new Error("No valid JSON found in model response.");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { text } = body;
    const clientGeminiKey = req.headers.get("x-gemini-key") || body.apiKey || "";

    if (!text || !text.trim()) {
      return NextResponse.json({ error: "Teks untuk dianalisis wajib diisi." }, { status: 400 });
    }

    const systemPrompt = `Anda adalah sistem deteksi kepenulisan AI (seperti Turnitin AI Detector). Analisis teks akademik berikut untuk mendeteksi apakah ditulis oleh LLM atau manusia.

Evaluasi: variasi panjang kalimat (burstiness), kompleksitas tata bahasa (perplexity), kata klise AI ("dalam hal ini", "lebih jauh lagi", "terlebih lagi", "pada dasarnya", "delve", "testament"), dan keteraturan gaya.

PENTING: Kembalikan HANYA JSON murni tanpa markdown. Format:
{
  "score": 85,
  "explanation": "Penjelasan singkat mengapa skor ini diberikan",
  "highlights": [
    { "text": "Kalimat yang terdeteksi AI", "reason": "Alasan deteksi" }
  ]
}

Berikan skor realistis. Bahasa Indonesia alami & bervariasi → skor rendah (<30%). Gaya kaku/AI → skor tinggi (>70%).

Teks:
---
${text}
---`;

    const responseText = await callAI(systemPrompt, clientGeminiKey);
    const resultJSON = extractJSON(responseText);
    return NextResponse.json(resultJSON);
  } catch (error: any) {
    console.error("Error in check-ai API:", error);
    return NextResponse.json({ error: `Gagal menganalisis teks: ${error.message || error}` }, { status: 500 });
  }
}
