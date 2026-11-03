import { OpenAI } from 'openai';

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
    // Leave room for reasoning as well as the short final answer.
    max_completion_tokens: 4096,
    messages: [
      {
        role: 'system',
        content:
          'You are a StrengthBot for a discord server focused on strength training, powerlifting, and general fitness. Also have a low level of sarcasm and humor in your responses. Keep responses short and concise and up to 4 sentences max.',
      },
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
