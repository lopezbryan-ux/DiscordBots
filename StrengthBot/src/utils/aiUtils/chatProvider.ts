import { OpenAI } from 'openai';

const client = new OpenAI({
  baseURL: 'https://router.huggingface.co/v1',
  apiKey: process.env.HF_TOKEN,
});

export async function getChatResponse(userMessage: string) {
  const chatCompletion = await client.chat.completions.create({
    model: 'Qwen/QwQ-32B:nebius',
    messages: [
  { role: 'system', content: 'Reply concisely with a bit sarcasm and humor but also be jokingly and sarcastically informative if a genuine question is asked. Use internet memes and slang when appropriate. Limit your answer to 5 sentences at most. Keep emoji use to a minimum.' },
      { role: 'user', content: userMessage }
    ],
  });
  return chatCompletion.choices[0].message.content;
}
