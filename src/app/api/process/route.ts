import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";

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
  console.log("[KIE /process] raw response preview:", rawText.substring(0, 300));

  // Try to parse just in case it wraps it in another JSON
  try {
    const parsed = JSON.parse(rawText);
    if (parsed.judul || parsed.abstrak) return rawText;
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
    const formData = await req.formData();
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

    const systemPrompt = `Anda adalah Asisten Penulisan Jurnal Ilmiah Akademik Profesional. Tugas utama Anda adalah mengonversi Laporan Penelitian atau Laporan Pengabdian Masyarakat (PKM) yang panjang menjadi naskah jurnal ilmiah standar yang sangat komprehensif dan mendalam.

Naskah jurnal harus ditulis dalam bahasa: ${targetLanguage}.

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

    const responseText = await callKieAI(systemPrompt);
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
