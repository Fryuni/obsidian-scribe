import { transcribeAudioWithAssemblyAi } from "./assemblyAi";
import { chunkAndTranscribeWithOpenAi, summarizeTranscriptWithOpenAi } from "./openAi";
import { summarizeTranscriptWithGemini, transcribeAudioWithVertexAi } from "./vertexAi";

export interface PlatformOptions {
	assemblyAiApiKey: string;
	openAiApiKey: string;
	geminiApiKey: string;
	vertexServiceAccount: string;
	transcriptPlatform: TRANSCRIPT_PLATFORM;
	llmModel: LLM_MODELS;
}

export enum TRANSCRIPT_PLATFORM {
	assemblyAi = "assemblyAi",
	openAi = "openAi",
	vertexAi = "vertexAi",
}

export function transcribeAudio(buffer: ArrayBuffer, options: PlatformOptions): Promise<string> {
	switch (options.transcriptPlatform) {
		case TRANSCRIPT_PLATFORM.assemblyAi:
			return transcribeAudioWithAssemblyAi(
				options.assemblyAiApiKey,
				buffer,
			);
		case TRANSCRIPT_PLATFORM.openAi:
			return chunkAndTranscribeWithOpenAi(
				options.openAiApiKey,
				buffer,
			);
		case TRANSCRIPT_PLATFORM.vertexAi:
			return transcribeAudioWithVertexAi(
				options.vertexServiceAccount,
				buffer,
			);
	}
}

export enum LLM_MODELS {
	"gpt-4o-mini" = "gpt-4o-mini",
	"gpt-4o" = "gpt-4o",
	"gpt-4-turbo" = "gpt-4-turbo",
	"o3-mini" = "o3-mini",

	"gemini-2.0-flash" = "gemini-2.0-flash",
	"gemini-2.0-flash-lite-preview" = "gemini-2.0-flash-lite-preview",
	"gemini-2.0-flash-thinking-exp" = "gemini-2.0-flash-thinking-exp",
	"gemini-2.0-pro-exp" = "gemini-2.0-pro-exp",
}

export interface LLMSummary {
	summary: string;
	title: string;
	insights: string;
	mermaidChart: string;
	answeredQuestions?: string;
}

export async function summarizeTranscript(
	transcript: string,
	options: PlatformOptions,
) {
	switch (options.llmModel) {
		case LLM_MODELS["gpt-4o-mini"]:
		case LLM_MODELS["gpt-4o"]:
		case LLM_MODELS["gpt-4-turbo"]:
		case LLM_MODELS["o3-mini"]:
			return summarizeTranscriptWithOpenAi(options.openAiApiKey, transcript, options.llmModel);
		case LLM_MODELS["gemini-2.0-flash"]:
		case LLM_MODELS["gemini-2.0-flash-lite-preview"]:
		case LLM_MODELS["gemini-2.0-flash-thinking-exp"]:
		case LLM_MODELS["gemini-2.0-pro-exp"]:
			return summarizeTranscriptWithGemini(options.geminiApiKey, transcript, options.llmModel);
	}
}
