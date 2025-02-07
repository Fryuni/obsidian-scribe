import { normalizePath } from "obsidian";
import type ScribePlugin from "src";

export async function getDefaultPathSettings(plugin: ScribePlugin) {
	const fileManager = plugin.app.fileManager;

	const defaultNewFilePath = normalizePath(
		fileManager.getNewFileParent("", "").path,
	);

	const uniqueFileName = Date.now();
	const attachmentPathWithFileName = (
		await fileManager.getAvailablePathForAttachment(
			uniqueFileName.toString(),
		)
	).split("/");

	const defaultNewResourcePath = normalizePath(
		attachmentPathWithFileName
			.splice(0, attachmentPathWithFileName.length - 1)
			.join("/"),
	);

	return {
		defaultNewFilePath,
		defaultNewResourcePath,
	};
}
