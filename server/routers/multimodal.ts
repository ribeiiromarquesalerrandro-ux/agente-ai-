import { z } from "zod";
import { generateImage } from "../_core/imageGeneration";
import { transcribeAudio } from "../_core/voiceTranscription";
import { storagePut } from "../storage";
import { protectedProcedure, router } from "../_core/trpc";

const supportedAudio = ["audio/webm", "audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4"] as const;

export const multimodalRouter = router({
  transcribeAudio: protectedProcedure.input(z.object({
    dataUrl: z.string().min(32).max(21_500_000),
    mimeType: z.enum(supportedAudio),
    fileName: z.string().trim().min(1).max(120),
  })).mutation(async ({ ctx, input }) => {
    const [, encoded] = input.dataUrl.split(",", 2);
    if (!encoded) throw new Error("Áudio inválido.");
    const bytes = Buffer.from(encoded, "base64");
    if (bytes.byteLength > 16 * 1024 * 1024) throw new Error("O áudio excede o limite de 16 MB.");
    const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const stored = await storagePut(`agent-audio/${ctx.user.id}/${Date.now()}-${safeName}`, bytes, input.mimeType);
    const result = await transcribeAudio({ audioUrl: stored.url, language: "pt" });
    if ("error" in result) throw new Error(result.error);
    return { text: result.text, audioUrl: stored.url, language: result.language };
  }),
  generateImage: protectedProcedure.input(z.object({ prompt: z.string().trim().min(3).max(4000) })).mutation(async ({ input }) => {
    const image = await generateImage({ prompt: input.prompt });
    return { url: image.url };
  }),
});
