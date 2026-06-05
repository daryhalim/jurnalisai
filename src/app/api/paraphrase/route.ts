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
  console.log("[KIE /paraphrase] raw response preview:", rawText.substring(0, 300));

  // Try to parse as JSON to extract text field if wrapped
  try {
    const parsed = JSON.parse(rawText);
    const text = parsed.text ?? parsed.content ?? parsed.result ?? parsed.output ?? parsed.response;
    if (typeof text === "string") return text;
  } catch {}

  // Otherwise treat as plain text (the paraphrased result itself)
  return rawText;
}

async function callGeminiDirect(prompt: string, overrideKey?: string): Promise<string> {
  const key = overrideKey || GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  console.log("[paraphrase Direct] Calling Gemini API...");

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
    console.error(`[paraphrase Direct] Error ${response.status}:`, errBody.substring(0, 500));
    throw new Error(`Gemini API error ${response.status}: ${errBody.substring(0, 200)}`);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  console.log("[paraphrase Direct] response length:", rawText.length);
  console.log("[paraphrase Direct] response preview:", rawText.substring(0, 300));

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
      console.log("[paraphrase callAI] Trying client-provided Gemini API key...");
      return await callGeminiDirect(prompt, clientGeminiKey);
    } catch (geminiError: any) {
      console.warn("[paraphrase callAI] Client Gemini key call failed:", geminiError.message);
    }
  }

  try {
    return await callKieAI(prompt, clientKieKey);
  } catch (kieError: any) {
    console.warn("[paraphrase callAI] KIE API failed:", kieError.message);
    const fallbackKey = clientGeminiKey || GEMINI_API_KEY;
    if (isValidGeminiKey(fallbackKey)) {
      console.log("[paraphrase callAI] Trying direct Gemini API fallback...");
      return await callGeminiDirect(prompt, fallbackKey);
    }
    throw new Error(`KIE API gagal: ${kieError.message}. Fallback ke Gemini API tidak tersedia karena kunci API tidak valid atau tidak dikonfigurasi.`);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { text } = body;
    const clientGeminiKey = req.headers.get("x-gemini-key") || body.apiKey || "";

    if (!text || !text.trim()) {
      return NextResponse.json({ error: "Teks untuk diparafase wajib diisi." }, { status: 400 });
    }

    const systemPrompt = `Anda adalah Editor Jurnal Senior dan Pakar Parafrase Akademik.

Tugas: Tulis ulang naskah ilmiah berikut agar lolos Turnitin AI Detector dan menurunkan similarity index.

ATURAN WAJIB (SANGAT PENTING):
1. JANGAN PERNAH MERANGKUM ATAU MEMOTONG TEKS! Tulis ulang SELURUH bagian teks yang diberikan dengan panjang yang kurang lebih sama. Jika teks asli sangat panjang, hasil parafrase Anda JUGA HARUS sama panjangnya.
2. Variasikan struktur kalimat — gabungkan kalimat pendek dan panjang secara alami (burstiness tinggi).
3. Hindari kata klise AI: "Lebih jauh lagi", "Terlebih lagi", "Oleh karena itu", "Penting untuk dicatat", "Sebagai kesimpulan".
4. JANGAN ubah: angka, persentase, statistik, nama teori, nama software, rumus, hasil pengukuran.
5. JANGAN ubah sitasi dalam teks: "Pressman (2015)", "[1]", "Jogiyanto, 2018" — pertahankan persis di posisinya.
6. Gunakan bahasa yang sama dengan input (Indonesia baku tapi luwes, atau English akademik).

Teks yang diparafase:
---
${text}
---

Tulis LANGSUNG hasil parafrasenya saja dari awal sampai akhir. Jangan tambahkan pengantar atau penutup.`;

    const paraphrasedText = await callAI(systemPrompt, clientGeminiKey);
    return NextResponse.json({ paraphrasedText: paraphrasedText.trim() });
  } catch (error: any) {
    console.error("Error in paraphrase API:", error);
    return NextResponse.json(
      { error: `Gagal memproses parafrase: ${error.message || error}` },
      { status: 500 }
    );
  }
}
