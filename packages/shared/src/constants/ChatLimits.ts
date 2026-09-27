/**
 * Hard input limits for the AI chat surface.
 *
 * These bound the request before it reaches Workers AI. `ChatService` caps the
 * number of history turns (`CHAT_MAX_HISTORY_MESSAGES`) but nothing capped the
 * size of a single turn, so a caller could submit one enormous `content` field
 * (token/cost exhaustion) or set `role: 'system'` (prompt injection). The API
 * layer is the right place to reject both.
 *
 * `MAX_CHAT_HISTORY_ENTRIES` intentionally sits above the configured
 * `CHAT_MAX_HISTORY_MESSAGES` default so that trimming stays a service
 * concern while this ceiling only stops pathological payloads.
 */

/**
Maximum characters accepted in a single chat message turn.
*/
const MAX_CHAT_MESSAGE_CHARS = 8000;

/**
Maximum characters accepted in the user's question.
*/
const MAX_CHAT_QUERY_CHARS = 4000;

/**
Maximum number of history turns accepted in one request.
*/
const MAX_CHAT_HISTORY_ENTRIES = 100;

export { MAX_CHAT_HISTORY_ENTRIES, MAX_CHAT_MESSAGE_CHARS, MAX_CHAT_QUERY_CHARS };
