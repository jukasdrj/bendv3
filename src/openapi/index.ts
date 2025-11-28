/**
 * OpenAPI Module Exports
 *
 * Central export point for all OpenAPI-related configuration and types.
 */

export { openAPIConfig } from './config'
export type { OpenAPIConfig } from './config'

export {
  createExtensions,
  type RateLimitExtension,
  type FeatureExtension,
  type VersionExtension,
  type NotesExtension,
  type OpenAPIExtensions
} from './extensions'
