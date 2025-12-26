/**
 * Routes Index
 *
 * Re-exports all route modules for clean imports in the main router.
 */

export { createAdminRoutes } from './admin'
export { createCacheRoutes } from './cache'
export { createImageRoutes } from './images'
export { createTestRoutes } from './test'
export { createJobApiRoutes, createWebSocketRoutes } from './websocket'
