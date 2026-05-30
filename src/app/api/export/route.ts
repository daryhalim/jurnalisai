import { NextRequest, NextResponse } from "next/server";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  PageBreak,
  Header,
  Footer,
  TabStopPosition,
  TabStopType,
  BorderStyle,
} from "docx";

interface JournalData {
  judul: string;
  abstrak: string;
  pendahuluan: string;
  metode: string;
  hasil: string;
  kesimpulan: string;
  referensi: string;
}

/**
 * Split long text into multiple Word paragraphs (by double-newline or single-newline).
 * Each paragraph is justified, Times New Roman 12pt.
 */
function textToParagraphs(
  text: string,
  options?: { bold?: boolean; italic?: boolean; size?: number; alignment?: (typeof AlignmentType)[keyof typeof AlignmentType] }
): Paragraph[] {
  if (!text || !text.trim()) {
    return [new Paragraph({ text: "" })];
  }

  const fontSize = options?.size ?? 24; // docx uses half-points, 24 = 12pt
  const alignment = options?.alignment ?? AlignmentType.JUSTIFIED;

  // Split on double newlines first for paragraph breaks, then handle single newlines
  const blocks = text.split(/\n\s*\n/);

  const paragraphs: Paragraph[] = [];

  for (const block of blocks) {
    const lines = block.split(/\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      paragraphs.push(
        new Paragraph({
          alignment,
          spacing: { after: 120, line: 360 }, // 1.5 line spacing
          children: [
            new TextRun({
              text: trimmed,
              font: "Times New Roman",
              size: fontSize,
              bold: options?.bold ?? false,
              italics: options?.italic ?? false,
            }),
          ],
        })
      );
    }
  }

  return paragraphs.length > 0
    ? paragraphs
    : [new Paragraph({ text: "" })];
}

/**
 * Create a section heading paragraph
 */
function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { before: 360, after: 200 },
    children: [
      new TextRun({
        text,
        font: "Times New Roman",
        size: 24,
        bold: true,
      }),
    ],
  });
}

/**
 * Create reference list paragraphs (each reference on its own line with hanging indent)
 */
function referencesToParagraphs(text: string): Paragraph[] {
  if (!text || !text.trim()) return [new Paragraph({ text: "" })];

  // Split by newline — each line is one reference
  const refs = text.split(/\n/).filter((r) => r.trim());

  return refs.map(
    (ref, idx) =>
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { after: 80 },
        indent: { left: 720, hanging: 720 }, // Hanging indent for APA/IEEE style
        children: [
          new TextRun({
            text: ref.trim(),
            font: "Times New Roman",
            size: 22, // 11pt
          }),
        ],
      })
  );
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const dataString = formData.get("data") as string | null;

    if (!dataString) {
      return NextResponse.json(
        { error: "Data naskah jurnal tidak ditemukan." },
        { status: 400 }
      );
    }

    const journalData: JournalData = JSON.parse(dataString);

    // =====================================================
    // BUILD THE ENTIRE DOCX FROM SCRATCH
    // This guarantees the journal content is ALWAYS present
    // regardless of the template file's structure.
    // =====================================================

    const doc = new Document({
      styles: {
        default: {
          document: {
            run: {
              font: "Times New Roman",
              size: 24, // 12pt
            },
          },
        },
      },
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: 1440,    // 1 inch
                right: 1440,
                bottom: 1440,
                left: 1440,
              },
            },
          },
          children: [
            // ===== JUDUL =====
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 400 },
              children: [
                new TextRun({
                  text: (journalData.judul || "JUDUL NASKAH JURNAL").toUpperCase(),
                  font: "Times New Roman",
                  size: 28, // 14pt
                  bold: true,
                }),
              ],
            }),

            // Spacing line
            new Paragraph({ spacing: { after: 200 }, text: "" }),

            // ===== ABSTRAK HEADING =====
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 200, after: 200 },
              children: [
                new TextRun({
                  text: "ABSTRAK",
                  font: "Times New Roman",
                  size: 24,
                  bold: true,
                }),
              ],
            }),

            // ===== ABSTRAK BODY =====
            ...textToParagraphs(journalData.abstrak, { italic: true, size: 22 }),

            // ===== 1. PENDAHULUAN =====
            sectionHeading("1. PENDAHULUAN"),
            ...textToParagraphs(journalData.pendahuluan),

            // ===== 2. METODE =====
            sectionHeading("2. METODE PENELITIAN"),
            ...textToParagraphs(journalData.metode),

            // ===== 3. HASIL DAN PEMBAHASAN =====
            sectionHeading("3. HASIL DAN PEMBAHASAN"),
            ...textToParagraphs(journalData.hasil),

            // ===== 4. KESIMPULAN =====
            sectionHeading("4. KESIMPULAN"),
            ...textToParagraphs(journalData.kesimpulan),

            // ===== DAFTAR PUSTAKA =====
            sectionHeading("DAFTAR PUSTAKA"),
            ...referencesToParagraphs(journalData.referensi),
          ],
        },
      ],
    });

    // Generate the docx buffer
    const buffer = await Packer.toBuffer(doc);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition":
          "attachment; filename=Naskah_Jurnal_Lengkap.docx",
      },
    });
  } catch (error: any) {
    console.error("Error in export API:", error);
    return NextResponse.json(
      {
        error: `Gagal membuat file DOCX: ${error.message || error}`,
      },
      { status: 500 }
    );
  }
}
