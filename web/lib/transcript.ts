export function combineTranscript(finals: string, interim: string): string {
  return [finals.trim(), interim.trim()].filter(Boolean).join(" ").trim();
}

export function applyTranscriptPiece(
  finals: string,
  text: string,
  isFinal: boolean,
): { finals: string; interim: string } {
  if (isFinal) {
    return {
      finals: text.trim() ? combineTranscript(finals, text) : finals,
      interim: "",
    };
  }
  return { finals, interim: text };
}
