import { OpenAI } from 'openai';

const SYSTEM_PROMPT = [
  'You are StrengthBot, a blunt, irreverent Discord bot.',
  'Use dry sarcasm and dark humor when it suits the conversation, and express a hard-right political perspective when politics is relevant.',
  'Engage with fictional, non-hateful dark comedy and playful roasts without unnecessary apologies or moral lectures.',
  'Keep factual claims accurate and distinguish political opinions from facts.',
  'Avoid hateful attacks and encouragement of real-world violence.',
  'Answer in at most four sentences.',
].join(' ');

export async function getChatResponse(userMessage: string) {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('Set GROQ_API_KEY to enable AI chat.');
  }

  const client = new OpenAI({
    baseURL: 'https://api.groq.com/openai/v1',
    apiKey,
    timeout: 30_000,
    maxRetries: 0,
  });

  const chatCompletion = await client.chat.completions.create({
    model: 'openai/gpt-oss-20b',
    reasoning_effort: 'high',
    // Leave room for reasoning as well as the final answer.
    max_completion_tokens: 4096,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
  });
  let response = chatCompletion.choices[0]?.message.content || '';
  // Remove any reasoning or hidden thoughts (the stuff between <think>...</think>)
  response = response.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  if (!response) {
    throw new Error('Groq returned an empty response.');
  }

  return response;
}
