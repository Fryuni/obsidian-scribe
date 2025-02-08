import { v2 } from "@google-cloud/speech";
import {
	FunctionCallingMode,
	GoogleGenerativeAI,
	ModelParams,
	SchemaType,
} from "@google/generative-ai";
import {
	ChatGoogleGenerativeAI,
	type GoogleGenerativeAIChatInput,
} from "@langchain/google-genai";
import { keyedMemoized } from "src/util/memo";
import { LLM_MODELS } from "./shared";
import { SystemMessage } from "@langchain/core/messages";
import { Storage } from "@google-cloud/storage";
import { z } from "zod";
import zodToJsonSchema from "zod-to-json-schema";
import { randomUUID } from "node:crypto";

const getSpeechClient = keyedMemoized(
	"Vertex AI Service Account",
	(credentials) =>
		new v2.SpeechClient({
			apiEndpoint: `us-central1-speech.googleapis.com`,
			credentials: JSON.parse(credentials),
			projectId:
				JSON.parse(credentials)?.project_id || "lferraz-portfolio",
		}),
);

const getStorageClient = keyedMemoized(
	"Vertex AI Service Account",
	(credentials) =>
		new Storage({
			credentials: JSON.parse(credentials),
			projectId:
				JSON.parse(credentials)?.project_id || "lferraz-portfolio",
		}),
);

const getGenerativeAiClient = keyedMemoized(
	"Generative AI API Key",
	(apiKey) => new GoogleGenerativeAI(apiKey),
);

export async function transcribeAudioWithVertexAi(
	credentials: string,
	bucket: string,
	audioBuffer: ArrayBuffer,
): Promise<string> {
	const storage = getStorageClient(credentials);
	const speech = getSpeechClient(credentials);

	const file = storage.bucket(bucket).file(`${randomUUID()}.webm`);

	const stream = file.createWriteStream({ resumable: false });

	await new Promise<void>((resolve, reject) => {
		stream.write(new Uint8Array(audioBuffer), (err) => {
			if (err) return reject(err);
			resolve();
		});
	});

	await new Promise<void>((resolve) => stream.end(resolve));

	try {
		return await fastTrasncribe();
	} catch (error) {
		if (error.message.includes("Audio can be of a maximum of 60 seconds")) {
			return await longTranscribe();
		}

		throw error;
	} finally {
		await file.delete();
	}

	async function fastTrasncribe(): Promise<string> {
		const [response] = await speech.recognize({
			recognizer: `projects/${await speech.getProjectId()}/locations/us-central1/recognizers/_`,
			uri: `gs://${bucket}/${file.name}`,
			config: {
				model: "chirp_2",
				features: { enableAutomaticPunctuation: true },
				languageCodes: ["auto"],
				autoDecodingConfig: {},
			},
		});

		if (!response.results) {
			throw new Error("Failed to transcribe audio.");
		}

		const rawTranscript = response.results
			.map((result) => result.alternatives?.[0].transcript || "")
			.join(" ");

		return rawTranscript.replace(/(\s)\1+/g, "$1").trim();
	}

	async function longTranscribe(): Promise<string> {
		const audioUri = `gs://${bucket}/${file.name}`;

		const [operation] = await speech.batchRecognize({
			recognizer: `projects/${await speech.getProjectId()}/locations/us-central1/recognizers/_`,
			files: [{ uri: audioUri }],
			config: {
				model: "chirp_2",
				features: { enableAutomaticPunctuation: true },
				languageCodes: ["auto"],
				autoDecodingConfig: {},
			},
			recognitionOutputConfig: {
				inlineResponseConfig: {},
			},
		});

		const [response] = await operation.promise();

		if (!response.results?.[audioUri].transcript?.results) {
			throw new Error("Failed to transcribe audio.");
		}

		const rawTranscript = response.results?.[audioUri].transcript?.results
			.map((result) => result.alternatives?.[0].transcript || "")
			.join(" ");

		return rawTranscript.replace(/(\s)\1+/g, "$1").trim();
	}
}

export async function summarizeTranscriptWithGemini(
	apiKey: string,
	transcript: string,
	llmModel: LLM_MODELS = LLM_MODELS["gemini-2.0-flash"],
) {
	const systemPrompt = `
  You are "Vox" an expert note-making AI for Obsidian you specialize in the Linking Your Thinking (LYK) strategy.  
  The following is the transcription generated from a recording of someone talking aloud or multiple people in a conversation. 
  There may be a lot of random things said given fluidity of conversation or thought process and the microphone's ability to pick up all audio.  

  The transcription may address you by calling you "Vox" or saying "Hey Vox" and asking you a question, they also may just allude to you by asking "you" to do something.
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
  `;

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
				`If the user says "Hey Vox" or alludes to you, asking you to do something, answer the question or do the ask and put the answers here
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

	const model = getGenerativeAiClient(apiKey).getGenerativeModel({
		model: llmModel,
		...getModelOptions(llmModel),
	});

	const { response } = await model.generateContent({
		systemInstruction: systemPrompt,
		contents: [
			{
				role: "user",
				parts: [
					{
						text: `
The following is the transcribed audio:
<transcript>
${transcript}
</transcript>
`.trim(),
					},
				],
			},
		],
		// toolConfig: {
		// 	functionCallingConfig: {
		// 		mode: FunctionCallingMode.ANY,
		// 		allowedFunctionNames: ['submit'],
		// 	},
		// },
		generationConfig: {
			responseMimeType: "application/json",
			responseSchema: {
				type: SchemaType.OBJECT,
				properties: {
					summary: {
						type: SchemaType.STRING,
						description:
							"A summary of the transcript in Markdown. " +
							"It will be nested under a h2 # tag, so use a " +
							"tag less than that for headers.\n" +
							"Concise bullet points containing the primary points of the speaker",
					},
					insights: {
						type: SchemaType.STRING,
						description:
							`Insights that you gained from the transcript in Markdown.
A brief section, a paragraph or two on what insights and enhancements you think of
Several bullet points on things you think would be an improvement, feel free to use headers
It will be nested under an h2 tag, so use a tag less than that for headers
        `.trim(),
					},
					mermaidChart: {
						type: SchemaType.STRING,
						description: `A valid unicode mermaid chart that shows a concept map consisting of both what insights you had along with what the speaker said for the mermaid chart, 
Dont wrap it in anything, just output the mermaid chart.  
Do not use any special characters that arent letters in the nodes text, particularly new lines, tabs, or special characters like apostraphes or quotes or commas`,
					},
					answeredQuestions: {
						type: SchemaType.STRING,
						nullable: true,
						description: `If the user says "Hey Vox" or alludes to you, asking you to do something, answer the question or do the ask and put the answers here
        Put the text in markdown, it will be nested under an h2 tag, so use a tag less than that for headers
        Summarize the question in a short sentence as a header and format place your reply nicely below for as many questions as there are
        Answer their questions in a clear and concise manner
      `,
					},
					title: {
						type: SchemaType.STRING,
						description:
							"A suggested title for the Obsidian Note. Ensure that it is in the proper format for a file on mac, windows and linux, do not include any special characters",
					},
				},
			},
		},
	});

	const result = noteSummary.parse(JSON.parse(response.text()));

	// const model = new ChatGoogleGenerativeAI({
	// 	model: llmModel,
	// 	apiKey: apiKey,
	// 	...getModelOptions(llmModel),
	// });
	// const messages = [new SystemMessage(systemPrompt)];
	//
	// const structuredLlm = model.withStructuredOutput(noteSummary);
	// const result = await structuredLlm.invoke(messages);

	return result;
}

function getModelOptions(model: LLM_MODELS): Partial<ModelParams> {
	switch (model) {
		case LLM_MODELS["gemini-2.0-flash"]:
		case LLM_MODELS["gemini-2.0-flash-lite-preview"]:
		case LLM_MODELS["gemini-2.0-flash-thinking-exp"]:
		case LLM_MODELS["gemini-2.0-pro-exp"]:
			return {
				generationConfig: {
					temperature: 0.5,
				},
			};
		default:
			throw new Error(
				`${model} is not a supported Google Generative AI model.`,
			);
	}
}
