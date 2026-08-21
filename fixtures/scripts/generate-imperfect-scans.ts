/**
 * generate-imperfect-scans.ts
 *
 * Takes a selection of generated PDFs and produces deliberately degraded versions
 * to exercise the OCR/extraction pipeline. Creates images that simulate:
 * - Skewed scans (2-3 degree rotation)
 * - Low contrast / washed-out copies
 * - Phone photos (slight blur + uneven lighting)
 * - Slightly cropped edges
 *
 * Outputs are placed in /fixtures/scans/ as PNG images.
 *
 * Usage: npx tsx generate-imperfect-scans.ts
 *
 * Attribution: sharp (Apache-2.0) - https://github.com/lovell/sharp
 *              pdf2pic (MIT) - https://github.com/yakovmeister/pdf2pic
 */

import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execSync } from "node:child_process";
import sharp from "sharp";
import { fromPath } from "pdf2pic";

// ---------- Preflight check ----------

/**
 * Verify that GraphicsMagick is installed and available on PATH.
 * pdf2pic uses node-gm which shells out to the `gm` binary.
 */
function checkGraphicsMagick(): void {
  try {
    execSync("gm version", { stdio: "ignore" });
  } catch {
    console.error(
      "ERROR: GraphicsMagick is not installed or not found on PATH.\n" +
        "pdf2pic requires GraphicsMagick to rasterize PDFs.\n\n" +
        "Install it:\n" +
        "  macOS:        brew install graphicsmagick\n" +
        "  Debian/Ubuntu: sudo apt-get install graphicsmagick\n"
    );
    process.exit(1);
  }
}

checkGraphicsMagick();

const FIXTURES_DIR = join(import.meta.dirname ?? ".", "..");
const PDFS_DIR = join(FIXTURES_DIR, "pdfs");
const SCANS_DIR = join(FIXTURES_DIR, "scans");

// PDF files selected for degraded scan generation
const SCAN_TARGETS = [
  {
    file: "nexwave-fibre-2024-02-001.pdf",
    degradation: "skewed",
    description: "Skewed 2.5 degrees as if placed crooked on scanner",
  },
  {
    file: "greendale-energy-2024-02-001.pdf",
    degradation: "low-contrast",
    description: "Washed out low-contrast copy",
  },
  {
    file: "brightpath-consulting-2024-01-001.pdf",
    degradation: "phone-photo",
    description: "Phone photo with slight blur and uneven lighting",
  },
  {
    file: "pinnacle-office-2023-03-002.pdf",
    degradation: "cropped",
    description: "Slightly cropped edges - paper not aligned",
  },
  {
    file: "crestfield-insurance-2024-03-001.pdf",
    degradation: "skewed",
    description: "Skewed 3 degrees with slight shadow",
  },
];

/**
 * Convert a PDF page to a rasterized image buffer using pdf2pic.
 * pdf2pic uses GraphicsMagick/ImageMagick under the hood to produce
 * a faithful rasterization of the PDF content including all text and graphics.
 */
async function pdfToImage(pdfPath: string): Promise<Buffer> {
  const converter = fromPath(pdfPath, {
    density: 150,
    saveFilename: "temp-scan",
    savePath: SCANS_DIR,
    format: "png",
    width: 1240,
    height: 1754,
  });

  const result = await converter(1); // Convert first page

  if (!result.path) {
    throw new Error(`Failed to rasterize PDF: ${pdfPath}`);
  }

  // Read the rasterized image and return as buffer
  const imageBuffer = await readFile(result.path);
  // Clean up the temp file - we will write the degraded version separately
  const { unlink } = await import("node:fs/promises");
  await unlink(result.path).catch(() => {});

  return imageBuffer;
}

async function applySkew(imageBuffer: Buffer, degrees: number): Promise<Buffer> {
  return sharp(imageBuffer)
    .rotate(degrees, { background: { r: 240, g: 240, b: 240, alpha: 1 } })
    .modulate({ brightness: 0.95 })
    .png()
    .toBuffer();
}

async function applyLowContrast(imageBuffer: Buffer): Promise<Buffer> {
  return sharp(imageBuffer)
    .modulate({ brightness: 1.3, saturation: 0.2 })
    .linear(0.5, 60) // Reduce contrast significantly
    .png()
    .toBuffer();
}

async function applyPhonePhoto(imageBuffer: Buffer): Promise<Buffer> {
  return sharp(imageBuffer)
    .blur(1.2) // Slight blur from hand shake
    .modulate({ brightness: 0.85 }) // Slightly darker (shadows)
    .gamma(1.5) // Uneven lighting simulation
    .png()
    .toBuffer();
}

async function applyCrop(imageBuffer: Buffer): Promise<Buffer> {
  const metadata = await sharp(imageBuffer).metadata();
  const w = metadata.width ?? 1240;
  const h = metadata.height ?? 1754;

  // Crop 3-5% off edges unevenly
  const left = Math.round(w * 0.03);
  const top = Math.round(h * 0.02);
  const cropWidth = Math.round(w * 0.93);
  const cropHeight = Math.round(h * 0.95);

  return sharp(imageBuffer)
    .extract({ left, top, width: cropWidth, height: cropHeight })
    .png()
    .toBuffer();
}

async function main(): Promise<void> {
  console.log("Generating imperfect scans from selected PDFs...");

  await mkdir(SCANS_DIR, { recursive: true });

  // Verify PDFs exist
  const { readdir } = await import("node:fs/promises");
  const existingPdfs = await readdir(PDFS_DIR).catch(() => []);
  if (existingPdfs.length === 0) {
    console.error(
      "ERROR: No PDFs found in /fixtures/pdfs/. Run generate-pdfs first."
    );
    process.exit(1);
  }

  let count = 0;
  for (const target of SCAN_TARGETS) {
    const pdfPath = join(PDFS_DIR, target.file);

    try {
      await readFile(pdfPath);
    } catch {
      console.warn(`WARNING: ${target.file} not found, skipping`);
      continue;
    }

    console.log(
      `Processing ${target.file} with degradation: ${target.degradation}`
    );

    // Rasterize PDF to image using pdf2pic (GraphicsMagick-based)
    let imageBuffer = await pdfToImage(pdfPath);

    // Apply degradation
    switch (target.degradation) {
      case "skewed":
        imageBuffer = await applySkew(imageBuffer, 2.5);
        break;
      case "low-contrast":
        imageBuffer = await applyLowContrast(imageBuffer);
        break;
      case "phone-photo":
        imageBuffer = await applyPhonePhoto(imageBuffer);
        break;
      case "cropped":
        imageBuffer = await applyCrop(imageBuffer);
        break;
    }

    const outputName = target.file.replace(".pdf", `-${target.degradation}.png`);
    await writeFile(join(SCANS_DIR, outputName), imageBuffer);
    count++;
    console.log(`  -> ${outputName}`);
  }

  console.log(`\nGenerated ${count} imperfect scans in ${SCANS_DIR}`);
}

main().catch((err) => {
  console.error("Failed to generate imperfect scans:", err);
  process.exit(1);
});
