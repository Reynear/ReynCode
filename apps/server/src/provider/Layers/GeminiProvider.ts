import {
  type GeminiSettings,
  type ModelCapabilities,
  ProviderDriverKind,
  type ServerProviderModel,
} from "@t3tools/contracts";
import { createModelCapabilities } from "@t3tools/shared/model";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import {
  buildServerProvider,
  collectStreamAsString,
  isCommandMissingCause,
  parseGenericCliVersion,
  providerModelsFromSettings,
  type CommandResult,
  type ServerProviderDraft,
} from "../providerSnapshot.ts";

const PROVIDER = ProviderDriverKind.make("gemini");
const GEMINI_PRESENTATION = {
  displayName: "Gemini",
  badgeLabel: "Experimental",
  showInteractionModeToggle: true,
} as const;
const EMPTY_CAPABILITIES: ModelCapabilities = createModelCapabilities({
  optionDescriptors: [],
});

const GEMINI_BUILT_IN_MODELS: ReadonlyArray<ServerProviderModel> = [
  {
    slug: "gemini-3.1-pro-preview",
    name: "Gemini 3.1 Pro",
    isCustom: false,
    capabilities: EMPTY_CAPABILITIES,
  },
  {
    slug: "gemini-3-flash-preview",
    name: "Gemini 3 Flash",
    isCustom: false,
    capabilities: EMPTY_CAPABILITIES,
  },
  {
    slug: "gemini-3.1-flash-lite-preview",
    name: "Gemini 3.1 Flash Lite",
    isCustom: false,
    capabilities: EMPTY_CAPABILITIES,
  },
];

export function getGeminiFallbackModels(
  geminiSettings: Pick<GeminiSettings, "customModels">,
): ReadonlyArray<ServerProviderModel> {
  return providerModelsFromSettings(
    GEMINI_BUILT_IN_MODELS,
    PROVIDER,
    geminiSettings.customModels,
    EMPTY_CAPABILITIES,
  );
}

export const makePendingGeminiProvider = (
  geminiSettings: GeminiSettings,
): Effect.Effect<ServerProviderDraft> =>
  Effect.gen(function* () {
    const checkedAt = yield* Effect.map(DateTime.now, DateTime.formatIso);
    const models = getGeminiFallbackModels(geminiSettings);

    if (!geminiSettings.enabled) {
      return buildServerProvider({
        presentation: GEMINI_PRESENTATION,
        enabled: false,
        checkedAt,
        models,
        probe: {
          installed: false,
          version: null,
          status: "warning",
          auth: { status: "unknown" },
          message: "Gemini is disabled in T3 Code settings.",
        },
      });
    }

    return buildServerProvider({
      presentation: GEMINI_PRESENTATION,
      enabled: true,
      checkedAt,
      models,
      probe: {
        installed: true,
        version: null,
        status: "warning",
        auth: { status: "unknown" },
        message: "Checking Gemini CLI availability...",
      },
    });
  });

const runGeminiCommand = (
  geminiSettings: GeminiSettings,
  args: ReadonlyArray<string>,
  environment: NodeJS.ProcessEnv = process.env,
) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const command = ChildProcess.make(geminiSettings.binaryPath, [...args], {
      env: environment,
      shell: process.platform === "win32",
    });

    const child = yield* spawner.spawn(command);
    const [stdout, stderr, exitCode] = yield* Effect.all(
      [
        collectStreamAsString(child.stdout),
        collectStreamAsString(child.stderr),
        child.exitCode.pipe(Effect.map(Number)),
      ],
      { concurrency: "unbounded" },
    );

    return { stdout, stderr, code: exitCode } satisfies CommandResult;
  }).pipe(Effect.scoped);

function parseGeminiVersionOutput(result: CommandResult): string | null {
  return parseGenericCliVersion(`${result.stdout}\n${result.stderr}`);
}

function geminiVersionFailureMessage(error: Error): string {
  return isCommandMissingCause(error)
    ? "Gemini CLI (`gemini`) is not installed or not on PATH."
    : `Failed to execute Gemini CLI health check: ${error.message}.`;
}

export const checkGeminiProviderStatus = Effect.fn("checkGeminiProviderStatus")(function* (
  geminiSettings: GeminiSettings,
  environment: NodeJS.ProcessEnv = process.env,
): Effect.fn.Return<ServerProviderDraft, never, ChildProcessSpawner.ChildProcessSpawner> {
  const checkedAt = DateTime.formatIso(yield* DateTime.now);
  const models = getGeminiFallbackModels(geminiSettings);

  if (!geminiSettings.enabled) {
    return buildServerProvider({
      presentation: GEMINI_PRESENTATION,
      enabled: false,
      checkedAt,
      models,
      probe: {
        installed: false,
        version: null,
        status: "warning",
        auth: { status: "unknown" },
        message: "Gemini is disabled in T3 Code settings.",
      },
    });
  }

  const versionProbe = yield* runGeminiCommand(geminiSettings, ["--version"], environment).pipe(
    Effect.timeoutOption(4_000),
    Effect.result,
  );

  if (Result.isFailure(versionProbe)) {
    const error = versionProbe.failure;
    return buildServerProvider({
      presentation: GEMINI_PRESENTATION,
      enabled: geminiSettings.enabled,
      checkedAt,
      models,
      probe: {
        installed: !isCommandMissingCause(error),
        version: null,
        status: "error",
        auth: { status: "unknown" },
        message: geminiVersionFailureMessage(error),
      },
    });
  }

  if (Option.isNone(versionProbe.success)) {
    return buildServerProvider({
      presentation: GEMINI_PRESENTATION,
      enabled: geminiSettings.enabled,
      checkedAt,
      models,
      probe: {
        installed: true,
        version: null,
        status: "error",
        auth: { status: "unknown" },
        message: "Gemini CLI is installed but timed out while running `gemini --version`.",
      },
    });
  }

  return buildServerProvider({
    presentation: GEMINI_PRESENTATION,
    enabled: geminiSettings.enabled,
    checkedAt,
    models,
    probe: {
      installed: true,
      version: parseGeminiVersionOutput(versionProbe.success.value),
      status: "ready",
      auth: { status: "unknown" },
    },
  });
});
