import * as NodeOS from "node:os";

import type { GeminiSettings } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";

import { expandHomePath } from "../../pathExpansion.ts";

export const resolveGeminiHomePath = Effect.fn("resolveGeminiHomePath")(function* (
  config: Pick<GeminiSettings, "homePath">,
): Effect.fn.Return<string, never, Path.Path> {
  const path = yield* Path.Path;
  const homePath = config.homePath.trim();
  return path.resolve(homePath.length > 0 ? expandHomePath(homePath) : NodeOS.homedir());
});

export const makeGeminiEnvironment = Effect.fn("makeGeminiEnvironment")(function* (
  config: Pick<GeminiSettings, "homePath">,
  baseEnv: NodeJS.ProcessEnv = process.env,
): Effect.fn.Return<NodeJS.ProcessEnv, never, Path.Path> {
  const homePath = config.homePath.trim();
  if (homePath.length === 0) return baseEnv;
  const resolvedHomePath = yield* resolveGeminiHomePath(config);
  return {
    ...baseEnv,
    HOME: resolvedHomePath,
  };
});

export const makeGeminiContinuationGroupKey = Effect.fn("makeGeminiContinuationGroupKey")(
  function* (config: Pick<GeminiSettings, "homePath">): Effect.fn.Return<string, never, Path.Path> {
    const resolvedHomePath = yield* resolveGeminiHomePath(config);
    return `gemini:home:${resolvedHomePath}`;
  },
);
