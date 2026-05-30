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

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();

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

    const paraphrasedText = await callKieAI(systemPrompt);
    return NextResponse.json({ paraphrasedText: paraphrasedText.trim() });
  } catch (error: any) {
    console.error("Error in paraphrase API:", error);
    return NextResponse.json(
      { error: `Gagal memproses parafrase: ${error.message || error}` },
      { status: 500 }
    );
  }
}
