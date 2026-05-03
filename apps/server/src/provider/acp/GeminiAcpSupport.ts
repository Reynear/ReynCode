import { parseCliArgs } from "@t3tools/shared/cliArgs";
import { type GeminiSettings, type ProviderOptionSelection } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Scope from "effect/Scope";
import { ChildProcessSpawner } from "effect/unstable/process";
import type * as EffectAcpErrors from "effect-acp/errors";

import {
  AcpSessionRuntime,
  type AcpSessionRuntimeOptions,
  type AcpSessionRuntimeShape,
  type AcpSpawnInput,
} from "./AcpSessionRuntime.ts";

function flattenParsedCliArgs(value: ReturnType<typeof parseCliArgs>): ReadonlyArray<string> {
  const args: string[] = [...value.positionals];
  for (const [key, flagValue] of Object.entries(value.flags)) {
    args.push(`--${key}`);
    if (flagValue !== null) {
      args.push(flagValue);
    }
  }
  return args;
}

type GeminiAcpRuntimeSettings = Pick<GeminiSettings, "binaryPath" | "homePath" | "launchArgs">;

export interface GeminiAcpRuntimeInput extends Omit<
  AcpSessionRuntimeOptions,
  "authMethodId" | "clientCapabilities" | "spawn"
> {
  readonly childProcessSpawner: ChildProcessSpawner.ChildProcessSpawner["Service"];
  readonly geminiSettings: GeminiAcpRuntimeSettings | null | undefined;
  readonly environment?: NodeJS.ProcessEnv;
}

export interface GeminiAcpModelSelectionErrorContext {
  readonly cause: EffectAcpErrors.AcpError;
  readonly step: "set-model";
}

export function buildGeminiAcpSpawnInput(
  geminiSettings: GeminiAcpRuntimeSettings | null | undefined,
  cwd: string,
  environment?: NodeJS.ProcessEnv,
): AcpSpawnInput {
  return {
    command: geminiSettings?.binaryPath || "gemini",
    args: [...flattenParsedCliArgs(parseCliArgs(geminiSettings?.launchArgs ?? "")), "--acp"],
    cwd,
    ...(environment ? { env: environment } : {}),
  };
}

function resolveGeminiAuthMethodId(environment: NodeJS.ProcessEnv | undefined): string {
  return environment?.GEMINI_API_KEY ? "gemini-api-key" : "oauth-personal";
}

export const makeGeminiAcpRuntime = (
  input: GeminiAcpRuntimeInput,
): Effect.Effect<AcpSessionRuntimeShape, EffectAcpErrors.AcpError, Scope.Scope> =>
  Effect.gen(function* () {
    const acpContext = yield* Layer.build(
      AcpSessionRuntime.layer({
        ...input,
        spawn: buildGeminiAcpSpawnInput(input.geminiSettings, input.cwd, input.environment),
        authMethodId: resolveGeminiAuthMethodId(input.environment),
      }).pipe(
        Layer.provide(
          Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, input.childProcessSpawner),
        ),
      ),
    );
    return yield* Effect.service(AcpSessionRuntime).pipe(Effect.provide(acpContext));
  });

export function resolveGeminiAcpModelId(model: string | null | undefined): string {
  const trimmed = model?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "gemini-3.1-pro-preview";
}

interface GeminiAcpModelSelectionRuntime {
  readonly setModel: (model: string) => Effect.Effect<unknown, EffectAcpErrors.AcpError>;
}

export function applyGeminiAcpModelSelection<E>(input: {
  readonly runtime: GeminiAcpModelSelectionRuntime;
  readonly model: string | null | undefined;
  readonly selections: ReadonlyArray<ProviderOptionSelection> | null | undefined;
  readonly mapError: (context: GeminiAcpModelSelectionErrorContext) => E;
}): Effect.Effect<void, E> {
  void input.runtime;
  void input.model;
  void input.selections;
  void input.mapError;
  return Effect.void;
}
