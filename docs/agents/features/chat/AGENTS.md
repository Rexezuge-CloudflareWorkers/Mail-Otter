# Mail-Otter — AI Email Chat

Scope: `packages/backend-services/src/chat/ChatService.ts`. Parent index: `../../../AGENTS.md`.

`POST /user/chat` — stateless (no persistence) but multi-turn via `history` array.

**Request**: `{ "query": "...", "applicationId": "optional", "history": [] }`
**Response**: `{ "answer": "...", "sources": [{ "vectorId", "title", "sender", "applicationId", "score" }], "truncated": false }`

**Backend flow** (`ChatService`):
1. Guard: require `EMAIL_CONTEXT_INDEX`; check daily neuron quota (`AiDailyUsageDAO`).
2. Embed query with the configured embedding model (`AI_EMBEDDING_MODEL`, default `@cf/baai/bge-m3`); record usage.
3. Query Vectorize using user namespace (`EmailContextUtil.getUserVectorNamespace`); filter by `applicationId` in-memory.
4. Take top `CHAT_CONTEXT_TOP_K` matches; build system prompt from vector metadata (`title`, `sender`, `indexedText`).
5. Call the configured summary model (`AI_SUMMARY_MODEL`, default `@cf/google/gemma-4-26b-a4b-it`) with locale-aware system prompt (`contentLanguage` if `applicationId` → `preferredLanguage` → `en`), trimmed history (`slice(-CHAT_MAX_HISTORY_MESSAGES)`, sets `truncated`), and query; reasoning models get `chat_template_kwargs: { thinking: false }`, `temperature: 0.3`, `max_tokens: CHAT_MAX_RESPONSE_TOKENS`.
6. Record usage; return answer + source citations.

No D1 migration needed. Usage tracked via `ai_daily_usage`.

**Frontend**: `ChatView`, `useChat` hook, `chatService.ts` — mailbox filter, message bubbles (user right plain text, assistant left GFM Markdown via shared `Markdown` component — raw HTML stripped, links open in new tab), collapsible citations, textarea/Ask; Enter sends, Shift+Enter newline.
