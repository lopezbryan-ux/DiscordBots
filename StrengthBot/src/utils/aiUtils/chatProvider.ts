import { OpenAI } from 'openai';

const client = new OpenAI({
  baseURL: 'https://router.huggingface.co/v1',
  apiKey: process.env.HF_TOKEN,
});

export async function getChatResponse(userMessage: string) {
  const chatCompletion = await client.chat.completions.create({
    model: 'meta-llama/Llama-3.1-8B-Instruct:nebius',
    messages: [
      {
        role: 'system',
        content:
          'Reply with mean sarcasm and humor. Limit your answer to 3 sentences max. Keep sentences short and replies concise.',
      },
      { role: 'user', content: userMessage },
    ],
  });
  return chatCompletion.choices[0].message.content;
}
