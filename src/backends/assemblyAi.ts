import { AssemblyAI, type TranscribeParams } from "assemblyai";

export async function transcribeAudioWithAssemblyAi(
	apiKey: string,
	audioFilePath: ArrayBuffer,
): Promise<string> {
	const client = new AssemblyAI({
		apiKey,
	});

	const params: TranscribeParams = {
		audio: audioFilePath,
		format_text: true,
	};

	const transcript = await client.transcripts.transcribe(params);

	if (transcript.error) {
		console.error(
			"Failed to transcribe with AssemblyAI, please try again",
			transcript.error,
		);
		throw new Error(transcript.error);
	}

	return transcript.text || "";
}
