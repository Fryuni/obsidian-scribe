#!./node_modules/.bin/zx

import { readFileSync, writeFileSync } from "node:fs";
import { $, question } from "zx";
import * as semver from "semver";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
console.log("Current version:", packageJson.version);
const suggestedNextVersion = semver.inc(packageJson.version, "patch");
console.log("Suggested next version:", suggestedNextVersion);

const targetVersion =
	(await question(
		`Enter target version (default: ${suggestedNextVersion}): `,
	)) || suggestedNextVersion;

// update package.json with target version
packageJson.version = targetVersion;
writeFileSync("package.json", JSON.stringify(packageJson, null, "\t"));

// read minAppVersion from manifest.json and bump version to target version
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, "\t"));

// update versions.json with target version and minAppVersion from manifest.json
const versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[targetVersion] = minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, "\t"));

// Update lockfile
await $`pnpm install`;

// Add changes to git
await $`git add package.json pnpm-lock.yaml manifest.json versions.json`;

// Commit changes
await $`git commit -m "v${targetVersion}" -- package.json pnpm-lock.yaml manifest.json versions.json`;

await $`git tag ${targetVersion} --sign --message "Release v${targetVersion}"`;

await $`git push --tags`;
