// Task prompts of the embedding model. Documents and queries are embedded with different prefixes
// (EmbeddingGemma convention). If the model changes, change them here and rebuild the index.

const MAX_EMBED_CHARS = 2000

export const documentPrompt = (
  title: string,
  heading: string | null,
  text: string,
): string =>
  `title: ${heading ? `${title} > ${heading}` : title} | text: ${text}`.slice(
    0,
    MAX_EMBED_CHARS,
  )

export const queryPrompt = (query: string): string =>
  `task: search result | query: ${query}`.slice(0, MAX_EMBED_CHARS)
