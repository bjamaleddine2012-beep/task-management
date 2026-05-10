import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

import { auth } from "@/auth";

// Issues short-lived upload tokens so the client can PUT the file directly to
// Vercel Blob, bypassing the serverless function body limit (4.5 MB on
// Hobby). The client calls `upload()` from `@vercel/blob/client` and points
// it at this URL.

const ALLOWED = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

const MAX_BYTES = 16 * 1024 * 1024; // 16 MB ceiling

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        // Only authed users can request an upload token. We don't bind the
        // token to a specific task here — the server action that saves the
        // URL re-checks ownership.
        const session = await auth();
        if (!session?.user) throw new Error("Unauthorized");

        return {
          allowedContentTypes: ALLOWED,
          maximumSizeInBytes: MAX_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ userId: session.user.id }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Hook for follow-up work (e.g. create DB row); we save in the
        // submitProofAction instead so the user explicitly confirms.
        console.log("[blob upload] complete", {
          url: blob.url,
          tokenPayload,
        });
      },
    });

    return NextResponse.json(json);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 },
    );
  }
}
