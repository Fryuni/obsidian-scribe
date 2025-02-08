import { v2 } from '@google-cloud/speech';
import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from '@google/generative-ai';
import { ChatGoogleGenerativeAI, type GoogleGenerativeAIChatInput } from '@langchain/google-genai';
import { keyedMemoized } from 'src/util/memo';
import { LLM_MODELS } from './shared';
import { SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';

const getSpeechClient = keyedMemoized('Vertex AI Service Account', credentials => new v2.SpeechClient({
	credentials: JSON.parse(credentials),
}));

const getGenerativeAiClient = keyedMemoized('Generative AI API Key', apiKey => new GoogleGenerativeAI(apiKey));

export async function transcribeAudioWithVertexAi(
	credentials: string,
	audioBuffer: ArrayBuffer,
): Promise<string> {
	const client = getSpeechClient(credentials);

	const [response] = await client.recognize({
		recognizer: `projects/${await client.getProjectId()}/locations/us-central1/recognizers/_`,
		content: new Uint8Array(audioBuffer),
		config: {
			model: 'chirp_2',
			features: { enableAutomaticPunctuation: true, },
			languageCodes: ['en-US', 'pt-BR'],
			autoDecodingConfig: {},
		},
	});

	if (!response.results) {
		throw new Error('Failed to transcribe audio.');
	}

	const rawTranscript = response.results
		.map(result => result.alternatives?.[0].transcript || '')
		.join(' ');

	return rawTranscript.replace(/(\s)\1+/g, '$1').trim();
}

export async function summarizeTranscriptWithGemini(
	apiKey: string,
	transcript: string,
	llmModel: LLM_MODELS = LLM_MODELS["gemini-2.0-flash"],
) {
	const systemPrompt = `
  You are "Scribe" an expert note-making AI for Obsidian you specialize in the Linking Your Thinking (LYK) strategy.  
  The following is the transcription generated from a recording of someone talking aloud or multiple people in a conversation. 
  There may be a lot of random things said given fluidity of conversation or thought process and the microphone's ability to pick up all audio.  

  The transcription may address you by calling you "Scribe" or saying "Hey Scribe" and asking you a question, they also may just allude to you by asking "you" to do something.
  Give them the answers to this question

  Give me notes in Markdown language on what was said, they should be
  - Easy to understand
  - Succinct
  - Clean
  - Logical
  - Insightful

  It will be nested under a h2 # tag, feel free to nest headers underneath it
  Rules:
  - Do not include escaped new line characters
  - Do not mention "the speaker" anywhere in your response.  
  - The notes should be written as if I were writing them. 
  - The notes should be written in either English or Portuguese, matching the language of the transcript.

  The following is the transcribed audio:
  <transcript>
  ${transcript}
  </transcript>

  `;
	const model = new ChatGoogleGenerativeAI({
		model: llmModel,
		apiKey: apiKey,
		...getModelOptions(llmModel),
	});
	const messages = [new SystemMessage(systemPrompt)];

	const noteSummary = z.object({
		summary: z.string().describe(
			`A summary of the transcript in Markdown.  It will be nested under a h2 # tag, so use a tag less than that for headers
         Concise bullet points containing the primary points of the speaker
        `,
		),
		insights: z.string().describe(
			`Insights that you gained from the transcript in Markdown.
        A brief section, a paragraph or two on what insights and enhancements you think of
        Several bullet points on things you think would be an improvement, feel free to use headers
        It will be nested under an h2 tag, so use a tag less than that for headers
        `,
		),
		mermaidChart: z.string().describe(
			`A valid unicode mermaid chart that shows a concept map consisting of both what insights you had along with what the speaker said for the mermaid chart, 
        Dont wrap it in anything, just output the mermaid chart.  
        Do not use any special characters that arent letters in the nodes text, particularly new lines, tabs, or special characters like apostraphes or quotes or commas`,
		),
		answeredQuestions: z
			.string()
			.nullable()
			.describe(
				`If the user says "Hey Scribe" or alludes to you, asking you to do something, answer the question or do the ask and put the answers here
        Put the text in markdown, it will be nested under an h2 tag, so use a tag less than that for headers
        Summarize the question in a short sentence as a header and format place your reply nicely below for as many questions as there are
        Answer their questions in a clear and concise manner
      `,
			),
		title: z
			.string()
			.describe(
				"A suggested title for the Obsidian Note. Ensure that it is in the proper format for a file on mac, windows and linux, do not include any special characters",
			),
	});
	const structuredLlm = model.withStructuredOutput(noteSummary);
	const result = await structuredLlm.invoke(messages);

	return result;
}

function getModelOptions(model: LLM_MODELS): Partial<GoogleGenerativeAIChatInput> {
	switch (model) {
		case LLM_MODELS["gemini-2.0-flash"]:
		case LLM_MODELS["gemini-2.0-flash-lite-preview"]:
		case LLM_MODELS["gemini-2.0-flash-thinking-exp"]:
		case LLM_MODELS["gemini-2.0-pro-exp"]:
			return { temperature: 0.5 };
		default:
			throw new Error(`${model} is not a supported Google Generative AI model.`);
	}
}
