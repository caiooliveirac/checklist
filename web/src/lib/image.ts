/**
 * Comprime a foto no próprio aparelho antes de subir: redimensiona para caber
 * em `maxDim` e reencoda em JPEG. Mantém o payload pequeno (rede da ambulância)
 * e o banco enxuto. Retorna um data URL (data:image/jpeg;base64,...).
 */
export async function compressImage(
  file: File,
  maxDim = 1280,
  quality = 0.7,
): Promise<string> {
  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas indisponível");
  ctx.drawImage(bitmap, 0, 0, w, h);
  if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();

  return canvas.toDataURL("image/jpeg", quality);
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file);
    } catch {
      /* alguns formatos/navegadores falham — cai no <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("falha ao ler a imagem"));
      img.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}
