/**
 * OpenAPI Module Exports
 *
 * Central export point for all OpenAPI-related configuration and types.
 */

export type { OpenAPIConfig } from './config'
export { openAPIConfig } from './config'

export {
  createExtensions,
  type FeatureExtension,
  type NotesExtension,
  type OpenAPIExtensions,
  type RateLimitExtension,
  type VersionExtension,
} from './extensions'
