#!/usr/bin/env node
/**
 * Safely writes generated content to the correct output.md file.
 * - Resolves prompt files to their corresponding outputs via scripts/output-map.json
 * - Creates a hidden timestamped backup before overwriting
 * - Writes atomically to avoid partial updates
 *
 * Usage examples:
 *   node scripts/write-output.ts --prompt dev-resources/implementation/prompt.md --source tmp/plan.md
 *   cat tmp/architecture.md | node scripts/write-output.ts --prompt dev-resources/architecture/prompt.md
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const outputMap: OutputMap = require('./output-map.json');

const __filename: string = fileURLToPath(import.meta.url);
const __dirname: string = path.dirname(__filename);
const repoRoot: string = path.resolve(__dirname, '..');

interface Options {
  prompt?: string;
  source?: string;
  text?: string;
  help?: boolean;
}

interface OutputMap {
  [key: string]: string;
}

interface OutputPathResult {
  outputRelative: string;
  outputAbsolute: string;
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

function parseArgs(argv: string[]): Options {
  const options: Options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg: string = argv[i];
    switch (arg) {
      case '--prompt':
        options.prompt = argv[++i];
        break;
      case '--source':
        options.source = argv[++i];
        break;
      case '--text':
        options.text = argv[++i];
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default: {
        if (arg.startsWith('--')) {
          throw new Error(`Unknown option "${arg}". Use --help for usage.`);
        }
        // Allow passing prompt path as positional argument for convenience.
        if (!options.prompt) {
          options.prompt = arg;
        } else if (!options.source) {
          options.source = arg;
        } else {
          throw new Error(`Unexpected positional argument "${arg}".`);
        }
      }
    }
  }
  return options;
}

function printHelp(): void {
  const helpText = `
Usage:
  node scripts/write-output.ts --prompt <prompt-path> [--source <file> | --text "<content>"]
  cat file.md | node scripts/write-output.ts --prompt <prompt-path>

Options:
  --prompt   Path to the prompt or instruction file whose output should be updated.
  --source   Optional path to a file containing the content to write.
  --text     Optional literal text content. Use quotes to preserve spacing.
  --help     Show this help message.

If neither --source nor --text is provided, the script reads from stdin.
`;
  console.log(helpText.trim());
}

async function readContent(options: Options): Promise<string> {
  if (options.text) {
    return options.text;
  }

  if (options.source) {
    const absoluteSource: string = path.resolve(repoRoot, options.source);
    return fs.promises.readFile(absoluteSource, 'utf8');
  }

  if (!process.stdin.isTTY) {
    return new Promise<string>((resolve, reject) => {
      let data = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (chunk: string) => {
        data += chunk;
      });
      process.stdin.on('end', () => resolve(data));
      process.stdin.on('error', reject);
    });
  }

  throw new Error(
    'No content provided. Use --source, --text, or pipe input via stdin.',
  );
}

function resolvePrompt(promptInput?: string): string {
  if (!promptInput) {
    throw new Error('Missing required --prompt argument.');
  }
  const absolutePrompt: string = path.resolve(repoRoot, promptInput);
  const relativePrompt: string = path.relative(repoRoot, absolutePrompt);
  const normalizedPrompt: string = normalizePath(relativePrompt);
  return normalizedPrompt;
}

function getOutputPath(promptKey: string): OutputPathResult {
  const outputRelative: string | undefined = outputMap[promptKey];
  if (!outputRelative) {
    const availableKeys: string = Object.keys(outputMap)
      .map((key: string) => `  - ${key}`)
      .join('\n');
    throw new Error(
      `No output mapping found for "${promptKey}".\nAvailable prompt keys:\n${availableKeys}`,
    );
  }
  const outputAbsolute: string = path.resolve(repoRoot, outputRelative);
  return { outputRelative, outputAbsolute };
}

function backupIfNeeded(outputAbsolute: string): string | null {
  if (!fs.existsSync(outputAbsolute)) {
    return null;
  }
  const timestamp: string = new Date().toISOString().replace(/[:]/g, '-');
  const outputDir: string = path.dirname(outputAbsolute);
  const baseName: string = path.basename(outputAbsolute);
  const backupName = `.${baseName}.${timestamp}.bak`;
  const backupPath: string = path.join(outputDir, backupName);
  fs.copyFileSync(outputAbsolute, backupPath);
  return normalizePath(path.relative(repoRoot, backupPath));
}

function writeAtomically(outputAbsolute: string, content: string): void {
  const outputDir: string = path.dirname(outputAbsolute);
  fs.mkdirSync(outputDir, { recursive: true });
  const tempName = `.${path.basename(outputAbsolute)}.${process.pid}.${Date.now()}.tmp`;
  const tempPath: string = path.join(outputDir, tempName);
  fs.writeFileSync(tempPath, content, 'utf8');
  fs.renameSync(tempPath, outputAbsolute);
}

async function main(): Promise<void> {
  try {
    const options: Options = parseArgs(process.argv.slice(2));
    if (options.help) {
      printHelp();
      return;
    }

    const promptKey: string = resolvePrompt(options.prompt);
    const { outputRelative, outputAbsolute }: OutputPathResult =
      getOutputPath(promptKey);
    const content: string = await readContent(options);

    const backupPath: string | null = backupIfNeeded(outputAbsolute);
    writeAtomically(outputAbsolute, content);

    const bytes: number = Buffer.byteLength(content, 'utf8');
    const messageParts: string[] = [
      `Updated ${outputRelative} (${bytes} bytes)`,
      backupPath
        ? `backup saved to ${backupPath}`
        : 'no previous file to back up',
    ];
    console.log(`[write-output] ${messageParts.join('; ')}`);
  } catch (error) {
    const errorMessage: string =
      error instanceof Error ? error.message : String(error);
    console.error(`[write-output] ${errorMessage}`);
    process.exitCode = 1;
  }
}

main();
