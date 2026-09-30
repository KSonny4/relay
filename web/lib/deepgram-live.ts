export type LiveSession = {
  sendAudio: (chunk: Blob) => void;
  close: () => void;
};

type ResultsMessage = {
  type: string;
  is_final?: boolean;
  channel?: {
    alternatives?: Array<{ transcript?: string }>;
  };
};

/**
 * Opens a Deepgram live transcription socket with a short-lived access token
 * from the Relay API. The long-lived Deepgram key stays on the server.
 */
export async function startLiveSession(
  accessToken: string,
  onTranscript: (text: string, isFinal: boolean) => void,
  onError: (error: Error) => void,
): Promise<LiveSession> {
  const { DeepgramClient } = await import("@deepgram/sdk");
  const client = new DeepgramClient({ accessToken });
  const connection = await client.listen.v1.connect({
    model: "nova-3",
    language: "en",
    punctuate: "true",
    interim_results: "true",
    smart_format: "true",
    reconnectAttempts: 0,
    connectionTimeoutInSeconds: 10,
  });

  connection.on("message", (data) => {
    const piece = readResults(data);
    if (!piece) return;
    onTranscript(piece.text, piece.isFinal);
  });
  connection.on("error", (error) => {
    onError(error instanceof Error ? error : new Error("Live transcription failed."));
  });

  connection.connect();
  await connection.waitForOpen();

  return {
    sendAudio(chunk) {
      if (chunk.size === 0 || connection.readyState !== WebSocket.OPEN) return;
      connection.sendMedia(chunk);
    },
    close() {
      try {
        if (connection.readyState === WebSocket.OPEN) {
          connection.sendCloseStream({ type: "CloseStream" });
        }
      } catch {
        // The socket may already be closing.
      }
      connection.close();
    },
  };
}

function readResults(data: unknown): { text: string; isFinal: boolean } | null {
  if (!isResultsMessage(data)) return null;
  const text = data.channel?.alternatives?.[0]?.transcript ?? "";
  return { text, isFinal: Boolean(data.is_final) };
}

function isResultsMessage(data: unknown): data is ResultsMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    "type" in data &&
    (data as { type: unknown }).type === "Results"
  );
}
