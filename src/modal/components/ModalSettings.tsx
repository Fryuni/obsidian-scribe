import type ScribePlugin from "src";
import { useEffect, useState } from "react";
import { LLM_MODELS } from "src/util/openAiUtils";
import { TRANSCRIPT_PLATFORM } from "src/settings/settings";

export const ModalSettings = ({ plugin }: { plugin: ScribePlugin }) => {
	// State for each setting
	const [llmModel, setLlmModel] = useState(plugin.settings.llmModel);
	const [transcriptPlatform, setTranscriptPlatform] = useState(
		plugin.settings.transcriptPlatform,
	);

	// Handle change for LLM Model Dropdown
	const handleLLMModelChange = async (value: LLM_MODELS) => {
		setLlmModel(value);
		// Assuming a method to update and save plugin settings
	};

	// Handle change for Transcript Platform Dropdown
	const handleTranscriptPlatformChange = async (
		value: TRANSCRIPT_PLATFORM,
	) => {
		setTranscriptPlatform(value);
		// Assuming a method to update and save plugin settings
	};

	// Effect to save settings when they change
	useEffect(() => {
		const saveSettings = async () => {
			plugin.settings.llmModel = llmModel;
			plugin.settings.transcriptPlatform = transcriptPlatform;
			await plugin.saveSettings();
		};

		saveSettings();
	}, [llmModel, transcriptPlatform, plugin]);

	return (
		<div>
			<div>
				<label htmlFor="llmModelSelect">
					LLM model for creating the summary
				</label>
				<select
					id="llmModelSelect"
					value={llmModel}
					onChange={(e) =>
						handleLLMModelChange(e.target.value as LLM_MODELS)
					}
				>
					{Object.keys(LLM_MODELS).map((model) => (
						<option key={model} value={model}>
							{model}
						</option>
					))}
				</select>
			</div>

			<div>
				<label htmlFor="transcriptPlatformSelect">
					Transcript platform
				</label>
				<select
					id="transcriptPlatformSelect"
					value={transcriptPlatform}
					onChange={(e) =>
						handleTranscriptPlatformChange(
							e.target.value as TRANSCRIPT_PLATFORM,
						)
					}
				>
					{Object.keys(TRANSCRIPT_PLATFORM).map((platform) => (
						<option key={platform} value={platform}>
							{platform}
						</option>
					))}
				</select>
			</div>
		</div>
	);
};
