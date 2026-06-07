import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const reportFile = formData.get("report") as File | null;

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

    // Truncate to 60k chars max
    const truncatedText = reportText.substring(0, 60000);

    return NextResponse.json({
      reportText: truncatedText,
      originalLength: reportText.length,
      truncated: reportText.length > 60000
    });
  } catch (error: any) {
    console.error("Error in extract API:", error);
    return NextResponse.json(
      { error: `Gagal mengekstrak teks: ${error.message || error}` },
      { status: 500 }
    );
  }
}
