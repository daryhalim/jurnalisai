import { NextRequest, NextResponse } from "next/server";

const KIE_API_KEY = process.env.KIE_API_KEY || "";
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
    console.error(`[KIE API] Error ${response.status}:`, errBody.substring(0, 500));
    throw new Error(`KIE API error ${response.status}: ${errBody.substring(0, 200)}`);
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
  console.log(`[KIE /generate-section] response length: ${rawText.length}`);

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
    throw new Error(`Gemini API error ${response.status}: ${errBody.substring(0, 200)}`);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

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
      return await callGeminiDirect(prompt, clientGeminiKey);
    } catch (geminiError: any) {
      console.warn("[generate-section] Client Gemini failed:", geminiError.message);
    }
  }

  try {
    return await callKieAI(prompt, clientKieKey);
  } catch (kieError: any) {
    console.warn("[generate-section] KIE API failed:", kieError.message);
    const fallbackKey = clientGeminiKey || GEMINI_API_KEY;
    if (isValidGeminiKey(fallbackKey)) {
      return await callGeminiDirect(prompt, fallbackKey);
    }
    throw new Error(`KIE API gagal: ${kieError.message}. Fallback ke Gemini API tidak tersedia.`);
  }
}

function extractJSON(text: string): any {
  if (!text || !text.trim()) {
    throw new Error("Model response is empty.");
  }

  // Strategy 1: Direct parse
  try {
    return JSON.parse(text.trim());
  } catch {}

  // Strategy 2: Strip markdown code blocks
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {}
  }

  // Strategy 3: Find outermost braces
  const braceStart = text.indexOf('{');
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
      try {
        return JSON.parse(text.substring(braceStart, braceEnd + 1));
      } catch {}
    }
  }

  // Strategy 4: Regex fallback
  const regexMatch = text.match(/\{[\s\S]*\}/);
  if (regexMatch) {
    try {
      return JSON.parse(regexMatch[0]);
    } catch {}
  }

  throw new Error(`No valid JSON found. Preview: "${text.substring(0, 200)}..."`);
}

function getCitationInstruction(citationStyle: string): string {
  if (citationStyle === "ieee") {
    return "Gunakan format IEEE. Semua sitasi di dalam teks wajib menggunakan nomor berurutan dalam kurung siku, misalnya [1], [2], [3].";
  } else if (citationStyle === "harvard") {
    return "Gunakan format Harvard. Sitasi di dalam teks menggunakan format (Nama Penulis, Tahun).";
  } else if (citationStyle === "vancouver") {
    return "Gunakan format Vancouver. Sitasi di dalam teks berupa angka numerik dalam kurung siku berdasarkan urutan pemunculan pertama.";
  }
  return "Gunakan format APA Edisi ke-7. Sitasi di dalam teks wajib menggunakan format (Nama Belakang, Tahun), misalnya (Pressman, 2015).";
}

function buildSectionPrompt(
  section: string,
  reportText: string,
  citationStyle: string,
  translate: boolean,
  previousSections?: Record<string, string>
): string {
  const lang = translate ? "English (Scopus style)" : "Bahasa Indonesia";
  const citationInstr = getCitationInstruction(citationStyle);

  // Truncate report text for non-referensi sections to keep within token limits
  const truncReport = section === "referensi" ? reportText.substring(0, 30000) : reportText.substring(0, 40000);

  const baseContext = `Anda adalah Asisten Penulisan Jurnal Ilmiah Akademik Profesional.
Bahasa output: ${lang}.
Format sitasi: ${citationInstr}

ATURAN SITASI PENTING:
- Anda WAJIB mengekstrak dan mempertahankan kutipan/sitasi ASLI dari laporan penelitian.
- JANGAN mengarang atau membuat kutipan baru yang tidak ada di laporan asli.
- Setiap kutipan yang Anda tulis di teks HARUS merujuk ke sumber yang benar-benar ada di laporan.

PENTING: Kembalikan HANYA JSON murni tanpa markdown, tanpa penjelasan, tanpa kode blok.`;

  switch (section) {
    case "judul_abstrak":
      return `${baseContext}

Tugas: Buat JUDUL dan ABSTRAK jurnal ilmiah dari laporan penelitian berikut.

ATURAN:
- Judul: 12–20 kata, padat, akademik, representatif terhadap isi laporan.
- Abstrak: 150–250 kata, berisi latar belakang singkat, tujuan, metode, hasil utama, dan kesimpulan singkat.

Format JSON:
{"judul": "...", "abstrak": "..."}

Teks Laporan:
---
${truncReport}
---`;

    case "pendahuluan":
      return `${baseContext}

Tugas: Tulis bagian PENDAHULUAN jurnal ilmiah dari laporan penelitian berikut.

ATURAN:
- Panjang: 500–800 kata.
- Jabarkan latar belakang secara komprehensif.
- Sertakan tinjauan pustaka dasar dan teori pendukung.
- Jelaskan urgensi penelitian dan rumusan tujuan.
- WAJIB menyertakan kutipan/sitasi asli dari laporan (misalnya: Pressman, 2015; Sommerville, 2016).
- HANYA gunakan kutipan yang BENAR-BENAR ADA di laporan asli. JANGAN mengarang kutipan baru.
- JANGAN memasukkan kutipan dari tabel "penelitian terdahulu" kecuali memang Anda gunakan dalam argumen.

Format JSON:
{"pendahuluan": "..."}

Teks Laporan:
---
${truncReport}
---`;

    case "metode":
      return `${baseContext}

Tugas: Tulis bagian METODE jurnal ilmiah dari laporan penelitian berikut.

ATURAN:
- Panjang: 400–700 kata.
- Jelaskan pendekatan/jenis penelitian, populasi/sampel, teknik pengumpulan data, instrumen, dan prosedur analisis data.
- Sertakan kutipan/sitasi asli jika laporan mencantumkannya di bagian metode.
- HANYA gunakan kutipan yang BENAR-BENAR ADA di laporan asli.

Format JSON:
{"metode": "..."}

Teks Laporan:
---
${truncReport}
---`;

    case "hasil":
      return `${baseContext}

Tugas: Tulis bagian HASIL DAN PEMBAHASAN jurnal ilmiah dari laporan penelitian berikut.

ATURAN:
- Panjang: 1.500–2.500 kata. INI BAGIAN TERPENTING!
- JANGAN merangkum singkat. Jabarkan secara sangat mendetail.
- Pertahankan SEMUA data angka, persentase, statistik, rumus, dan hasil pengukuran dari laporan asli.
- Bandingkan temuan dengan teori/pustaka yang dikutip di laporan asli.
- Sertakan kutipan/sitasi asli yang relevan.
- HANYA gunakan kutipan yang BENAR-BENAR ADA di laporan asli.

Format JSON:
{"hasil": "..."}

Teks Laporan:
---
${truncReport}
---`;

    case "kesimpulan":
      return `${baseContext}

Tugas: Tulis bagian KESIMPULAN jurnal ilmiah berdasarkan laporan penelitian dan bagian-bagian jurnal yang telah ditulis sebelumnya.

ATURAN:
- Panjang: 200–400 kata.
- Ringkasan kontribusi utama penelitian.
- Saran pengembangan untuk penelitian selanjutnya.
- JANGAN menambahkan kutipan baru di kesimpulan.

Format JSON:
{"kesimpulan": "..."}

Bagian jurnal sebelumnya (sebagai konteks):
Judul: ${previousSections?.judul || ""}
Abstrak: ${(previousSections?.abstrak || "").substring(0, 500)}
Pendahuluan: ${(previousSections?.pendahuluan || "").substring(0, 500)}
Hasil: ${(previousSections?.hasil || "").substring(0, 500)}

Teks Laporan:
---
${reportText.substring(0, 20000)}
---`;

    case "referensi":
      // This is the FINAL SYNCHRONIZATION step
      const allJournalText = [
        previousSections?.pendahuluan || "",
        previousSections?.metode || "",
        previousSections?.hasil || "",
        previousSections?.kesimpulan || "",
      ].join("\n\n");

      return `Anda adalah editor jurnal ilmiah yang bertugas menyinkronkan daftar pustaka.

Format sitasi: ${citationInstr}

Tugas Anda:
1. Baca SELURUH badan naskah jurnal di bawah ini.
2. Identifikasi SEMUA kutipan/sitasi yang BENAR-BENAR tertulis di dalam badan naskah.
3. Dari daftar referensi yang ada di laporan asli, HANYA tuliskan referensi yang kutipannya BENAR-BENAR MUNCUL di badan naskah jurnal.
4. JANGAN masukkan referensi yang tidak dikutip di badan naskah jurnal.
5. JANGAN mengarang referensi baru yang tidak ada di laporan asli.

ATURAN KETAT:
- Jika kutipan "(Pressman, 2015)" muncul di badan naskah, maka entri "Pressman, R. S. (2015). ..." HARUS ada di daftar.
- Jika kutipan "(Jogiyanto, 2018)" TIDAK muncul di badan naskah, maka entri Jogiyanto JANGAN dimasukkan.
- Pastikan setiap entri daftar pustaka ditulis lengkap sesuai format ${citationStyle === "ieee" ? "IEEE" : citationStyle === "harvard" ? "Harvard" : citationStyle === "vancouver" ? "Vancouver" : "APA 7th Edition"}.

Kembalikan HANYA JSON murni:
{"referensi": "Daftar pustaka lengkap yang tersinkronisasi..."}

=== BADAN NASKAH JURNAL ===
${allJournalText.substring(0, 25000)}

=== DAFTAR REFERENSI DARI LAPORAN ASLI ===
${truncReport}
---`;

    default:
      throw new Error(`Unknown section: ${section}`);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { reportText, section, citationStyle, translate, previousSections } = body;
    const clientKey = req.headers.get("x-gemini-key") || body.apiKey || "";

    if (!reportText || !reportText.trim()) {
      return NextResponse.json({ error: "Teks laporan wajib disertakan." }, { status: 400 });
    }

    if (!section) {
      return NextResponse.json({ error: "Parameter 'section' wajib diisi." }, { status: 400 });
    }

    const validSections = ["judul_abstrak", "pendahuluan", "metode", "hasil", "kesimpulan", "referensi"];
    if (!validSections.includes(section)) {
      return NextResponse.json({ error: `Section tidak valid: ${section}` }, { status: 400 });
    }

    console.log(`[generate-section] Generating section: ${section}, reportText length: ${reportText.length}`);

    const prompt = buildSectionPrompt(
      section,
      reportText,
      citationStyle || "apa7",
      translate || false,
      previousSections
    );

    const responseText = await callAI(prompt, clientKey);
    const sectionJSON = extractJSON(responseText);

    console.log(`[generate-section] Section ${section} generated successfully. Keys:`, Object.keys(sectionJSON));

    return NextResponse.json(sectionJSON);
  } catch (error: any) {
    console.error(`[generate-section] Error:`, error);
    return NextResponse.json(
      { error: `Gagal generate bagian jurnal: ${error.message || error}` },
      { status: 500 }
    );
  }
}
