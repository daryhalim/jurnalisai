import { NextRequest, NextResponse } from "next/server";

const KIE_API_KEY = process.env.KIE_API_KEY || "a78ff25836b2d31011ce5b8dc6ce1887";
const KIE_API_URL = "https://api.kie.ai/gemini-2.5-flash/v1/chat/completions";

async function callKieAI(prompt: string): Promise<string> {
  const response = await fetch(KIE_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${KIE_API_KEY}`,
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
  const rawText = data.choices?.[0]?.message?.content || "";
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

function extractJSON(text: string): any {
  const stripped = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  try { return JSON.parse(stripped); } catch {}
  const match = stripped.match(/\{[\s\S]*\}/);
  if (match) return JSON.parse(match[0]);
  throw new Error("No valid JSON found in model response.");
}

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();

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

    const responseText = await callKieAI(systemPrompt);
    const resultJSON = extractJSON(responseText);
    return NextResponse.json(resultJSON);
  } catch (error: any) {
    console.error("Error in check-ai API:", error);
    return NextResponse.json({ error: `Gagal menganalisis teks: ${error.message || error}` }, { status: 500 });
  }
}
