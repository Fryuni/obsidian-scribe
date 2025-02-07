export function extractMermaidChart(inputString: string): string | undefined {
	const mermaidRegex = /```mermaid\s+([\s\S]*?)```/g;
	const matches = mermaidRegex.exec(inputString);

	if (matches && matches.length > 1) {
		return matches[1];
	}

	return undefined;
}
