/**
 * This was heavily inspired by
 * https://github.com/drewmcdonald/obsidian-magic-mic
 * Thank you for traversing this in such a clean way
 */
import OpenAI from 'openai';
import audioDataToChunkedFiles from './audioDataToChunkedFiles';
import type { FileLike } from 'openai/uploads';
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

import { JsonOutputParser } from '@langchain/core/output_parsers';
import { Notice } from 'obsidian';

export enum LLM_MODELS {
  'gpt-4o-mini' = 'gpt-4o-mini',
  'gpt-4o' = 'gpt-4o',
  'gpt-4-turbo' = 'gpt-4-turbo',
}

const MAX_CHUNK_SIZE = 25 * 1024 * 1024;

export async function chunkAndTranscribeAudioBuffer(
  openAiKey: string,
  audioBuffer: ArrayBuffer,
) {
  const openAiClient = new OpenAI({
    apiKey: openAiKey,
    dangerouslyAllowBrowser: true,
  });
  const audioFiles = await audioDataToChunkedFiles(audioBuffer, MAX_CHUNK_SIZE);
  new Notice(`Scribe: 🎧 Split Transcript into ${audioFiles.length} Files`);

  const transcript = await transcribeAudio(openAiClient, {
    audioFiles,
  });

  return transcript;
}

/**
 * Transcribe an audio file with OpenAI's Whisper model
 *
 * Handles splitting the file into chunks, processing each chunk, and
 * concatenating the results.
 */

interface TranscriptionOptions {
  audioFiles: FileLike[];
  onChunkStart?: (i: number, totalChunks: number) => void;
}

async function transcribeAudio(
  client: OpenAI,
  { audioFiles, onChunkStart }: TranscriptionOptions,
): Promise<string> {
  let transcript = '';
  for (const [i, file] of audioFiles.entries()) {
    if (onChunkStart) onChunkStart(i, audioFiles.length);
    const res = await client.audio.transcriptions.create({
      model: 'whisper-1',
      file,
    });
    const sep = i === 0 ? '' : ' ';
    transcript += sep + res.text.trim();
  }
  return transcript;
}

export interface LLMSummary {
  summary: string;
  title: string;
  insights: string;
  mermaidChart: string;
  answeredQuestions?: string;
}
export async function summarizeTranscript(
  openAiKey: string,
  transcript: string,
  llmModel: LLM_MODELS = LLM_MODELS['gpt-4o'],
) {
  const systemPrompt = `
  You are "Scribe" an expert note-making AI for Obsidian you specialize in the Linking Your Thinking (LYK) strategy.  
  The following is the transcription generated from a recording of someone talking aloud or multiple people in a conversation. 
  There may be a lot of random things said given fluidity of conversation or thought process and the microphone's ability to pick up all audio.  

  The transcription may address you by calling you "Scribe" and asking you a question, they also may just allude to you by asking "you" to do something

  Give me notes in Markdown language on what was said, they should be
  - Easy to understand
  - Succinct
  - Clean
  - Logical
  - Insightful

  It will be nested under a h1 # tag, feel free to nest headers underneath it
  Rules:
  - Do not include escaped new line characters
  - Do not mention "the speaker" anywhere in your response.  
  - The notes should be written as if I were writing them. 

  The following is the transcribed audio:
  <transcript>
  ${transcript}
  </transcript>

  
  `;
  const model = new ChatOpenAI({
    model: llmModel,
    apiKey: openAiKey,
    temperature: 0.5,
  });
  const messages = [new SystemMessage(systemPrompt)];

  const noteSummary = z.object({
    summary: z.string().describe(
      `A summary of the transcript in Markdown.  It will be nested under a h1 # tag, so have no other headers that are greater than or equal to a h2 ## 
         Concise bullet points containing the primary points of the speaker
        `,
    ),
    insights: z.string().describe(
      `Insights that you gained from the transcript.
        A brief section, a paragraph or two on what insights and enhancements you think of
        Several bullet points on things you think would be an improvement
        `,
    ),
    mermaidChart: z.string().describe(
      `A valid unicode mermaid chart that shows a concept map consisting of both what insights you had along with what the speaker said for the mermaid chart, 
        Dont wrap it in anything, just output the mermaid chart.  
        Do not use any special characters that arent letters in the nodes text`,
    ),
    answeredQuestions: z
      .string()
      .optional()
      .describe(
        `If the user says "Scribe" or alludes to you, asking you to do something, answer the question or do the ask and put the answers here
        Put the text in markdown, it will be nested under an h1 tag
        Summarize the question in a short sentence as a header and format the reply nicely below for as many questions as there are
      `,
      ),
    title: z
      .string()
      .describe(
        'A suggested title for the Obsidian Note. Ensure that it is in the proper format for a file on mac, windows and linux',
      ),
  });
  const structuredLlm = model.withStructuredOutput(noteSummary);
  const result = (await structuredLlm.invoke(messages)) as LLMSummary;

  return await result;
}

export async function llmFixMermaidChart(
  openAiKey: string,
  brokenMermaidChart: string,
  llmModel: LLM_MODELS = LLM_MODELS['gpt-4o'],
) {
  const systemPrompt = `
You are an expert in mermaid charts and Obsidian (the note taking app)
Below is a <broken-mermaid-chart> that isn't rendering correctly in Obsidian
There may be some new line characters, or tab characters, or special characters.  
Strip them out and only return a fully valid unicode Mermaid chart that will render properly in Obsidian
Remove any special characters in the nodes text that isn't valid.

<broken-mermaid-chart>
${brokenMermaidChart}
</broken-mermaid-chart>

Thank you
  `;
  const model = new ChatOpenAI({
    model: llmModel,
    apiKey: openAiKey,
    temperature: 0.3,
  });
  const messages = [new SystemMessage(systemPrompt)];
  const structuredOutput = z.object({
    mermaidChart: z.string().describe('A fully valid unicode mermaid chart'),
  });

  const structuredLlm = model.withStructuredOutput(structuredOutput);
  const { mermaidChart } = await structuredLlm.invoke(messages);

  return { mermaidChart };
}
