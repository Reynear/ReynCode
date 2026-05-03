/**
 * GeminiAdapter — shape type for the Gemini provider adapter.
 *
 * Gemini instances are constructed by {@link ../Drivers/GeminiDriver}; this
 * module keeps the adapter contract named without introducing a singleton
 * Effect service tag.
 *
 * @module GeminiAdapter
 */
import type { ProviderAdapterError } from "../Errors.ts";
import type { ProviderAdapterShape } from "./ProviderAdapter.ts";

export interface GeminiAdapterShape extends ProviderAdapterShape<ProviderAdapterError> {}
