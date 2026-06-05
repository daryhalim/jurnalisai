import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";

const KIE_API_KEY = process.env.KIE_API_KEY || "";
const KIE_API_URL = "https://api.kie.ai/gemini-2.5-flash/v1/chat/completions";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

async function callKieAI(prompt: string): Promise<string> {
  if (!KIE_API_KEY) {
    throw new Error("KIE_API_KEY not configured");
  }

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
    console.error(`[KIE API] Error ${response.status}:`, errBody.substring(0, 500));
    throw new Error(`KIE API error ${response.status}: ${errBody.substring(0, 200)}`);
  }

  const data = await response.json();
  const rawText = data.choices?.[0]?.message?.content || "";
  console.log("[KIE /process] raw response length:", rawText.length);
  console.log("[KIE /process] raw response preview:", rawText.substring(0, 300));

  if (!rawText.trim()) {
    throw new Error("KIE API returned empty content");
  }

  return rawText;
}

async function callGeminiDirect(prompt: string, overrideKey?: string): Promise<string> {
  const key = overrideKey || GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  console.log("[Gemini Direct] Calling Gemini API...");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 16000,
        },
      }),
    }
  );

  if (!response.ok) {
    const errBody = await response.text();
    console.error(`[Gemini Direct] Error ${response.status}:`, errBody.substring(0, 500));
    throw new Error(`Gemini API error ${response.status}: ${errBody.substring(0, 200)}`);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  console.log("[Gemini Direct] response length:", rawText.length);
  console.log("[Gemini Direct] response preview:", rawText.substring(0, 300));

  if (!rawText.trim()) {
    throw new Error("Gemini API returned empty content");
  }

  return rawText;
}

function isValidGeminiKey(key?: string): boolean {
  return typeof key === "string" && key.trim().startsWith("AIzaSy");
}

// Try client Gemini direct first, then default KIE, then default Gemini direct (if valid)
async function callAI(prompt: string, clientGeminiKey?: string): Promise<string> {
  if (isValidGeminiKey(clientGeminiKey)) {
    try {
      console.log("[callAI] Trying client-provided Gemini API key...");
      return await callGeminiDirect(prompt, clientGeminiKey);
    } catch (geminiError: any) {
      console.warn("[callAI] Client Gemini API key call failed:", geminiError.message);
    }
  }

  try {
    return await callKieAI(prompt);
  } catch (kieError: any) {
    console.warn("[callAI] KIE API failed:", kieError.message);
    const fallbackKey = clientGeminiKey || GEMINI_API_KEY;
    if (isValidGeminiKey(fallbackKey)) {
      console.log("[callAI] Trying direct Gemini API fallback...");
      return await callGeminiDirect(prompt, fallbackKey);
    }
    throw new Error(`KIE API gagal: ${kieError.message}. Fallback ke Gemini API tidak tersedia karena kunci API tidak valid atau tidak dikonfigurasi.`);
  }
}

function extractJSON(text: string): any {
  if (!text || !text.trim()) {
    throw new Error("Model response is empty. API mungkin tidak merespons.");
  }

  // Log raw response for debugging
  console.log("[extractJSON] Raw text length:", text.length);
  console.log("[extractJSON] First 500 chars:", text.substring(0, 500));

  // Strategy 1: Try parsing the raw text directly
  try {
    const parsed = JSON.parse(text.trim());
    if (parsed.judul || parsed.abstrak || parsed.pendahuluan) return parsed;
  } catch {}

  // Strategy 2: Strip markdown code blocks (```json ... ``` or ``` ... ```)
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1].trim());
      if (parsed.judul || parsed.abstrak) return parsed;
    } catch {}
  }

  // Strategy 3: Find the first { ... } block (greedy match for outermost braces)
  let braceStart = text.indexOf('{');
  if (braceStart !== -1) {
    let depth = 0;
    let braceEnd = -1;
    for (let i = braceStart; i < text.length; i++) {
      if (text[i] === '{') depth++;
      if (text[i] === '}') depth--;
      if (depth === 0) {
        braceEnd = i;
        break;
      }
    }
    if (braceEnd !== -1) {
      const jsonCandidate = text.substring(braceStart, braceEnd + 1);
      try {
        const parsed = JSON.parse(jsonCandidate);
        if (parsed.judul || parsed.abstrak || parsed.pendahuluan) return parsed;
      } catch {}
    }
  }

  // Strategy 4: Simple regex fallback
  const regexMatch = text.match(/\{[\s\S]*\}/);
  if (regexMatch) {
    try {
      return JSON.parse(regexMatch[0]);
    } catch {}
  }

  // All strategies failed — throw with preview of what we received
  const preview = text.substring(0, 300).replace(/\n/g, '\\n');
  throw new Error(`No valid JSON found in model response. Preview: "${preview}..."`);
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const clientGeminiKey = req.headers.get("x-gemini-key") || (formData.get("apiKey") as string | null) || "";
    const reportFile = formData.get("report") as File | null;
    const translate = formData.get("translate") === "true";

    if (!reportFile) {
      return NextResponse.json({ error: "Laporan penelitian wajib diunggah." }, { status: 400 });
    }

    const arrayBuffer = await reportFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let reportText = "";
    try {
      const result = await mammoth.extractRawText({ buffer });
      reportText = result.value;
    } catch (err: any) {
      console.error("mammoth error:", err);
      return NextResponse.json({ error: "Gagal mengekstrak teks dari file Word laporan." }, { status: 500 });
    }

    if (!reportText.trim()) {
      return NextResponse.json({ error: "File laporan kosong atau tidak terbaca." }, { status: 400 });
    }

    const targetLanguage = translate
      ? "English (Scopus style)"
      : "the same language as the report (Indonesian)";

    const citationStyle = (formData.get("citationStyle") as string | null) || "apa7";

    let citationInstruction = "";
    if (citationStyle === "ieee") {
      citationInstruction = "Gunakan format IEEE. Semua sitasi di dalam teks wajib menggunakan nomor berurutan dalam kurung siku, misalnya [1], [2], [3], dst. Pastikan setiap sitasi di dalam teks 'pendahuluan', 'metode', dan 'hasil' bersesuaian secara persis dengan nomor pada daftar 'referensi'.";
    } else if (citationStyle === "harvard") {
      citationInstruction = "Gunakan format Harvard. Sitasi di dalam teks menggunakan format (Nama Penulis, Tahun), misalnya (Pressman, 2015) atau (Jogiyanto & Sulistyo, 2018). Referensi di daftar referensi harus diurutkan secara abjad berdasarkan nama belakang penulis pertama.";
    } else if (citationStyle === "vancouver") {
      citationInstruction = "Gunakan format Vancouver. Sitasi di dalam teks berupa angka numerik dalam kurung siku berdasarkan urutan pemunculan pertama kali di naskah, misalnya [1], [2].";
    } else { // apa7 (default)
      citationInstruction = "Gunakan format APA Edisi ke-7 (APA 7th Edition). Sitasi di dalam teks wajib menggunakan format (Nama Belakang, Tahun), misalnya (Pressman, 2015) atau (Author1 & Author2, 2020) atau (Author et al., 2021). Pastikan sitasi tertulis secara rapi dan sinkron antara badan naskah dan daftar 'referensi'.";
    }

    const systemPrompt = `Anda adalah Asisten Penulisan Jurnal Ilmiah Akademik Profesional. Tugas utama Anda adalah mengonversi Laporan Penelitian atau Laporan Pengabdian Masyarakat (PKM) yang panjang menjadi naskah jurnal ilmiah standar yang sangat komprehensif dan mendalam.

Naskah jurnal harus ditulis dalam bahasa: ${targetLanguage}.

SINKRONISASI SITASI & DAFTAR PUSTAKA (SANGAT PENTING):
1. Anda wajib mengekstrak dan mempertahankan KUTIPAN/SITASI asli dari laporan penelitian Anda dan memasukkannya ke dalam teks jurnal yang Anda buat (terutama di bagian Pendahuluan, Metode, dan Hasil & Pembahasan).
2. Jangan sampai kutipan hilang! Kutipan di dalam teks harus bersinkronisasi secara sempurna dengan daftar pustaka yang Anda hasilkan di field "referensi". Jika di daftar referensi tertulis pustaka tertentu, maka di dalam teks naskah (pendahuluan/metode/hasil) wajib ada sitasi yang mereferensikan pustaka tersebut.
3. Aturan Format Sitasi & Referensi: ${citationInstruction}

ATURAN STRICT TARGET PANJANG KATA (SANGAT PENTING - WAJIB DIPENUHI):
Agar jurnal memiliki panjang standar 8 hingga 12 halaman dengan total kata keseluruhan (di luar referensi) berkisar antara 3.000 hingga 5.000 kata, Anda HARUS menulis setiap bagian secara sangat mendalam, kaya analisis, dan panjang, dengan rincian kata sebagai berikut:
1. Judul: 12 - 20 kata (padat, akademik, representatif)
2. Abstrak: 150 - 250 kata (berisi latar belakang, tujuan, metode, hasil utama, dan kesimpulan singkat)
3. Pendahuluan: 500 - 800 kata (jabarkan latar belakang secara komprehensif, tinjauan pustaka dasar, teori pendukung, urgensi penelitian, dan rumusan tujuan secara mendalam)
4. Metode: 400 - 700 kata (jelaskan secara rinci pendekatan penelitian, sampel/partisipan, teknik pengumpulan data, instrumen, dan prosedur analisis data)
5. Hasil & Pembahasan: 1.500 - 2.500 kata (BAGIAN TERPENTING! Jangan dirangkum singkat. Jabarkan secara sangat mendetail seluruh temuan data, tabel, angka, analisis kuantitatif/kualitatif, bandingkan dengan teori pendukung, dan lakukan pembahasan akademis yang mendalam dan komprehensif)
6. Kesimpulan: 200 - 400 kata (ringkasan kontribusi utama penelitian dan saran pengembangan)

JANGAN PERNAH MENYINGKAT ATAU MERANGKUM SEADANYA. Pertahankan keutuhan argumen ilmiah, kedalaman analisis data, rumus, dan teori dari laporan asli. Tulis dalam paragraf-paragraf akademik yang terstruktur rapi dan padat ilmiah. Total kata untuk Pendahuluan + Metode + Hasil & Pembahasan + Kesimpulan HARUS bernilai antara 3.000 hingga 5.000 kata.

PENTING: Kembalikan HANYA JSON murni tanpa markdown, tanpa penjelasan, tanpa kode blok. Format:
{
  "judul": "Judul naskah (12-20 kata)",
  "abstrak": "Abstrak naskah (150-250 kata)",
  "pendahuluan": "Teks pendahuluan yang panjang dan mendalam (500-800 kata)...",
  "metode": "Teks metode yang detail (400-700 kata)...",
  "hasil": "Teks hasil dan pembahasan yang sangat panjang dan komprehensif (1500-2500 kata)...",
  "kesimpulan": "Teks kesimpulan (200-400 kata)...",
  "referensi": "Daftar referensi asli dari laporan dalam format APA/IEEE"
}

Teks Laporan:
---
${reportText.substring(0, 120000)}
---`;

    const responseText = await callAI(systemPrompt, clientGeminiKey);
    const journalJSON = extractJSON(responseText);

    return NextResponse.json(journalJSON);
  } catch (error: any) {
    console.error("Error in process API:", error);
    return NextResponse.json(
      { error: `Gagal memproses draf jurnal: ${error.message || error}` },
      { status: 500 }
    );
  }
}
